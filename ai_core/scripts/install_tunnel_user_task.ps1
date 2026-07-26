<#
Create a Scheduled Task that runs the local `run_tunnel.bat` at user logon.
Run this script as the user who should own the task (not as SYSTEM).

Usage (PowerShell, run as the user you want the task to run as):
  Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned
  .\install_tunnel_user_task.ps1

This creates a task named `VisioSphereTunnel` that executes `run_tunnel.bat`
from this repository's `ai_core` folder at logon. It runs with the current
user credentials and will start when that user signs in.
#>

$taskName = 'VisioSphereTunnel'
$scriptPath = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Definition) 'run_tunnel.bat'

if (-not (Test-Path $scriptPath)) {
    Write-Error "run_tunnel.bat not found at $scriptPath"
    exit 1
}

$action = New-ScheduledTaskAction -Execute $scriptPath
$trigger = New-ScheduledTaskTrigger -AtLogOn
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

try {
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null
    Write-Host "Scheduled task '$taskName' created for user $env:USERDOMAIN\$env:USERNAME."
    Write-Host "You can view it in Task Scheduler (taskschd.msc)."
} catch {
    Write-Error "Failed to register scheduled task: $_"
    exit 1
}
