# 初版 / Initial preview

这是 MCP Tripwire 的 Windows 初版，欢迎试用和反馈。当前只提供 Windows x64；Mac 和 Linux 将在后续推进。

## 下载与启动

- 推荐下载 **MCP-Tripwire-windows-x64.zip**，完整解压后双击 **Start MCP Tripwire.cmd**，包含托盘和桌面启动所需文件，无需另装 Node.js。
- **tripwire.exe** 是独立程序；托盘使用推荐选择完整便携包。
- **MCP-Tripwire-source.zip** 是源码包。
- **SHA256SUMS.txt** 用于检查 EXE 和便携包的文件一致性。

初版已有工具清单核对、静态规则、工具和域名黑名单、人工确认行为基线、观察与阻断模式及本机审计。使用时先接入 MCP，重启对应 Agent，核对并批准工具清单，再按需要开启阻断模式。关闭界面不会结束后台服务，完全退出请使用托盘菜单。

## 仍在完善

仅保护经过 Tripwire 的 MCP 调用，不覆盖 Agent 内置工具、绕过代理的访问或系统级网络行为。尚未完成独立安全审计；部分本机存储、流式资源限制和客户端兼容性仍需完善。自动化测试通过不等于零误报或所有 Agent 的实机认证。

没有付费 Authenticode 签名，Windows 可能提示未知发布者。不要关闭系统安全保护来运行程序。校验摘要不能单独证明发布者身份。

## English

This is the initial Windows x64 preview. macOS and Linux are planned for later development. Download and fully extract the portable ZIP, then run **Start MCP Tripwire.cmd**. No separate Node.js installation is needed.

Protection applies only to MCP traffic routed through Tripwire. This is not an independently audited security product, sandbox or system firewall. Windows builds are unsigned; keep operating-system security protections enabled. Please report compatibility issues without sharing private configurations or logs, and follow SECURITY.md for vulnerabilities.
