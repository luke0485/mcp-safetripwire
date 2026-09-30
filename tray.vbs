' Launches the tray app with no console window flash.
' The desktop shortcut targets wscript.exe with this file.
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
here = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = here
cmd = "powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & here & "\tray.ps1"""
sh.Run cmd, 0, False
