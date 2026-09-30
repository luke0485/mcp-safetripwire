# Windows binaries and open-source releases

Use GitHub Releases for end users. The automatically generated "Source code" ZIP is not the executable. Upload a stable-named `tripwire.exe`, a portable desktop ZIP, and `SHA256SUMS.txt` as release assets.

Public release names do not use numbered versions. The first release is “初版 / Initial preview”, using the `initial` tag. Later releases use descriptive `preview-*` tags and the title “Windows 预览版 / Windows preview”. Package-manager and build metadata may retain an internal version field; it is not the public release name.

The Windows workflow tests and builds the executable and portable ZIP. The explicitly authorized initial tag publishes a prerelease after successful checks; later descriptive preview tags prepare drafts for review. No release is published merely by editing files locally.

## Maintainer steps

1. Create the public repository and push this source tree.
2. Commit the source and documentation. Use `initial` for the first publication, or a descriptive nonnumeric tag such as `preview-refined` for later releases.
3. Push the tag. Check the Windows build result in Actions.
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

Build on Windows x64 using Node 24. Keep public release names descriptive, without numbered versions.

Signing uses `tools/sign.ps1` and a publisher's certificate. Sign before calculating checksums and creating the ZIP. The initial workflow does not provision a signing certificate; unsigned binaries can trigger Windows publisher warnings. `docs/SIGNING.md` covers signing. Agent icon trademarks are documented separately in `assets/agents/README.md`.

GitHub reference: https://docs.github.com/en/repositories/releasing-projects-on-github/linking-to-releases
