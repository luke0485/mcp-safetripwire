# Windows binaries and open-source releases

Use GitHub Releases for end users. The automatically generated "Source code" ZIP is not the executable. Upload a stable-named `tripwire.exe`, a portable desktop ZIP, and `SHA256SUMS.txt` as release assets.

The checked-in Windows release workflow runs tests, builds the Node SEA executable, smoke-tests it, creates a portable ZIP, and prepares a **draft** release for version tags. Review the binaries and publish that draft in GitHub. No release is published merely by editing files locally.

## Maintainer steps

1. Create the public repository and push this source tree.
2. Set the package version and commit the changes. Use a matching tag, for example `v0.1.0`.
3. Push the version tag. Check the Windows build result in Actions.
4. Download and test the assets on a clean Windows x64 machine without Node installed.
5. Review and publish the draft release.
6. Add a README download button linking to `https://github.com/OWNER/REPO/releases/latest/download/tripwire.exe` and another to `https://github.com/OWNER/REPO/releases/latest/download/MCP-Tripwire-windows-x64.zip`. Replace OWNER/REPO with the actual repository; these are templates, not live downloads yet.

Double-clicking the standalone EXE opens the console. For the tray and desktop shortcut, extract the portable ZIP and double-click `Start MCP Tripwire.cmd`. It includes `dist/tripwire.exe`, the tray scripts, and icons; users do not need Node or npm. Extract the whole ZIP before launching.

## Local build

```powershell
npm ci
npm test
powershell -ExecutionPolicy Bypass -File tools/build.ps1 -SkipInstall
dist/tripwire.exe doctor
powershell -ExecutionPolicy Bypass -File tools/package-release.ps1
```

Build on Windows x64 using Node 24. Version tags must match package.json.

Signing uses `tools/sign.ps1` and a publisher's certificate. Sign before calculating checksums and creating the ZIP. The initial workflow does not provision a signing certificate; unsigned binaries can trigger Windows publisher warnings. `docs/SIGNING.md` covers signing. Agent icon trademarks are documented separately in `assets/agents/README.md`.

GitHub reference: https://docs.github.com/en/repositories/releasing-projects-on-github/linking-to-releases
