# 远程配置校验 / Remote configuration integrity

远程路由由程序保存时使用 HMAC-SHA256 签名。转发前会校验；未签名、地址/策略改动、签名不匹配或密钥丢失时拒绝配置并写入审计。异常配置不会被添加操作静默重新签名。添加服务仍通过原界面完成。

Routes saved by Tripwire are signed with HMAC-SHA256 and checked before forwarding. Unsigned files, changed targets/policies, invalid signatures or missing keys fail closed and produce an audit record. The add-service operation will not silently re-sign a rejected file.

签名密钥为 routes.json.key，仅供本机使用。该机制防止只改配置文件后悄悄生效，不承诺抵挡同时能读取/修改密钥、日志和程序的本机管理员。备份和迁移时应一起保留配置与密钥；不可自动信任旧的非空未签名路由。

The local key is routes.json.key. This protects against editing the configuration alone, not an administrator who can also alter the key, logs and program. Back up both files. Non-empty legacy unsigned routes must not be silently trusted.

同样的本机 HMAC 机制用于保护模式文件、工具清单状态、进阶规则、已知通道快照和行为基线；对应的 `.key` 与数据文件必须一起备份。模式文件和进阶规则第一次保存后会留下 `.sealed` 标记；如果数据文件和密钥同时消失，程序会失败关闭，而不是静默回到观察模式或清空规则。卸载脚本删除 `routes.json` 时必须同时删除 `routes.json.key`，否则重新安装后路由会因为签名缺失而被拒绝。`serve` 默认使用 `routes.json` 里的监听地址，只有显式 `--listen` 才覆盖；绑定失败会以非零退出码结束。

The same local HMAC scheme protects the protection-mode file, manifest state, advanced rules, known-server snapshot and advisory baseline; back up each data file with its `.key`. The mode file and advanced rules leave a `.sealed` marker after their first save; if the data file and key both disappear, the product fails closed instead of silently returning to observe or clearing the rules. The uninstall script must delete `routes.json.key` together with `routes.json`; otherwise a re-install cannot save routes because the signature is missing. `serve` uses the listener saved in `routes.json` unless `--listen` is passed explicitly, and exits nonzero when binding fails.
