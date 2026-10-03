// Product explanations, displayed beside the event name in parentheses.
// Keep the raw event and structured details available for technical review.
export const AUDIT_TEXT = {
  'manifest-state-rejected': ['工具清单记录异常', '校验未通过，已拒绝请求，请恢复可信备份', 'Manifest storage rejected', 'Validation failed; the request was refused. Restore a trusted backup'],
  'advanced-blocked': ['已阻断请求', '命中黑名单或已确认基线规则', 'Request blocked', 'Matched a blacklist or confirmed baseline rule'],
  'advanced-notice': ['请求需核对', '发现规则命中，当前只记录', 'Request needs review', 'A rule matched; the request was only recorded'],
  'advanced-settings-saved': ['进阶防护已保存', '黑名单和基线规则已更新', 'Advanced protection saved', 'Blacklist and baseline rules updated'],
  'baseline-frozen': ['行为基线已确认', '后续按这份固定样本检查', 'Baseline confirmed', 'Future calls are checked against this frozen sample'],
  'console-agent-config-added': ['已添加 Agent 配置', '记住了配置位置', 'Agent configuration added', 'Configuration location saved'],
  'audit-history-cleaned': ['历史记录已整理', '旧版误报已清理', 'Audit history cleaned', 'Legacy false alerts cleaned'],
  'remote-config-rejected': ['远程配置异常', '已拒绝异常配置', 'Remote configuration rejected', 'Changed configuration rejected'],
  'remote-config-saved': ['远程配置已保存', '配置已校验保存', 'Remote configuration saved', 'Configuration signed and saved'],
  'tripwire-start': ['通道保护已启动', '程序已接到这个工具前面，开始检查请求', 'Channel protection started', 'Tripwire is checking requests to this tool'],
  'console-listening': ['界面服务已启动', '本机管理页面已就绪', 'Console started', 'The local management page is ready'],
  'audit-chain-ok': ['审计记录校验通过', '检查过的记录能接上，内容校验一致', 'Audit check passed', 'Checked records link together and their contents match'],
  'audit-chain-broken': ['记录校验异常', '记录未能接上，请检查', 'Audit check failed', 'Records do not link; review needed'],
  'tools-list': ['读取工具清单', '查看这个通道提供了哪些工具', 'Tool list read', 'Checked which tools this channel provides'],
  'tools-call': ['调用工具', '已放行请求', 'Tool called', 'Request allowed'],
  'manifest-unpinned': ['工具清单待批准', '还没有确认信任这份清单；阻断模式会拒绝调用', 'Tool list awaits approval', 'This list has not been approved; calls are refused in block mode'],
  'RUG-PULL-SUSPECTED': ['工具清单发生变化', '清单与上次批准的不一样，需要重新检查；也可能是正常更新', 'Tool list changed', 'The list differs from the approved one and needs review; a normal update can cause this'],
  'static-finding': ['工具描述需留意', '描述命中了可疑文字规则，需要核对，不代表已经攻击', 'Tool description needs review', 'Metadata matched a suspicious text rule; this is not proof of an attack'],
  'tool-risk': ['工具能力提示', '这个工具有读写文件或执行程序等能力，能力本身不等于恶意', 'Tool capability notice', 'This tool can perform sensitive operations; the capability itself is not malicious'],
  'argument-blocked': ['已拦截可疑参数', '请求参数命中了拦截规则，未交给工具执行', 'Suspicious arguments blocked', 'Arguments matched a blocking rule and the request was not forwarded'],
  'argument-suspicious': ['参数需留意', '参数命中了可疑规则，当前只记录并继续放行', 'Arguments need review', 'Arguments matched a suspicious rule; the request was logged and allowed'],
  'enforced-block': ['已阻断工具清单', '清单变化或严重规则命中，工具清单没有交给 Agent', 'Tool list blocked', 'A changed list or critical finding prevented the list reaching the Agent'],
  'enforced-strip': ['已隐藏部分工具', '有问题的工具已从返回清单中移除', 'Tools hidden', 'Flagged tools were removed from the returned list'],
  'baseline-deviation': ['行为变化提醒', '与先前样本不同，供你核对；不会仅凭这条提醒拦截', 'Behaviour change notice', 'This differs from earlier samples; the notice alone does not block a call'],
  'baseline-error': ['行为学习失败', '本次基线读取或保存失败，需要检查文件权限', 'Behaviour learning failed', 'Reading or saving the baseline failed; check file permissions'],
  'channel-approved': ['通道已批准', '已信任当前工具清单，后续会检查是否变化', 'Channel approved', 'The current tool list was approved and later changes will be checked'],
  'protection-changed': ['保护模式已切换', '已更新观察或阻断模式', 'Protection mode changed', 'Observe or block mode was updated'],
  'protect-all': ['批量接入保护', '已把可处理的通道接到本程序', 'Channels enrolled', 'Supported channels were routed through Tripwire'],
  'console-wrap': ['通道已接入', '已备份配置并把通道接到本程序', 'Channel enrolled', 'Configuration was backed up and the channel routed through Tripwire'],
  'console-restore': ['已恢复配置', '已用之前的备份还原 Agent 配置', 'Configuration restored', 'Agent configuration was restored from its backup'],
  'revert-all': ['已撤销接入', '已恢复备份并清除本程序的远程路由', 'Enrollment reverted', 'Backups were restored and Tripwire remote routes cleared'],
  'new-tool-detected': ['发现新通道', '配置里多了一个通道，是否已接入请看后续记录', 'New channel found', 'A channel appeared in configuration; later records show whether it was enrolled'],
  'tool-changed': ['通道配置变化', '工具启动方式或地址变了，也可能是接入保护或正常更新', 'Channel configuration changed', 'Its launch command or address changed, possibly due to enrollment or a normal update'],
  'tool-removed': ['通道已移除', '配置中不再有这个通道', 'Channel removed', 'This channel is no longer in configuration'],
  'discovery-seeded': ['通道发现已初始化', '已记住当前配置，用来发现后续变化', 'Discovery initialized', 'Current configuration was recorded to detect later changes'],
  'auto-enrolled': ['新通道已自动接入', '已备份并接入保护，批准状态仍需核对', 'Channel automatically enrolled', 'The channel was backed up and enrolled; approval status still needs review'],
  'auto-enroll-failed': ['自动接入失败', '配置未能完成接入，请查看具体错误', 'Automatic enrollment failed', 'Enrollment could not finish; inspect the error details'],
  'discovery-error': ['通道发现失败', '本次读取或比较配置失败', 'Discovery failed', 'Configuration could not be read or compared'],
  'request': ['收到请求', 'Agent 向工具发来了一条请求', 'Request received', 'The Agent sent a request to the tool'],
  'response': ['收到回复', '工具返回了一条回复', 'Response received', 'The tool returned a response'],
  'server-notification': ['收到工具通知', '工具主动发来通知，不是一次调用', 'Tool notification received', 'The tool sent a notification rather than a call'],
  'sensitive-request': ['访问资源或提示词', '记录一次资源读取、提示词读取或采样请求', 'Resource or prompt request', 'Recorded a resource read, prompt read or sampling request'],
  'server-exit': ['工具进程退出', '工具进程结束，退出原因见详情', 'Tool exited', 'The tool process ended; details contain the exit reason'],
  'decoy-tools-armed': ['诱饵工具已启用', '已添加用于发现异常调用的测试陷阱', 'Decoy tools enabled', 'Trap tools were added to detect suspicious calls'],
  'decoy-triggered': ['诱饵调用已拦截', '有人调用了测试陷阱，没有转发给真实工具', 'Decoy call blocked', 'A trap tool was called and the request was not forwarded'],
  'canary-exfil': ['诱饵数据外发已拦截', '请求带有本程序放置的测试秘密，已阻止发送', 'Canary data blocked', 'The request contained a planted test secret and was not forwarded'],
  'activity': ['记录执行活动', '记录了通道里的执行信息，旁路观察不会阻断', 'Execution activity recorded', 'Execution data was recorded; this audit-only bridge does not block'],
  'bridge-listening': ['旁路观察已启动', '开始记录本地通道活动，这种模式不拦截', 'Audit bridge started', 'Local channel activity is being recorded; this mode does not block'],
  'bridge-peer': ['识别到连接程序', '连接来自允许的程序', 'Connection identified', 'The connecting process is allowed'],
  'bridge-peer-unknown': ['连接程序未识别', '未能确认是哪一个进程发起连接', 'Connection unidentified', 'The connecting process could not be identified'],
  'bridge-unexpected-peer': ['连接程序不在允许名单', '发现其他程序连接这个通道，请核对', 'Unexpected connecting process', 'A process outside the allowlist connected; review it'],
  'bridge-refused': ['已拒绝连接', '未允许的程序没有接入通道', 'Connection refused', 'An unapproved process was prevented from connecting'],
  'http-proxy-listening': ['远程转发已启动', '本机已就绪，可以转发受保护的远程通道', 'Remote relay started', 'The local relay is ready for protected remote channels'],
  'remote-added': ['远程通道已添加', '已保存远程服务地址和本地转发路由', 'Remote channel added', 'The remote address and local relay route were saved'],
  'unreadable': ['记录无法读取', '这一行日志格式不完整或不正确', 'Unreadable record', 'This log line is incomplete or incorrectly formatted'],
  'console-port-in-use': ['界面端口被占用', '已有程序使用这个端口，可能已经启动过', 'Console port in use', 'Another process uses this port; Tripwire may already be running'],
  'console-error': ['界面服务错误', '本机管理服务遇到错误，具体原因见详情', 'Console error', 'The local console encountered an error; see details'],
  'api-error': ['管理操作失败', '本次管理请求未能完成，具体原因见详情', 'Management request failed', 'A management request could not finish; see details'],
  'http-proxy-error': ['远程转发服务错误', '本机转发服务遇到错误', 'Remote relay error', 'The local relay encountered an error'],
  'inspector-error': ['请求检查失败', '本次检查遇到程序错误，请核对通道状态', 'Inspection failed', 'Inspection encountered an error; check channel status'],
  'upstream-error': ['远程连接失败', '没有成功连接到目标服务，可能是地址或网络问题', 'Remote connection failed', 'The target could not be reached; check its address and network'],
  'spawn-failed': ['工具启动失败', '没能启动目标工具进程', 'Tool launch failed', 'The target tool process could not be started'],
  'server-spawn-error': ['工具进程启动错误', '启动工具时系统返回了错误', 'Tool process launch error', 'The system reported an error launching the tool'],
  'upstream-write-failed': ['请求发送失败', '请求没有成功写入目标工具', 'Request send failed', 'The request could not be written to the target tool'],
  'downstream-write-failed': ['回复发送失败', '回复没有成功写回 Agent', 'Response send failed', 'The response could not be written back to the Agent'],
  'host-parse-error': ['Agent 数据无法解析', 'Agent 发来的数据格式不完整或不正确', 'Agent data unreadable', 'Data from the Agent was incomplete or malformed'],
  'server-parse-error': ['工具数据无法解析', '工具发来的数据格式不完整或不正确', 'Tool data unreadable', 'Data from the tool was incomplete or malformed'],
  'bridge-parse-error': ['通道数据无法解析', '旁路记录收到无法识别的数据', 'Bridge data unreadable', 'The audit bridge received data it could not parse'],
  'bridge-upstream-error': ['旁路目标连接失败', '旁路无法连接到目标服务', 'Bridge target connection failed', 'The audit bridge could not reach its target'],
  'bridge-error': ['旁路服务错误', '本地旁路观察服务遇到错误', 'Bridge error', 'The local audit bridge encountered an error'],
  'open-folder-failed': ['打开文件夹失败', '系统未能打开指定文件夹', 'Folder could not open', 'The system could not open the requested folder'],
  'unknown-enforce-value': ['保护模式参数无效', '模式名称无法识别，已使用记录中的备用模式', 'Unknown protection mode', 'The mode name was not recognized; the recorded fallback was used'],
  'signal': ['程序正在停止', '收到退出信号，准备结束工具进程', 'Program stopping', 'An exit signal was received and the tool is being stopped'],
};

