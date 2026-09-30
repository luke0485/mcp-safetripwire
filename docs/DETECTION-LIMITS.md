# 行为基线、拦截与误报 / Behaviour baselines, blocking and false positives

## 当前能力 / Current capabilities

阻断模式会检查未批准的工具通道、工具清单与批准指纹不一致、显式拒绝名单、严重的静态载荷规则，以及诱饵工具/测试秘密。观察模式记录规则命中，不把这些提示当成成功拦截。显式拒绝策略仍优先。stdio 和受支持的 HTTP 路由共用检查器。

Block mode checks unapproved channels, changed approved tool lists, explicit deny rules, critical static payload rules, decoy calls and planted test secrets. Observe mode records findings without implying successful enforcement. Explicit deny policies still take precedence. stdio and supported HTTP routes share the inspector.

行为基线是每 10 分钟运行的事后提醒，不是实时行为防火墙。它只对已记录的放行调用学习参数字段、地址引用和调用计数，无法确认真实联网、工具执行结果或完整代码意图。首次使用记为信息，新字段/地址只提醒；样本少于 20 次不报调用量暴增。无调用时保留已学字段，阻断请求和无效时间戳不进入正常样本。地址只是参数中的引用，不是已发生的网络连接。

The baseline is retrospective advice every ten minutes, not a real-time behavioural firewall. It learns field names, address references and counts from recorded allowed calls. It cannot confirm actual network access, execution results or code intent. First use is informational; new fields/addresses are advisory. Volume spikes require at least twenty previous samples. Quiet periods retain learned fields, and refused calls/invalid timestamps are excluded. Address references are not evidence of actual connections.

持续学习的提醒基线会合并观察到的字段和地址，因此也可能学习到恶意活动。进阶防护另有人工批准的冻结基线：只从已批准通道的放行调用中建立，每个工具至少 20 次样本。开启相应规则后，阻断模式可拒绝偏离冻结基线的新地址引用及可选的新参数字段。冻结快照不会自动合并后续调用；仍没有按工作时段、调用结果和真实联网校准，也不能独立认定攻击。

The advisory baseline keeps learning and can therefore absorb malicious activity. Advanced protection has a separate manually approved frozen baseline, built from allowed calls on approved channels with at least twenty samples per tool. When configured, blocking mode rejects new destination references and optionally new parameter fields relative to that snapshot. It does not silently update the frozen snapshot. Work schedules, execution results and actual network traffic are not calibrated, and a deviation alone does not establish an attack.

## 准确度 / Accuracy

目前没有代表真实用户的标注数据集，没有可报告的生产误报率或漏报率。自动化测试验证已知正常与恶意样例、模式切换、缓存调用绕过、HTTP/stdio 一致性和审计并发；测试通过不等于检测准确率 100%。工具描述和参数中的关键字规则仍可能误报，工具升级造成指纹变化也可能是正常行为。

There is no representative labelled production dataset, so no production false-positive or false-negative rate is claimed. Tests verify known benign/malicious examples, mode changes, cached-call bypass protection, HTTP/stdio behaviour and concurrent audit writing. Passing tests does not mean 100% detection accuracy. Keyword rules can still flag legitimate metadata/arguments, and a changed fingerprint can result from a legitimate update.

仅提到同一服务里的其他工具属于普通文档上下文，现记录为信息，其他隐藏文字/载荷规则仍独立检查。检测范围是经过 Tripwire 的 MCP 通道；Agent 自带工具、旁路访问及直接网络请求不在此范围内。旁路 bridge 是只读观察，不阻断。

Mentioning a sibling tool is informational documentation context. Hidden text and payload rules are still checked independently. Coverage applies to MCP channels routed through Tripwire; Agent built-in tools, bypasses and direct network access are outside that scope. The bridge is audit-only.

## 审计记录 / Audit records

旧版本每个进程缓存自己的链头，同时追加会把链分叉。新版使用跨进程文件锁，并在锁内重新读取链头。相同异常不会每五分钟重复写入；恢复或出现新的异常仍会报告。用户要求清理旧版误报时，清理工具先归档原始日志，删除已知旧版误报和调试噪声，调整错误等级，重新建立链并写入迁移记录和原始文件摘要。内容修改的校验异常和载荷命中会保留。

Older writers cached separate chain heads and concurrent appends could fork the chain. New writers use a cross-process file lock and re-read the head inside it. Repeated failures are suppressed. When the user requests legacy cleanup, the one-time tool archives the original, removes known legacy false alerts/debug noise, adjusts severity, rebuilds the chain and adds a migration record with the original file digest. Content-edit mismatches and payload findings remain available.

哈希链用于发现记录间不一致，不能防止有写权限的人重写整条链；日志只有有限保留窗口。锁争用/磁盘错误时日志追加可能失败，程序优先保持代理转发。它不是远端存证或不可篡改的审计系统。

The hash chain detects inconsistencies but does not prevent an actor with write access from rebuilding the entire chain. Retention is bounded. Lock contention or disk failures can prevent an append; proxy forwarding takes priority. This is not remote attestation or an immutable audit system.
