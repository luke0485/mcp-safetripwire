# 远程配置校验 / Remote configuration integrity

远程路由由程序保存时使用 HMAC-SHA256 签名。转发前会校验；未签名、地址/策略改动、签名不匹配或密钥丢失时拒绝配置并写入审计。异常配置不会被添加操作静默重新签名。添加服务仍通过原界面完成。

Routes saved by Tripwire are signed with HMAC-SHA256 and checked before forwarding. Unsigned files, changed targets/policies, invalid signatures or missing keys fail closed and produce an audit record. The add-service operation will not silently re-sign a rejected file.

签名密钥为 routes.json.key，仅供本机使用。该机制防止只改配置文件后悄悄生效，不承诺抵挡同时能读取/修改密钥、日志和程序的本机管理员。备份和迁移时应一起保留配置与密钥；不可自动信任旧的非空未签名路由。

The local key is routes.json.key. This protects against editing the configuration alone, not an administrator who can also alter the key, logs and program. Back up both files. Non-empty legacy unsigned routes must not be silently trusted.