export function auditText(record, language = 'zh') {
  const en = language === 'en';
  const text = AUDIT_TEXT[record.event];
  let label = text?.[en ? 2 : 0] ?? record.event ?? (en ? 'Unknown event' : '未知事件');
  let note = text?.[en ? 3 : 1] ?? (en ? 'An internal event was recorded; inspect the details' : '记录了一次内部事件，具体情况见详情');
  if (record.event === 'tools-call' && record.action === 'block') { label = en ? 'Call blocked' : '调用已拦截'; note = en ? 'Request not forwarded' : '未交给工具'; }
  if (record.event === 'static-finding' && record.rule === 'cross-tool-reference') note = en ? 'Related tool mentioned' : '文档提到相关工具';
  if (record.event === 'baseline-deviation') {
    const notes = {
      'tool-first-use': ['首次使用，正在学习', 'First use; learning'],
      'argument-field-new': ['出现新参数', 'New argument field'],
      'destination-new': ['参数中出现新地址', 'New address in arguments'],
      'call-rate-spike': ['调用次数明显增多', 'Call volume increased'],
    };
    note = notes[record.rule]?.[en ? 1 : 0] ?? note;
  }
  if (record.event === 'protection-changed') note = ['block', 'protect'].includes(record.protection) ? (en ? 'Block mode enabled' : '已开启阻断模式') : (en ? 'Observe mode enabled' : '已开启观察模式');
  const short = {
    'manifest-unpinned': ['等待批准清单', 'Approval needed'],
    'RUG-PULL-SUSPECTED': ['与已批准清单不同', 'Approved list changed'],
    'static-finding': ['描述命中检查规则', 'Metadata rule matched'],
    'tool-risk': ['具备敏感操作能力', 'Sensitive capability'],
    'argument-blocked': ['参数命中拦截规则', 'Arguments blocked'],
    'argument-suspicious': ['参数需核对', 'Review arguments'],
    'enforced-block': ['未向 Agent 提供清单', 'Tool list withheld'],
    'baseline-error': ['本次学习失败', 'Learning failed'],
    'new-tool-detected': ['发现新的配置通道', 'New configured channel'],
    'tool-changed': ['启动方式或地址变化', 'Command or address changed'],
    'audit-history-cleaned': ['旧版误报已清理', 'Legacy false alerts cleaned'],
    'remote-config-rejected': ['已拒绝异常配置', 'Changed configuration rejected'],
    'remote-config-saved': ['配置已校验保存', 'Configuration signed and saved'],
  };
  if (short[record.event] && !(record.event === 'static-finding' && record.rule === 'cross-tool-reference')) note = short[record.event][en ? 1 : 0];
  return { label, note };
}
