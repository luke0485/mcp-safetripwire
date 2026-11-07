MCP 绊线 + 无害模拟攻击 MCP：测试电脑专用组合包

只在那台 Win10 测试电脑执行下面步骤，不在日常电脑运行。
整个文件夹复制到测试电脑 C:\MCP-Test。程序免安装，防护软件 tripwire.exe 已包含；runtime 是配套运行环境；server.cjs 是无害的模拟攻击 MCP。

实际链路：WorkBuddy -> tripwire.exe（正式 MCP 绊线）-> server.cjs（模拟 MCP）。

第一步：双击 0-Open-Tripwire.cmd 打开防护软件。
第二步：双击 2-Prepare-WorkBuddy.cmd。它仅生成接入配置并批准已知无害测试工具指纹，不会自动改 WorkBuddy 的配置；会在测试电脑的绊线数据目录保存测试清单。
第三步：WorkBuddy 侧边栏“插件” -> 右上角“MCP 服务器” -> “配置 MCP”。把刚打开的 WorkBuddy-MCP.json 内容粘贴到配置编辑器保存；如已有其他配置，只合并 mcpServers 里的 TripwireOfflineLab 条目，不覆盖其他 MCP。启用该服务器；必要时重启 WorkBuddy。
第四步：在 MCP 绊线界面切到“阻断模式”。本包控制台不代替这个模式开关。
第五步：向 WorkBuddy 发送：仅调用 TripwireOfflineLab 的 lab_echo，label 填 offline-check，不调用其他工具。
成功接入标准：MCP 服务器连接正常，出现 lab_echo 工具；调用返回 OFFLINE LAB，绊线审计出现 OfflineLab 的清单/工具调用记录，模拟执行次数增加。模型只口头说调用过不算成功。
第六步：双击 3-Control-Panel.cmd，选 4 禁止 lab_echo，再发送同一句。成功阻断标准：实际 MCP 返回拒绝，绊线审计有阻断，选 7 查看执行次数没有增加。
选 1 恢复正常并清空测试黑名单/基线规则；选 2 修改工具描述模拟信任叛变；选 3 加不可见字符模拟投毒。选 2/3 后刷新工具清单或停用再启用 MCP，应看到拒绝。
选 5 使用人工构造测试基线，调用 lab_echo 时 url 填 https://new.example/fake，应拒绝新域名。这是假字符串，不会打开地址。实际学习能力请另行观察，人工基线不代表学习准确率。
观察模式请在防护软件界面切换；控制台选 6 只用于隔离自测代理，不能切换正式程序的模式。
停止：双击 4-Stop-Lab.cmd，再在 WorkBuddy 停用 TripwireOfflineLab。退出防护软件请使用托盘退出。测试完可删除 WorkBuddy 里的这一个测试服务器。

1-Offline-Self-Test.cmd 是补充的一键离线回归，不需要 WorkBuddy、不需要账号，20 项场景使用相同防护引擎。它不是 WorkBuddy 实机接入的替代品。
模拟只写本包 results；没有真实秘密、没有危险命令执行、没有外网请求。所有地址都是测试字符串；HTTP 回归只连接本机回环。WorkBuddy 的模型服务自身可能需要联网。
只在专用测试电脑使用控制台：选 1/4/5 会修改测试电脑绊线的进阶规则。本包不会远程安装，也不会自动在当前电脑启动攻击模拟。
官方接入说明：https://www.workbuddy.ai/docs/zh/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/MCP-Guide