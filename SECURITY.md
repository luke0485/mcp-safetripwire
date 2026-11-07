# Security policy / 安全政策

MCP SafeTripwire is an initial Windows preview. It has not received an independent security audit. Do not deploy it as your only protection for privileged or sensitive workloads.

## Threat model

The broker checks MCP traffic explicitly routed through it. It can reject unapproved or changed tool manifests and matching payload, blacklist and frozen behaviour rules in blocking mode. It does not control Agent built-in tools, direct network connections, operating-system access or traffic that bypasses the broker.

Rule and route HMAC keys reside in the same user account as their data. They detect modification when the key remains trustworthy; they are not protection against an attacker controlling that account. Manifest pins cover a tool's name, title, description, input and output schemas, annotations and `_meta`; object keys are sorted recursively so equivalent schemas do not produce false rug-pull alarms. Manifests above 1000 tools are rejected as malformed. Manifest pins, protection mode, custom rules, known-server snapshots, advisory baselines and relay configuration use authenticated storage. Legacy unsigned files are accepted until their next deliberate save; sealed files reject edits and signature removal. A missing protection-mode file is treated as observe only when it was never saved; after the first save a sealed marker remains, so deleting both the file and its key fails closed to protect. Advanced rules leave the same kind of marker, so deleting both the rules file and its key is rejected rather than silently clearing the blacklists. Audit hash chains detect inconsistencies, not wholesale replacement by someone with write access. Audit records larger than 64 KiB, process restarts and log rotation no longer break the chain: rotation writes a boundary record linked to the previous head. Local administrators are outside the protection boundary.

HTTP request bodies and buffered JSON replies are limited to 8 MiB. SSE events are limited to 8 MiB, sessions to 128 and outstanding requests per session to 256; each manifest is limited to 1000 tools. Audit writes cap argument-key and destination lists, and the TCP bridge stores raw code only with `--log-code`. Idle records are reclaimed. Concurrent connections within a session and child-process resources still need further hardening. The local HTTP relay authenticates Host and Origin, not the calling MCP client: any process running as the same user can use configured routes. Remote MCP authentication compatibility, including OAuth and mTLS, requires additional client-specific validation.

The console binds to loopback and requires a token in an HttpOnly cookie. The normal front end is a native WinForms + WebView2 panel; if that panel is missing, the tray falls back to a browser app window. Both open the page with a single-use, five-minute login code rather than the long-lived token, so the token does not enter a browser or panel command line. The token file and code are readable by processes running as the same user; the console is not an isolation boundary. Server-initiated `sampling/createMessage`, `elicitation/create` and `roots/list` requests are logged as sensitive requests but their content is not inspected. stdio servers receive a per-install random `TRIPWIRE_CANARY` environment value; if it appears in an outbound tool call it is blocked. HTTP routes have no env planting and keep the static test value. The TCP bridge is audit-only; `--protect` requires an allowlist, listens on loopback, pauses the client until the peer is identified, and fails closed if identification fails. Peer identity is the process image name reported by Windows, so renaming a binary can defeat it.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting for this repository if enabled. If it is unavailable, open an issue requesting a private reporting channel **without exploit details, secrets or private logs**. Never post credentials or live user configurations. Maintainers should enable private reporting under the repository's Security settings before a stable release.

Provide the version, affected transport, expected/observed behaviour and a minimal synthetic reproduction. Do not test destructive payloads against production MCP servers.

## Downloads

Windows builds are currently unsigned by a commercial Authenticode certificate. The recommended `MCP-SafeTripwire-Setup.exe` installs per-user (no administrator rights), creates a desktop shortcut and an HKCU uninstall entry, and does not modify MCP configurations until you enroll a channel in the app. SHA-256 checksums help check file consistency; they do not independently authenticate a publisher. The release workflow prepares GitHub build attestations and draft releases; verify that an attestation actually exists for the downloaded version. Do not disable antivirus or Windows security protections to install the app.

## 中文说明

本项目是 Windows 预览版，只保护经过程序的 MCP 请求，不是沙箱或系统级防火墙。尚未完成独立安全审计，不能作为高权限或敏感场景的唯一防线。

发现漏洞请优先使用仓库的私密漏洞报告；不可用时，只提交“申请私密反馈渠道”的 Issue，不公开利用方法、本机配置、密钥或日志。报告请使用模拟服务和非破坏性样例。
