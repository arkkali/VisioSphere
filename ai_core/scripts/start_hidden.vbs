' VisioSphere AI core — hidden launcher.
' Runs run_ai_core.bat with NO console window, so the AI core can't be closed
' by accident. It keeps running in the background after logon.
'
' To STOP it: run stop_ai_core.bat (kills the launcher AND python so it does
' not auto-restart). Or use Task Manager.
CreateObject("WScript.Shell").Run "cmd /c ""C:\Users\Allen\Desktop\VisioSphere\VisioSphere-\ai_core\scripts\run_ai_core.bat""", 0, False
