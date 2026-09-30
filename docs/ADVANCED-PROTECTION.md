# 进阶防护与发布核对（2026-09-30）

- Pi Agent：用户 ~/.pi/agent/mcp.json 与项目 .pi/mcp.json；JSON MCP 配置读写。
- Hermes Agent：~/.hermes/config.yaml；YAML mcp_servers 配置读写，保留其他字段和注释。
- Command Code：~/.commandcode/mcp.json、已发现项目 .mcp.json、~/.commandcode/projects 下本地配置。共用配置文件避免重复批量接入。
- 产品目录新增 Pi 和 Command Code；Hermes 从仅列出产品升级为配置适配。目录共56项，默认配置适配30项。列出产品不代表每个产品已经实机验证。

设置页新增工具名黑名单、目标域名黑名单、固定行为基线及可选新增参数字段检查。观察模式只记录新规则命中，阻断模式在转发前拒绝命中请求。stdio 与 HTTP 使用相同检查器。

基线只由当前已批准通道的放行调用建立，每个工具至少20次；用户确认后固定，不会随异常自动学习。历史记录校验失败时拒绝固定。首次调用、样本不足不作为攻击。新目标和字段可能是正常业务变化，默认只提醒；人工复核后可选主动阻断。

域名规则检查请求参数里的目标引用，不是网络防火墙，不能证明请求确实连接该域名。新规则检查 tools/call；不会代替 Agent 的系统权限隔离，无法管住绕过 Tripwire 的进程、网络或文件访问。Hermes OAuth/mTLS 和三个 Agent 的真实客户端运行尚未验证。

测试仅使用临时目录、模拟 MCP 请求及本地测试服务。没有改动用户 Agent 配置，没有启动恶意程序，也没有在本机做危险攻击实践。Windows 发布者签名未完成，参见 SIGNING.md；GitHub 构建证明待首次工作流运行。
