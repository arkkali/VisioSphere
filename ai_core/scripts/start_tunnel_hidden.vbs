' VisioSphere Cloudflare Tunnel — hidden launcher.
' Runs run_tunnel.bat with NO console window so the tunnel runs in the
' background after logon. To stop it: stop_tunnel.bat (or Task Manager).
CreateObject("WScript.Shell").Run "cmd /c ""C:\Users\Allen\Desktop\VisioSphere\VisioSpere-\ai_core\scripts\run_tunnel.bat""", 0, False
