# 发布签名状态

当前生成的 Windows EXE 尚未取得 Authenticode 发布者签名。本机没有可用的代码签名证书。不要把文件哈希、配置 HMAC 或 GitHub 构建证明称为 Windows 代码签名，也不要承诺签名后一定不出现 SmartScreen 提示。

取得可用证书和 Windows SDK signtool 后，设置 TRIPWIRE_CERT_THUMBPRINT，执行 tools/sign.ps1；该脚本使用 SHA-256、时间戳并验证结果。必须在修改图标和注入 SEA 内容之后签名，再生成 ZIP 和 SHA256SUMS。使用 Get-AuthenticodeSignature 检查结果为 Valid。

GitHub Actions 发布流程已配置 actions/attest@v4，为 EXE 和便携 ZIP 生成构建来源证明。证明要等仓库实际运行工作流后才存在；这不能代替 Authenticode。

进阶规则文件采用本地 HMAC 校验，远程路由已有独立完整性校验。它们用于发现意外或未经对应管理接口的改动，不抵御能够同时替换文件和本地密钥的同权限攻击者。审计哈希链可发现链内改动，不是外部可信时间戳或不可伪造签名。
