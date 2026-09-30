# assets

把图标放在这里，命名为 **`logo.ico`**，然后重新运行一次：

```powershell
powershell -ExecutionPolicy Bypass -File .\install-desktop-shortcuts.ps1
```

桌面快捷方式会自动使用它。要求：

- 格式：`.ico`（Windows 快捷方式只认 ico）
- 建议包含多个尺寸：256×256、48×48、32×32、16×16
- 如果拿到的是 PNG，先转成 ico（例如用 ImageMagick：`magick logo.png -define icon:auto-resize=256,48,32,16 logo.ico`）

在没有 `logo.ico` 之前，快捷方式使用系统默认图标，不影响使用。
