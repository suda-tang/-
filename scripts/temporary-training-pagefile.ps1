param([switch]$Restore)
$ErrorActionPreference = 'Stop'
$taskRuntime = Join-Path (Split-Path $PSScriptRoot -Parent) '.sites-runtime\voice-reference\training\mentor-full-v1'
New-Item -ItemType Directory -Path $taskRuntime -Force | Out-Null
$taskBackup = Join-Path $taskRuntime 'pagefile-original.json'
$taskResult = Join-Path $taskRuntime 'pagefile-change.json'
try {
    $taskAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $taskAdmin) { throw 'Administrator privileges are required.' }
    if ($Restore) {
        $taskOriginal = Get-Content -LiteralPath $taskBackup -Raw | ConvertFrom-Json
        $taskAdded = Get-CimInstance Win32_PageFileSetting | Where-Object Name -EQ 'D:\pagefile.sys'
        if (-not ($taskOriginal.settings | Where-Object Name -EQ 'D:\pagefile.sys')) { $taskAdded | Remove-CimInstance }
        foreach ($taskSetting in $taskOriginal.settings) {
            $taskCurrent = Get-CimInstance Win32_PageFileSetting | Where-Object Name -EQ $taskSetting.Name
            if ($taskCurrent) { $taskCurrent | Set-CimInstance -Property @{InitialSize=[uint32]$taskSetting.InitialSize;MaximumSize=[uint32]$taskSetting.MaximumSize} | Out-Null }
        }
        Get-CimInstance Win32_ComputerSystem | Set-CimInstance -Property @{AutomaticManagedPagefile=[bool]$taskOriginal.automatic} | Out-Null
    } else {
        $taskDisk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID = 'D:'"
        if ($taskDisk.FreeSpace -lt 70GB) { throw 'D drive has insufficient free space.' }
        if (-not (Test-Path -LiteralPath $taskBackup)) {
            @{automatic=(Get-CimInstance Win32_ComputerSystem).AutomaticManagedPagefile;settings=@(Get-CimInstance Win32_PageFileSetting | Select-Object Name,InitialSize,MaximumSize)} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $taskBackup -Encoding UTF8
        }
        Get-CimInstance Win32_ComputerSystem | Set-CimInstance -Property @{AutomaticManagedPagefile=$false} | Out-Null
        $taskExisting = Get-CimInstance Win32_PageFileSetting | Where-Object Name -EQ 'D:\pagefile.sys'
        if ($taskExisting) {
            $taskExisting | Set-CimInstance -Property @{InitialSize=[uint32]32768;MaximumSize=[uint32]49152} | Out-Null
        } else {
            New-CimInstance -ClassName Win32_PageFileSetting -Property @{Name='D:\pagefile.sys';InitialSize=[uint32]32768;MaximumSize=[uint32]49152} | Out-Null
        }
        # The CIM provider may reset existing entries when adding a new drive.
        $taskOriginal = Get-Content -LiteralPath $taskBackup -Raw | ConvertFrom-Json
        foreach ($taskSetting in $taskOriginal.settings) {
            if ($taskSetting.Name -ne 'D:\pagefile.sys') {
                Get-CimInstance Win32_PageFileSetting | Where-Object Name -EQ $taskSetting.Name | Set-CimInstance -Property @{InitialSize=[uint32]$taskSetting.InitialSize;MaximumSize=[uint32]$taskSetting.MaximumSize} | Out-Null
            }
        }
    }
    @{success=$true;restored=[bool]$Restore;requiresRestart=$true;settings=@(Get-CimInstance Win32_PageFileSetting | Select-Object Name,InitialSize,MaximumSize)} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $taskResult -Encoding UTF8
} catch {
    @{success=$false;error=$_.Exception.Message} | ConvertTo-Json | Set-Content -LiteralPath $taskResult -Encoding UTF8
    exit 1
}
