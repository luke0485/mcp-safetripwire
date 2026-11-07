# Windows 下载

推荐下载 **MCP-SafeTripwire-Setup.exe**，双击安装（不需要管理员权限）。安装程序会创建桌面快捷方式，并登记“应用和功能”里的卸载入口。

也可以下载 **MCP-SafeTripwire-windows-x64.zip** 作为便携版：完整解压，双击 **Start MCP SafeTripwire.cmd**。两种方式都包含程序、托盘和原生 WebView2 面板，无需安装 Node.js 或自行编译。面板使用 Windows 10/11 随 Edge 提供的 WebView2 Runtime；如果系统提示缺少 WebView2，安装 Microsoft Edge WebView2 Runtime 即可。

接入 MCP 后重启 Agent，批准可信工具清单，再开启保护模式；自动识别不了的 MCP 才需要在“URL 接入”里手动接入。关闭面板仍保持后台运行，从托盘退出才结束服务。

程序未签名。核对官方来源后，如 Windows 提示未知发布者，可在系统允许时选择“更多信息 → 仍要运行”。SHA256SUMS.txt 提供文件校验摘要。

持续进行安全审计和功能补充，后续推进 Mac 和 Linux。
