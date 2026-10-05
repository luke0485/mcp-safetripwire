# Windows publishing

Public download titles do not use numbered versions. Run the **Windows release** workflow on main to test, build and publish the Windows download under the descriptive tag `windows`.

The workflow runs the regression suite, builds the executable, smoke-tests it, packages the tray launcher and generates SHA-256 checksums and GitHub build attestations. Only the executable, portable ZIP and checksum file are published. Local caches, audit logs, test results and old builds are excluded.

The recommended asset is `MCP-SafeTripwire-windows-x64.zip`. Users fully extract it and double-click `Start MCP SafeTripwire.cmd`; no separate Node.js installation is needed.

Commercial code signing is optional. Current downloads are unsigned. Keep checksums consistent with the actual distributed files; build attestations and checksums are separate from Authenticode signing.

For local packaging, run:

```powershell
./tools/build.ps1 -SkipInstall
./tools/package-release.ps1
```
