# Windows publishing

Public download titles do not use numbered versions. Run the **Windows release** workflow on main to test, build and publish the Windows download under the descriptive tag `windows`.

The workflow runs the regression suite, builds the executable, builds the native WebView2 panel, smoke-tests the executable, packages the tray launcher, builds the installer and generates SHA-256 checksums and GitHub build attestations. Only the installer, executable, portable ZIP and checksum file are published. Local caches, audit logs, test results and old builds are excluded. The ZIP contains `dist/safetripwire.exe`, `dist/MCP-SafeTripwire-Panel.exe`, `MCP-SafeTripwire-Panel.exe.config`, `WebView2Loader.dll` and the two managed WebView2 SDK DLLs.

The native panel is built by `tools/build-panel.ps1`, which downloads the pinned `Microsoft.Web.WebView2` NuGet package into `tools/.cache` and compiles `desktop/Panel.cs` with the .NET Framework `csc.exe`. It requires the WebView2 Runtime at run time; Windows 10/11 normally ships it with Edge.

The recommended asset is `MCP-SafeTripwire-Setup.exe`: a per-user installer that requires no administrator rights, creates a desktop shortcut and registers an uninstall entry. `MCP-SafeTripwire-windows-x64.zip` remains the portable option: fully extract it and double-click `Start MCP SafeTripwire.cmd`; no separate Node.js installation is needed.

Commercial code signing is optional. Current downloads are unsigned. Keep checksums consistent with the actual distributed files; build attestations and checksums are separate from Authenticode signing.

For local packaging, run:

```powershell
./tools/build.ps1 -SkipInstall
./tools/package-release.ps1
./tools/build-installer.ps1
```

`tools/build-installer.ps1` embeds the portable ZIP into `dist/MCP-SafeTripwire-Setup.exe`. The installer is unsigned (commercial signing is optional and deliberately not required for this preview).

The offline test kit (`tools/package-offline-lab.ps1`) is a separate diagnostic package, not part of the public release. It now copies the same `dist/safetripwire.exe` that the release uses (there is no separately named “audited” binary), starts from a clean staging directory, and the source archive excludes offline-lab results, lock files and audit JSONL.

After changing the security behaviour, update `docs/FUNCTIONAL-TEST-REPORT.md` with the current test count and keep historical dated sections labelled as historical.
