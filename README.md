<p align="center">
  <img src="https://raw.githubusercontent.com/luke0485/mcp-safetripwire/main/assets/logo-256.png" width="128" height="128" alt="MCP SafeTripwire Logo" />
</p>

<div align="center">

# MCP SafeTripwire · MCP 安全绊线

**MCP 安全绊线 · 作者 [luke0485](https://github.com/luke0485)**

[官方仓库 / Official repository](https://github.com/luke0485/mcp-safetripwire)

**让 Agent 继续工作，让 MCP 多一道检查。**

An inspectable security broker between your Agent and its MCP tools.

![Windows](https://img.shields.io/badge/Windows-x64-252525)
![License](https://img.shields.io/badge/License-MIT-555555)
[![Windows checks](https://github.com/luke0485/mcp-safetripwire/actions/workflows/ci.yml/badge.svg)](https://github.com/luke0485/mcp-safetripwire/actions)
![No LLM](https://img.shields.io/badge/Detection-No_LLM_required-555555)

[快速上手](#快速上手) · [保护什么](#保护什么) · [实测结果](#实测结果) · [开发与测试](#开发与测试) · [路线图](#路线图)

[**下载 Windows 程序包**](https://github.com/luke0485/mcp-safetripwire/releases/latest/download/MCP-SafeTripwire-windows-x64.zip) · [查看构建状态](https://github.com/luke0485/mcp-safetripwire/actions)
</div>

![Agent → SafeTripwire → MCP](assets/readme/flow.svg)

Agent 能调用工具，也可能遇到被替换的工具清单、可疑的工具描述或不该出现的调用参数。SafeTripwire 在 **已接入的 MCP 通道**中加入检查与审计，让你先看清变化，再决定是否阻断。

支持 **Windows**，Mac 和 Linux 版本将在后续推进。

由 **luke0485** 独立维护的开源 MCP 安全工具，包含工具投毒检查、工具清单完整性检查、行为基线、黑名单、主动阻断和审计日志。

Open-source Model Context Protocol (MCP) security for Windows: tool poisoning checks, manifest integrity, behavior baselines, blacklists, request blocking, and audit logging. Maintained by **luke0485**, GitHub account **luke0485**.

## 看得见的保护

![保护状态界面](assets/readme/dashboard.png)

*界面演示采用模拟数据，不代表本机流量或实际拦截统计。每个 MCP 一条通道；同一 Agent 的多个 MCP 会显示在同一组中。*

![进阶防护界面](assets/readme/protection.png)

*先观察、再确认可信行为；普通用户可从默认选项开始，自定义工具和域名黑名单按需展开。*

## 保护什么

| 能力 | 你能得到什么 |
| --- | --- |
| 工具清单指纹 | 核对并批准工具清单；后续变化会被发现，在阻断模式下拒绝相关调用 |
| 静态规则检查 | 检查工具描述与调用载荷中的已知可疑模式，不依赖额外 LLM API |
| 工具 / 域名黑名单 | 检查工具名和参数里的域名引用，匹配域名时包含其子域名 |
| 行为基线 | 记录放行调用；每个工具至少 20 次样本后，人工确认冻结正常行为，可提醒或阻断新地址引用及可选的新字段 |
| 审计与状态 | 中英文简要说明、活动趋势、通道状态、哈希链一致性检查 |
| 本机与 HTTP MCP | stdio 与支持的 HTTP / SSE 路由共用检查器 |
| Windows 托盘 | 关闭界面仍在后台运行；从托盘“退出”才结束后台服务 |

Agent 目录包含 **57 个条目**，其中 **30 个配置适配器**支持默认位置读取；可自动发现或手动接入。详见 [Agent 覆盖说明](docs/AGENT-COVERAGE.md)。


## 最新功能完善

- **每次连接都先核验**：阻断模式下，新连接先核验已批准的工具清单，再放行清单内的工具。
- **配置完整性保护**：工具清单指纹、保护模式、自定义规则与中转配置支持本机完整性校验，异常状态会明确提示。
- **更稳的长连接**：HTTP / SSE 与 stdio 增加消息大小、并发连接、会话和待回应请求限制，并支持闲置回收。
- **更克制的记录**：审计减少原始提示词、资源地址和启动参数的记录，保留工具、字段和域名等必要信息。

### Recent capability improvements

Each new connection verifies its approved tool manifest before calls are allowed in blocking mode. Local integrity checks cover manifests, protection mode, custom rules and relay configuration. Bounded messages, connections, sessions and outstanding requests improve transport stability. Audit records retain less raw content.

## 快速上手

1. 在本仓库 **Releases** 下载 `MCP-SafeTripwire-windows-x64.zip`，无需自行编译。
2. 完整解压到固定文件夹，双击 `Start MCP SafeTripwire.cmd`。无需另外安装 Node.js。
3. 点击添加，选择 Agent，检查识别到的 MCP 通道，再接入需要保护的通道。自动改写配置前会保留备份。
4. 重启对应 Agent，让配置生效；核对工具清单并批准可信通道。
5. 先使用 **观察模式**了解正常调用，随后按需要启用 **阻断模式**。

**注意：看到 Agent 图标不代表已经受到保护。** 只有经过 SafeTripwire 的 MCP 请求才会检查；观察模式通常只记录、不拒绝请求，显式拒绝策略另有优先级。行为基线应从可信操作中学习，不能盲目批准未知调用。

配置路径不在默认位置时，可手动指定配置文件。无法自动读配置的产品，只有在其支持自定义 MCP 时才能手动接入；“设置 HTTP MCP 中转”会进入远程服务页面，不会自动赋予不支持 MCP 的产品相关能力。

Windows 程序未签名，不需要购买商业签名才能使用。若系统提示“未知发布者”，核对官方来源后可选择“更多信息 → 仍要运行”（系统允许时）。下载页提供 `SHA256SUMS.txt` 校验文件。

## 实测结果

**已通过 Windows 10 + WorkBuddy 接入与调用试验，检测和审计正常运行。** 20 项离线模拟安全检查全部通过，覆盖黑名单、行为基线、工具投毒、信任叛变、清单篡改和 HTTP 请求校验。

**接入通道 → 重启 Agent → 批准可信清单 → 开启阻断。** 观察模式记录风险，阻断模式拒绝命中的调用。

详细说明见 [安全政策](SECURITY.md) 和 [检测说明](docs/DETECTION-LIMITS.md)。

## 开发与测试

建议使用 Node.js 24 和 Windows PowerShell。

```powershell
npm ci
npm test
npm run doctor
node src/cli.js console
```

自动化测试覆盖规则、黑名单、行为基线、配置适配、管理接口、审计及 stdio / HTTP 传输，使用临时目录和模拟服务。

本次生产依赖检查 `npm audit --omit=dev` 为 0 个已知漏洞；仅表示检查时依赖数据库的结果。

构建可下载的 Windows 包：

```powershell
./tools/build.ps1 -SkipInstall
./tools/package-release.ps1
```

Windows 发布工作流执行测试、构建，并生成校验摘要和构建证明。发布流程见 [发布说明](docs/RELEASING.md)。

## 路线图

- 持续进行 **安全审计、回归测试和功能补充**。
- 后续推进 **Mac 和 Linux 版本**。

欢迎提交使用反馈和功能建议；漏洞反馈请遵循 [SECURITY.md](SECURITY.md)。

## English

MCP SafeTripwire is a Windows-first, LLM-free security broker for MCP traffic explicitly routed through it. It combines reviewed manifest fingerprints, static rules, tool/domain blacklists, manually frozen behaviour baselines and local audit logging. Observe first, review trusted channels, then enable blocking when appropriate.

Successfully tested with WorkBuddy on Windows 10 for MCP integration, tool calls, detection and audit logging. All 20 offline simulated security checks passed. Continuous security audits, regression testing and feature additions will continue, with Mac and Linux versions planned.

## 作者与协作 / Credits

**作者 / Author：luke0485**

**AI 协作模型 / AI collaborators：DeepSeek V4.1 Flash、GPT6.1sol**

## 许可证

项目代码采用 [MIT License](LICENSE)。第三方 Agent 名称、商标和图标属于各自权利人，不因本项目的 MIT 许可证转授其商标权；图标来源见 [assets/README.md](assets/README.md)。
