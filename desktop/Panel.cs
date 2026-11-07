using System;
using System.Drawing;
using System.IO;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Win32;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

// Native WebView2 host for the local console.
//
// The backend is still the Node console; this process only replaces the Edge
// app-window launch with a normal WinForms window: no address bar, no tabs, no
// browser menu. It asks the console for a one-time login code and loads that
// URL, so the long-lived token is not passed on a command line.
namespace MCPTripwire
{
    internal static class Program
    {
        [DllImport("user32.dll")]
        private static extern IntPtr FindWindow(string className, string windowName);

        [DllImport("user32.dll")]
        private static extern bool ShowWindow(IntPtr hWnd, int command);

        [DllImport("user32.dll")]
        private static extern bool SetForegroundWindow(IntPtr hWnd);

        private const int SW_RESTORE = 9;

        [STAThread]
        private static void Main(string[] args)
        {
            if (!SingleInstance.Start())
            {
                ActivateExisting();
                return;
            }

            try
            {
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                string baseUrl = GetArg(args, "--url", "http://127.0.0.1:8789");
                string tokenFile = GetArg(args, "--token-file",
                    Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".mcp-tripwire", "console.token"));
                Application.Run(new PanelForm(baseUrl, tokenFile));
            }
            finally
            {
                SingleInstance.Stop();
            }
        }

        private static void ActivateExisting()
        {
            IntPtr handle = FindWindow(null, "MCP SafeTripwire");
            if (handle != IntPtr.Zero)
            {
                ShowWindow(handle, SW_RESTORE);
                SetForegroundWindow(handle);
            }
        }

