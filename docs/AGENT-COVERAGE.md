# Agent 适配清单（2026-09-30）

目录包含 57 个条目（56 个产品及自定义入口）与离线图标；其中 30 个默认配置适配器。产品名录、图标、自动接入是不同层级。未公开配置或云端服务不等于本机可拦截。指定配置文件入口支持 JSON/JSONC/TOML 中已识别的 MCP 结构，识别只保存位置、不改配置；纳管操作才会备份并改写对应 MCP 条目。

|厂商|产品|默认识别配置|图标|
|---|---|---|---|
|OpenAI|Codex|~\.codex\config.toml|离线产品图标|
|Anysphere|Cursor|~\.cursor\mcp.json|离线产品图标|
|Anthropic|Claude Desktop|~\AppData\Roaming\Claude\claude_desktop_config.json|离线产品图标|
|ByteDance|TRAE CLI|~\.trae\traecli.toml|离线产品图标|
|Alibaba|Qoder CLI|~\.qoder\settings.json|离线产品图标|
|Alibaba|Qwen Code|~\.qwen\settings.json|离线产品图标|
|Tencent|CodeBuddy Code|~\.codebuddy\mcp.json|离线产品图标|
|Moonshot AI|Kimi Code|~\.kimi-code\mcp.json|离线产品图标|
|Anthropic|Claude Code|~\.claude.json|离线产品图标|
|Z.ai / 智谱|ZCode|~\.zcode\cli\config.json|离线产品图标|
|Google|Gemini CLI|~\.gemini\settings.json|离线产品图标|
|GitHub / Microsoft|GitHub Copilot CLI|~\.copilot\mcp-config.json|离线产品图标|
|Amazon AWS|Kiro|~\.kiro\settings\mcp.json|离线产品图标|
|JetBrains|Junie|~\.junie\mcp\mcp.json|离线产品图标|
|Cognition|Windsurf / Cascade|~\.codeium\windsurf\mcp_config.json|离线产品图标|
|Cognition|Devin Desktop / Cascade|~\AppData\Roaming\devin\mcp_config.json|离线产品图标|
|Anomaly|OpenCode|~\.config\opencode\opencode.json|离线产品图标|
|Cline|Cline|~\.cline\data\settings\cline_mcp_settings.json|离线产品图标|
|Roo Code|Roo Code|~\AppData\Roaming\Code\User\globalStorage\rooveterinaryinc.roo-cline\settings\mcp_settings.json|离线产品图标|
|Alibaba|千问办公 / QwenWork|指定配置 / 手动接入|离线产品图标|
|Alibaba|Qoder IDE|指定配置 / 手动接入|离线产品图标|
|ByteDance|TRAE IDE|指定配置 / 手动接入|离线产品图标|
|ByteDance|TRAE SOLO|指定配置 / 手动接入|离线产品图标|
|Tencent|CodeBuddy IDE|指定配置 / 手动接入|离线产品图标|
|GitHub / Microsoft|GitHub Copilot (VS Code)|~\AppData\Roaming\Code\User\mcp.json|离线产品图标|
|Continue|Continue|指定配置 / 手动接入|离线产品图标|
|Block|Goose|指定配置 / 手动接入|离线产品图标|
|Augment Code|Auggie / Augment|~\.augment\settings.json|离线产品图标|
|Qodo|Qodo|指定配置 / 手动接入|离线产品图标|
|Zed Industries|Zed Agent|指定配置 / 手动接入|离线产品图标|
|Google|Antigravity|~\.gemini\config\mcp_config.json|离线产品图标|
|OpenClaw|OpenClaw|指定配置 / 手动接入|离线产品图标|
|NanoClaw|NanoClaw|指定配置 / 手动接入|离线产品图标|
|Cherry Studio|Cherry Studio|指定配置 / 手动接入|离线产品图标|
|LangGenius|Dify|指定配置 / 手动接入|离线产品图标|
|ByteDance|扣子 / Coze|指定配置 / 手动接入|离线产品图标|
|n8n|n8n AI Agent|指定配置 / 手动接入|离线产品图标|
|FlowiseAI|Flowise|指定配置 / 手动接入|离线产品图标|
|Manus|Manus|指定配置 / 手动接入|离线产品图标|
|Genspark|Genspark|指定配置 / 手动接入|离线产品图标|
|Perplexity|Perplexity Computer|指定配置 / 手动接入|离线产品图标|
|Kilo|Kilo Code|~\.config\kilo\kilo.json|离线产品图标|
|Amp|Amp|~\.config\amp\settings.json|离线产品图标|
|Factory|Droid|~\.factory\mcp.json|离线产品图标|
|iFlow / 心流|iFlow CLI|~\.iflow\settings.json|离线产品图标|
|Baidu / 百度|Comate|~\.comate\mcp.json|离线产品图标|
|Huawei / 华为|CodeArts Agent|指定配置 / 手动接入|离线产品图标|
|Nous Research|Hermes Agent|~\.hermes\config.yaml（mcp_servers）|离线产品图标|
|Pi|Pi Agent|~\.pi\agent\mcp.json|离线产品图标|
|Command Code|Command Code|~\.commandcode\mcp.json|离线产品图标|
|Alibaba|通义灵码 / Lingma|指定配置 / 手动接入|离线产品图标|
|Tencent|WorkBuddy|指定配置 / 手动接入|离线产品图标|
|Moonshot AI|Kimi Claw|指定配置 / 手动接入|离线产品图标|
|MiniMax|MiniMax Agent / Mavis|指定配置 / 手动接入|离线产品图标|
|MiniMax|MiniMax Code|指定配置 / 手动接入|离线产品图标|
|MiniMax|MiniMax Design|指定配置 / 手动接入|离线产品图标|

默认配置格式与范围依据官方资料核对：

- Claude Code: https://code.claude.com/docs/en/mcp
- ZCode: https://zcode.z.ai/en/docs/mcp-services
- Gemini CLI: https://geminicli.com/docs/tools/mcp-server/
- Copilot: https://code.visualstudio.com/docs/agents/reference/mcp-configuration
- Kiro: https://kiro.dev/docs/mcp/configuration/
- Junie: https://junie.jetbrains.com/docs/junie-cli-mcp-configuration.html
- OpenCode: https://opencode.ai/docs/mcp-servers
- Amp: https://ampcode.com/docs/cli/settings
- Droid: https://docs.factory.ai/harness/mcp
- iFlow: https://docs.iflow.cn/cli/examples/mcp/
- Kilo Code: https://github.com/Kilo-Org/kilocode/blob/main/packages/kilo-docs/pages/automate/mcp/using-in-kilo-code.md
- Auggie: https://docs.augmentcode.com/cli/config
- QwenWork: https://docs.qwenwork.ai/zh/desktop/connectors

项目配置检查范围为当前工作目录、Claude 记录的项目与 ZCode 最近项目，最多 50 个目录；不扫描全盘，不启动被发现的 Agent。插件提供的配置和云端托管 MCP 不在自动改写范围。未安装产品经隔离配置验证，不能替代真实产品联调。没有权威穷尽目录，因此不声称覆盖全球所有已发布 Agent。


