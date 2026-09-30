# Turns a logo bitmap into assets\logo.ico (multi-size) for the desktop shortcut.
#
# Background removal is a FLOOD FILL from the image border, not a colour key.
# That distinction is the whole point:
#   - the white "MCP" lettering is enclosed by the blue shield, so it is never
#     reached from the border and therefore never erased;
#   - the light-grey rim is not white, so the fill stops at it and it survives.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\tools\make-icon.ps1 -Source C:\path\logo.jpg

param(
    [Parameter(Mandatory = $true)][string]$Source,
    [string]$OutDir = '',
    [int]$Tolerance = 35
)

$ErrorActionPreference = 'Stop'

# Resolved here rather than in the param block: $PSScriptRoot is not populated
# while default parameter values are being evaluated.
if ([string]::IsNullOrEmpty($OutDir)) { $OutDir = Join-Path $PSScriptRoot '..\assets' }

Add-Type -AssemblyName System.Drawing

$csharp = @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;

public static class TripwireIcon
{
    static byte[] _px; static int _stride, _w, _h;

    static int Lum(int i) { return (_px[i + 2] * 299 + _px[i + 1] * 587 + _px[i] * 114) / 1000; }

    static bool IsNearWhite(int i, int tol)
    {
        return _px[i] >= 255 - tol && _px[i + 1] >= 255 - tol && _px[i + 2] >= 255 - tol;
    }