        private static string GetArg(string[] args, string name, string fallback)
        {
            for (int i = 0; i < args.Length - 1; i++)
            {
                if (String.Equals(args[i], name, StringComparison.OrdinalIgnoreCase))
                {
                    return args[i + 1];
                }
            }
            return fallback;
        }
    }

    internal static class SingleInstance
    {
        private static Mutex mutex;

        public static bool Start()
        {
            bool created;
            mutex = new Mutex(true, "MCPTripwirePanel", out created);
            return created;
        }

        public static void Stop()
        {
            if (mutex == null)
            {
                return;
            }
            try
            {
                mutex.ReleaseMutex();
            }
            catch
            {
                // Another instance already owns it.
            }
            mutex.Dispose();
            mutex = null;
        }
    }

    internal sealed class PanelForm : Form
    {
        private const int SW_RESTORE = 9;

        [DllImport("user32.dll")]
        private static extern bool ShowWindow(IntPtr hWnd, int command);

        [DllImport("user32.dll")]
        private static extern bool SetForegroundWindow(IntPtr hWnd);

        private readonly string baseUrl;
        private readonly string tokenFile;
        private readonly WebView2 webView;
        private readonly System.Windows.Forms.Timer restoreTimer;
        private int restoreAttempts;

        public PanelForm(string baseUrl, string tokenFile)
        {
            this.baseUrl = baseUrl.TrimEnd('/');
            this.tokenFile = tokenFile;

            Text = "MCP SafeTripwire";
            StartPosition = FormStartPosition.CenterScreen;
            // The form only hosts WebView2; let WinForms avoid bitmap scaling and
            // size the window to a comfortable fraction of the working area.
            AutoScaleMode = AutoScaleMode.None;
            Rectangle work = Screen.PrimaryScreen.WorkingArea;
            int width = Math.Max(1000, (int)(work.Width * 0.86));
            int height = Math.Max(650, (int)(work.Height * 0.86));
            ClientSize = new Size(Math.Min(width, work.Width - 40), Math.Min(height, work.Height - 40));
            MinimumSize = new Size(900, 600);
            ShowInTaskbar = true;

            // A hidden parent process can start a GUI child minimized. Restore
            // it once the message loop is running instead of relying on the
            // startup show state.
            restoreTimer = new System.Windows.Forms.Timer();
            restoreTimer.Interval = 200;
            restoreTimer.Tick += delegate
            {
                restoreAttempts++;
                if (WindowState == FormWindowState.Minimized) WindowState = FormWindowState.Normal;
                ShowWindow(Handle, SW_RESTORE);
                SetForegroundWindow(Handle);
                if (restoreAttempts >= 3) restoreTimer.Stop();
            };
            Shown += delegate { restoreTimer.Start(); };
            Load += delegate { restoreTimer.Start(); };

            string iconPath = FindIcon();
            if (iconPath != null)
            {
                try { Icon = new Icon(iconPath); } catch { }
            }

            webView = new WebView2();
            webView.Dock = DockStyle.Fill;
            Color surface = GetSurfaceColor();
            BackColor = surface;
            webView.DefaultBackgroundColor = surface;
            Controls.Add(webView);
            Load += OnLoad;
        }

        private static Color GetSurfaceColor()
        {
            try
            {
                using (RegistryKey key = Registry.CurrentUser.OpenSubKey(
                    @"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize"))
                {
                    object value = key == null ? null : key.GetValue("AppsUseLightTheme");
                    if (value != null && Convert.ToInt32(value) == 0)
                    {
                        return Color.FromArgb(22, 22, 22);
                    }
                }
            }
            catch
            {
                // Fall back to the light surface when the preference is unreadable.
            }
            return Color.FromArgb(241, 241, 241);
        }

        private static string FindIcon()
        {
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            string[] candidates = new string[]
            {
                Path.GetFullPath(Path.Combine(baseDir, "..", "assets", "logo.ico")),
                Path.Combine(baseDir, "assets", "logo.ico")
            };
            foreach (string candidate in candidates)
            {
                if (File.Exists(candidate))
                {
                    return candidate;
                }
            }
            return null;
        }

        private async void OnLoad(object sender, EventArgs e)
        {
            try
            {
                string token = File.ReadAllText(tokenFile).Trim();
                if (token.Length < 16)
                {
                    throw new InvalidOperationException("控制台 token 文件为空或不存在。请从托盘启动。");
                }

                string target = await GetTargetAsync(token);
                string userData = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".mcp-tripwire", "panel-webview2");
                Directory.CreateDirectory(userData);

                CoreWebView2Environment environment = await CoreWebView2Environment.CreateAsync(null, userData, null);
                await webView.EnsureCoreWebView2Async(environment);

                CoreWebView2 core = webView.CoreWebView2;
                core.Settings.AreDefaultContextMenusEnabled = false;
                core.Settings.IsStatusBarEnabled = false;
                core.Settings.AreDevToolsEnabled = true;
                core.NewWindowRequested += delegate(object s, CoreWebView2NewWindowRequestedEventArgs args)
                {
                    args.Handled = true;
                };
                try
                {
                    await core.CallDevToolsProtocolMethodAsync("Network.clearBrowserCache", "{}");
                }
                catch
                {
                    // A cache clear is best effort; the page also sends no-store.
                }
                core.Navigate(target);
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    "无法打开 MCP SafeTripwire 面板。\r\n\r\n" + ex.Message +
                    "\r\n\r\n请确认已安装 WebView2 Runtime，并从桌面快捷方式或托盘启动。",
                    "MCP SafeTripwire",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
                Close();
            }
        }

        private async Task<string> GetTargetAsync(string token)
        {
            try
            {
                using (HttpClient client = new HttpClient())
                {
                    client.Timeout = TimeSpan.FromSeconds(4);
                    client.DefaultRequestHeaders.TryAddWithoutValidation("X-Tripwire-Token", token);
                    using (HttpResponseMessage response = await client.PostAsync(baseUrl + "/api/bootstrap", null))
                    {
                        if (response.IsSuccessStatusCode)
                        {
                            string body = await response.Content.ReadAsStringAsync();
                            Match match = Regex.Match(body, "\"code\"\\s*:\\s*\"([^\"]+)\"");
                            if (match.Success)
                            {
                                return baseUrl + "/?code=" + Uri.EscapeDataString(match.Groups[1].Value);
                            }
                        }
                    }
                }
            }
            catch
            {
                // Older console builds have no /api/bootstrap; the token link is
                // still authenticated and is exchanged for a cookie by the page.
            }
            return baseUrl + "/?token=" + Uri.EscapeDataString(token);
        }
    }
}
