using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Windows.Forms;
using Microsoft.Win32;

namespace MCPTripwire.Setup
{
    internal static class Program
    {
        [STAThread]
        private static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new SetupForm());
        }
    }

    internal sealed class SetupForm : Form
    {
        private readonly TextBox path;
        private readonly CheckBox desktopShortcut;
        private readonly Button browse;
        private readonly Button install;
        private readonly Button cancel;
        private readonly Label status;
        private readonly ProgressBar progress;

        public SetupForm()
        {
            Text = "MCP SafeTripwire 安装程序";
            StartPosition = FormStartPosition.CenterScreen;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            ClientSize = new Size(700, 450);
            BackColor = Color.FromArgb(245, 246, 248);
            Font = new Font("Segoe UI", 9F);
            AutoScaleMode = AutoScaleMode.Dpi;

            Panel header = new Panel();
            header.Dock = DockStyle.Fill;
            header.Height = 170;
            header.BackColor = Color.White;
            header.Padding = new Padding(24, 20, 24, 16);

            TableLayoutPanel headerLayout = new TableLayoutPanel();
            headerLayout.Dock = DockStyle.Fill;
            headerLayout.ColumnCount = 2;
            headerLayout.RowCount = 1;
            headerLayout.BackColor = Color.White;
            headerLayout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 80));
            headerLayout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            header.Controls.Add(headerLayout);

            PictureBox logo = new PictureBox();
            logo.Dock = DockStyle.Fill;
            logo.SizeMode = PictureBoxSizeMode.Zoom;
            logo.Margin = new Padding(0, 0, 16, 0);
            try
            {
                using (Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("logo.png"))
                {
                    if (stream != null) logo.Image = Image.FromStream(stream);
                }
            }
            catch { }
            headerLayout.Controls.Add(logo, 0, 0);

            FlowLayoutPanel titles = new FlowLayoutPanel();
            titles.FlowDirection = FlowDirection.TopDown;
            titles.WrapContents = false;
            titles.AutoSize = true;
            titles.Dock = DockStyle.Fill;
            titles.Margin = new Padding(0);
            titles.BackColor = Color.White;

            Label title = new Label();
            title.Text = "MCP SafeTripwire";
            title.Font = new Font("Segoe UI", 20F, FontStyle.Bold);
            title.ForeColor = Color.FromArgb(22, 22, 22);
            title.AutoSize = true;
            title.Margin = new Padding(0, 0, 0, 2);
            titles.Controls.Add(title);

            Label subtitle = new Label();
            subtitle.Text = "MCP 安全绊线 · 本机 MCP 安全代理";
            subtitle.Font = new Font("Segoe UI", 9.5F);
            subtitle.ForeColor = Color.FromArgb(92, 96, 102);
            subtitle.AutoSize = true;
            subtitle.Margin = new Padding(1, 0, 0, 2);
            titles.Controls.Add(subtitle);
            headerLayout.Controls.Add(titles, 1, 0);

            TableLayoutPanel body = new TableLayoutPanel();
            body.Dock = DockStyle.Fill;
            body.Padding = new Padding(24, 20, 24, 12);
            body.ColumnCount = 3;
            body.RowCount = 4;
            body.BackColor = Color.FromArgb(245, 246, 248);
            body.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            body.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            body.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            body.RowStyles.Add(new RowStyle(SizeType.Absolute, 44));
            body.RowStyles.Add(new RowStyle(SizeType.Absolute, 34));
            body.RowStyles.Add(new RowStyle(SizeType.Absolute, 28));
            body.RowStyles.Add(new RowStyle(SizeType.Absolute, 10));

            Label pathLabel = new Label();
            pathLabel.Text = "安装位置";
            pathLabel.AutoSize = true;
            pathLabel.Anchor = AnchorStyles.Left;
            pathLabel.Margin = new Padding(0, 0, 10, 8);
            body.Controls.Add(pathLabel, 0, 0);

            path = new TextBox();
            path.Text = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "MCP SafeTripwire");
            path.Dock = DockStyle.Fill;
            path.Margin = new Padding(0, 6, 8, 8);
            body.Controls.Add(path, 1, 0);
            path.SelectionStart = 0;
            path.SelectionLength = 0;

            browse = new Button();
            browse.Text = "浏览…";
            browse.AutoSize = true;
            browse.Anchor = AnchorStyles.Left;
            browse.Margin = new Padding(0, 6, 0, 8);
            browse.Click += delegate { Browse(); };
            body.Controls.Add(browse, 2, 0);

            desktopShortcut = new CheckBox();
            desktopShortcut.Text = "创建桌面快捷方式";
            desktopShortcut.Checked = true;
            desktopShortcut.AutoSize = false;
            desktopShortcut.Dock = DockStyle.Fill;
            desktopShortcut.TextAlign = ContentAlignment.MiddleLeft;
            desktopShortcut.Margin = new Padding(0, 0, 0, 6);
            body.Controls.Add(desktopShortcut, 0, 1);
            body.SetColumnSpan(desktopShortcut, 3);

            status = new Label();
            status.Text = "";
            status.ForeColor = Color.FromArgb(92, 96, 102);
            status.AutoSize = false;
            status.Dock = DockStyle.Fill;
            status.TextAlign = ContentAlignment.MiddleLeft;
            status.Margin = new Padding(0, 0, 0, 4);
            body.Controls.Add(status, 0, 2);
            body.SetColumnSpan(status, 3);

            progress = new ProgressBar();
            progress.Style = ProgressBarStyle.Marquee;
            progress.MarqueeAnimationSpeed = 20;
            progress.Visible = false;
            progress.Dock = DockStyle.Fill;
            progress.Margin = new Padding(0, 0, 0, 0);
            body.Controls.Add(progress, 0, 3);
            body.SetColumnSpan(progress, 3);

            Panel footer = new Panel();
            footer.Dock = DockStyle.Fill;
            footer.Height = 68;
            footer.BackColor = Color.White;
            footer.Padding = new Padding(24, 14, 24, 14);

            FlowLayoutPanel buttons = new FlowLayoutPanel();
            buttons.Dock = DockStyle.Right;
            buttons.AutoSize = true;
            buttons.FlowDirection = FlowDirection.LeftToRight;
            buttons.WrapContents = false;
            buttons.BackColor = Color.White;
            footer.Controls.Add(buttons);

            install = new Button();
            install.Text = "安装";
            install.Width = 110;
            install.Height = 38;
            install.FlatStyle = FlatStyle.Flat;
            install.FlatAppearance.BorderSize = 0;
            install.BackColor = Color.FromArgb(30, 30, 30);
            install.ForeColor = Color.White;
            install.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
            install.Margin = new Padding(0, 0, 8, 0);
            install.Click += delegate { InstallPackage(); };
            buttons.Controls.Add(install);

            cancel = new Button();
            cancel.Text = "取消";
            cancel.Width = 90;
            cancel.Height = 38;
            cancel.FlatStyle = FlatStyle.Flat;
            cancel.FlatAppearance.BorderColor = Color.FromArgb(210, 212, 216);
            cancel.BackColor = Color.White;
            cancel.ForeColor = Color.FromArgb(40, 40, 40);
            cancel.Margin = new Padding(0);
            cancel.Click += delegate { Close(); };
            buttons.Controls.Add(cancel);
            AcceptButton = install;
            CancelButton = cancel;

            TableLayoutPanel root = new TableLayoutPanel();
            root.Dock = DockStyle.Fill;
            root.ColumnCount = 1;
            root.RowCount = 3;
            root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            root.RowStyles.Add(new RowStyle(SizeType.Absolute, 170));
            root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
            root.RowStyles.Add(new RowStyle(SizeType.Absolute, 68));
            root.Controls.Add(header, 0, 0);
            root.Controls.Add(body, 0, 1);
            root.Controls.Add(footer, 0, 2);
            Controls.Add(root);
            Shown += delegate
            {
                CenterToScreen();
                path.SelectionStart = 0;
                path.SelectionLength = 0;
            };
        }

        private void Browse()
        {
            using (FolderBrowserDialog dialog = new FolderBrowserDialog())
            {
                dialog.Description = "选择 MCP SafeTripwire 的安装位置";
                if (dialog.ShowDialog(this) == DialogResult.OK) path.Text = dialog.SelectedPath;
            }
        }

        private void InstallPackage()
        {
            string target = path.Text.Trim();
            if (target.Length == 0)
            {
                MessageBox.Show("请选择安装位置。", "MCP SafeTripwire", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            if (Directory.Exists(target) && Directory.GetFileSystemEntries(target).Length > 0)
            {
                if (MessageBox.Show("目标目录不是空的，继续会覆盖同名文件。继续？", "MCP SafeTripwire",
                    MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes)
                {
                    return;
                }
            }

            string temp = Path.Combine(Path.GetTempPath(), "mcp-safetripwire-" + Guid.NewGuid().ToString("N"));
            string zipPath = Path.Combine(temp, "payload.zip");
            string extractPath = Path.Combine(temp, "payload");
            try
            {
                install.Enabled = false;
                cancel.Enabled = false;
                browse.Enabled = false;
                progress.Visible = true;
                Cursor = Cursors.WaitCursor;
                status.Text = "正在解压程序文件…";
                Application.DoEvents();

                Directory.CreateDirectory(temp);
                Directory.CreateDirectory(extractPath);
                using (Stream resource = Assembly.GetExecutingAssembly().GetManifestResourceStream("payload.zip"))
                {
                    if (resource == null) throw new InvalidOperationException("安装包缺少 payload.zip。");
                    using (FileStream file = File.Create(zipPath)) resource.CopyTo(file);
                }
                ZipFile.ExtractToDirectory(zipPath, extractPath);

                status.Text = "正在安装到 " + target + " …";
                Application.DoEvents();
                Directory.CreateDirectory(target);
                CopyTree(extractPath, target);

                status.Text = "正在创建快捷方式…";
                Application.DoEvents();
                if (desktopShortcut.Checked) CreateShortcut(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Desktop), "MCP SafeTripwire.lnk"), target);
                // Older builds added a Start Menu folder. Remove it so this
                // installation has only the requested desktop shortcut.
                string staleStartMenu = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "MCP SafeTripwire");
                if (Directory.Exists(staleStartMenu)) Directory.Delete(staleStartMenu, true);
                WriteRegistry(target);

                status.Text = "安装完成，正在启动…";
                Application.DoEvents();
                string wscript = Path.Combine(Environment.SystemDirectory, "wscript.exe");
                Process.Start(wscript, "\"" + Path.Combine(target, "tray.vbs") + "\"");
                MessageBox.Show("MCP SafeTripwire 已安装。\r\n\r\n关闭面板后程序仍在托盘运行；从托盘“退出”才结束服务。",
                    "MCP SafeTripwire", MessageBoxButtons.OK, MessageBoxIcon.Information);
                Close();
            }
            catch (Exception ex)
            {
                try { File.WriteAllText(Path.Combine(Path.GetTempPath(), "mcp-setup-error.txt"), ex.ToString()); } catch { }
                MessageBox.Show("安装失败：\r\n\r\n" + ex.Message, "MCP SafeTripwire", MessageBoxButtons.OK, MessageBoxIcon.Error);
                install.Enabled = true;
                cancel.Enabled = true;
                status.Text = "";
            }
            finally
            {
                Cursor = Cursors.Default;
                progress.Visible = false;
                try { if (Directory.Exists(temp)) Directory.Delete(temp, true); } catch { }
            }
        }

        private static void CopyTree(string source, string target)
        {
            foreach (string directory in Directory.GetDirectories(source, "*", SearchOption.AllDirectories))
            {
                string relative = directory.Substring(source.Length).TrimStart('\\', '/');
                Directory.CreateDirectory(Path.Combine(target, relative));
            }
            foreach (string file in Directory.GetFiles(source, "*", SearchOption.AllDirectories))
            {
                string relative = file.Substring(source.Length).TrimStart('\\', '/');
                string destination = Path.Combine(target, relative);
                Directory.CreateDirectory(Path.GetDirectoryName(destination));
                File.Copy(file, destination, true);
            }
        }

        private static void CreateShortcut(string linkPath, string installDir)
        {
            string wscript = Path.Combine(Environment.SystemDirectory, "wscript.exe");
            string tray = Path.Combine(installDir, "tray.vbs");
            string icon = Path.Combine(installDir, "assets", "logo.ico");
            object shell = Activator.CreateInstance(Type.GetTypeFromProgID("WScript.Shell"));
            try
            {
                object shortcut = shell.GetType().InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { linkPath });
                Type type = shortcut.GetType();
                type.InvokeMember("TargetPath", BindingFlags.SetProperty, null, shortcut, new object[] { wscript });
                type.InvokeMember("Arguments", BindingFlags.SetProperty, null, shortcut, new object[] { "\"" + tray + "\"" });
                type.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, shortcut, new object[] { installDir });
                type.InvokeMember("IconLocation", BindingFlags.SetProperty, null, shortcut, new object[] { icon + ",0" });
                type.InvokeMember("Description", BindingFlags.SetProperty, null, shortcut, new object[] { "MCP SafeTripwire" });
                type.InvokeMember("Save", BindingFlags.InvokeMethod, null, shortcut, null);
            }
            finally
            {
                if (shell != null && System.Runtime.InteropServices.Marshal.IsComObject(shell)) System.Runtime.InteropServices.Marshal.ReleaseComObject(shell);
            }
        }

        private static void WriteRegistry(string installDir)
        {
            string powershell = Path.Combine(Environment.SystemDirectory, "WindowsPowerShell", "v1.0", "powershell.exe");
            string script = Path.Combine(installDir, "Uninstall.ps1");
            using (RegistryKey key = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\MCP-SafeTripwire"))
            {
                key.SetValue("DisplayName", "MCP SafeTripwire");
                key.SetValue("DisplayVersion", "0.1.0");
                key.SetValue("Publisher", "luke0485");
                key.SetValue("InstallLocation", installDir);
                key.SetValue("DisplayIcon", Path.Combine(installDir, "assets", "logo.ico"));
                key.SetValue("UninstallString", "\"" + powershell + "\" -NoProfile -ExecutionPolicy Bypass -File \"" + script + "\"");
                key.SetValue("NoModify", 1, RegistryValueKind.DWord);
                key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
            }
        }
    }
}