    public static string Run(string srcPath, string outDir, int tol, int[] sizes)
    {
        var log = new List<string>();
        using (var src = new Bitmap(srcPath))
        using (var bmp = new Bitmap(src.Width, src.Height, PixelFormat.Format32bppArgb))
        {
            using (var g = Graphics.FromImage(bmp)) g.DrawImage(src, 0, 0, src.Width, src.Height);
            _w = bmp.Width; _h = bmp.Height;

            var rect = new Rectangle(0, 0, _w, _h);
            var data = bmp.LockBits(rect, ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
            _stride = data.Stride;
            _px = new byte[_stride * _h];
            System.Runtime.InteropServices.Marshal.Copy(data.Scan0, _px, 0, _px.Length);

            // ---- flood fill the background from every border pixel ----
            var visited = new bool[_w * _h];
            var stack = new Stack<int>();
            for (int x = 0; x < _w; x++) { PushSeed(stack, visited, x, 0, tol); PushSeed(stack, visited, x, _h - 1, tol); }
            for (int y = 0; y < _h; y++) { PushSeed(stack, visited, 0, y, tol); PushSeed(stack, visited, _w - 1, y, tol); }

            int cleared = 0;
            while (stack.Count > 0)
            {
                int p = stack.Pop();
                int x = p % _w, y = p / _w;
                int i = y * _stride + x * 4;
                _px[i + 3] = 0; cleared++;
                if (x > 0) PushSeed(stack, visited, x - 1, y, tol);
                if (x < _w - 1) PushSeed(stack, visited, x + 1, y, tol);
                if (y > 0) PushSeed(stack, visited, x, y - 1, tol);
                if (y < _h - 1) PushSeed(stack, visited, x, y + 1, tol);
            }

            // ---- de-halo: shave the near-white fringe the JPEG left behind,
            //      while staying well clear of the grey rim (~lum 205) ----
            for (int pass = 0; pass < 2; pass++)
            {
                int hardLimit = pass == 0 ? 236 : 224;
                byte newAlpha = pass == 0 ? (byte)0 : (byte)120;
                var edits = new List<int>();
                for (int y = 1; y < _h - 1; y++)
                    for (int x = 1; x < _w - 1; x++)
                    {
                        int i = y * _stride + x * 4;
                        if (_px[i + 3] == 0) continue;
                        if (Lum(i) < hardLimit) continue;
                        if (_px[i - 4 + 3] == 0 || _px[i + 4 + 3] == 0 ||
                            _px[i - _stride + 3] == 0 || _px[i + _stride + 3] == 0) edits.Add(i);
                    }
                foreach (int i in edits) _px[i + 3] = newAlpha;
            }

            System.Runtime.InteropServices.Marshal.Copy(_px, 0, data.Scan0, _px.Length);
            bmp.UnlockBits(data);
            log.Add("size=" + _w + "x" + _h + " cleared=" + cleared);

            // ---- resample to each size and collect PNG payloads ----
            Directory.CreateDirectory(outDir);
            var payloads = new List<byte[]>();
            foreach (int s in sizes)
            {
                using (var small = new Bitmap(s, s, PixelFormat.Format32bppArgb))
                {
                    using (var g2 = Graphics.FromImage(small))
                    {
                        g2.InterpolationMode = InterpolationMode.HighQualityBicubic;
                        g2.PixelOffsetMode = PixelOffsetMode.HighQuality;
                        g2.CompositingQuality = CompositingQuality.HighQuality;
                        g2.SmoothingMode = SmoothingMode.HighQuality;
                        var ia = new ImageAttributes();
                        ia.SetWrapMode(WrapMode.TileFlipXY);
                        g2.DrawImage(bmp, new Rectangle(0, 0, s, s), 0, 0, _w, _h, GraphicsUnit.Pixel, ia);
                    }
                    using (var ms = new MemoryStream()) { small.Save(ms, ImageFormat.Png); payloads.Add(ms.ToArray()); }
                }
            }

            File.WriteAllBytes(Path.Combine(outDir, "logo-256.png"), payloads[0]);
            File.WriteAllBytes(Path.Combine(outDir, "logo-128.png"), payloads[1]);

            // ---- assemble the ICO container ----
            string icoPath = Path.Combine(outDir, "logo.ico");
            using (var fs = new FileStream(icoPath, FileMode.Create))
            using (var bw = new BinaryWriter(fs))
            {
                bw.Write((short)0); bw.Write((short)1); bw.Write((short)sizes.Length);
                int offset = 6 + 16 * sizes.Length;
                for (int i = 0; i < sizes.Length; i++)
                {
                    int s = sizes[i];
                    bw.Write((byte)(s >= 256 ? 0 : s));
                    bw.Write((byte)(s >= 256 ? 0 : s));
                    bw.Write((byte)0); bw.Write((byte)0);
                    bw.Write((short)1); bw.Write((short)32);
                    bw.Write(payloads[i].Length); bw.Write(offset);
                    offset += payloads[i].Length;
                }
                foreach (var p in payloads) bw.Write(p);
            }

            // ---- diagnostics: prove the important pixels survived ----
            Func<int, int, string> at = (x, y) => { int i = y * _stride + x * 4; return "A" + _px[i + 3] + " B" + _px[i] + " G" + _px[i + 1] + " R" + _px[i + 2]; };
            log.Add("corner(2,2)      = " + at(2, 2));
            log.Add("body(center)     = " + at(_w / 2, (int)(_h * 0.72)));
            log.Add("rim(left mid)    = " + at((int)(_w * 0.045), _h / 2));
            return string.Join("\n", log);
        }
    }

    static void PushSeed(Stack<int> stack, bool[] visited, int x, int y, int tol)
    {
        int p = y * _w + x;
        if (visited[p]) return;
        int i = y * _stride + x * 4;
        if (!IsNearWhite(i, tol)) return;
        visited[p] = true;
        stack.Push(p);
    }
}
'@

Add-Type -TypeDefinition $csharp -Language CSharp -ReferencedAssemblies System.Drawing

$resolved = (Resolve-Path $Source).Path
$out = [System.IO.Path]::GetFullPath($OutDir)
$result = [TripwireIcon]::Run($resolved, $out, $Tolerance, @(256, 128, 64, 48, 32, 16))
Write-Host $result
Write-Host ("wrote: " + (Join-Path $out 'logo.ico'))
