# Security policy / 安全政策

MCP Tripwire 0.1.x is a Windows preview. It has not received an independent security audit. Do not deploy it as your only protection for privileged or sensitive workloads.

## Threat model

The broker checks MCP traffic explicitly routed through it. It can reject unapproved or changed tool manifests and matching payload, blacklist and frozen behaviour rules in blocking mode. It does not control Agent built-in tools, direct network connections, operating-system access or traffic that bypasses the broker.

Rule and route HMAC keys reside in the same user account as their data. They detect modification when the key remains trustworthy; they are not protection against an attacker controlling that account. Manifest pins and global mode settings do not currently have equivalent authenticated storage. Audit hash chains detect inconsistencies, not wholesale replacement by someone with write access. Local administrators are outside the protection boundary.

HTTP request bodies and buffered JSON replies are limited to 8 MiB. SSE streams, connection/session counts and child-process resources still need further resource hardening. Remote MCP authentication compatibility, including OAuth and mTLS, requires additional client-specific validation.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting for this repository if enabled. If it is unavailable, open an issue requesting a private reporting channel **without exploit details, secrets or private logs**. Never post credentials or live user configurations. Maintainers should enable private reporting under the repository's Security settings before a stable release.

Provide the version, affected transport, expected/observed behaviour and a minimal synthetic reproduction. Do not test destructive payloads against production MCP servers.

## Downloads

Windows builds are currently unsigned by a commercial Authenticode certificate. SHA-256 checksums help check file consistency; they do not independently authenticate a publisher. The release workflow prepares GitHub build attestations and draft releases; verify that an attestation actually exists for the downloaded version. Do not disable antivirus or Windows security protections to install the app.

## 中文说明

本项目是 Windows 预览版，只保护经过程序的 MCP 请求，不是沙箱或系统级防火墙。尚未完成独立安全审计，不能作为高权限或敏感场景的唯一防线。

发现漏洞请优先使用仓库的私密漏洞报告；不可用时，只提交“申请私密反馈渠道”的 Issue，不公开利用方法、本机配置、密钥或日志。报告请使用模拟服务和非破坏性样例。
