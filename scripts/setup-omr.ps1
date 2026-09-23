param([string]$Installer)
$ErrorActionPreference = 'Stop'
$projectPath = Split-Path -Parent $PSScriptRoot
$enginePath = Join-Path $projectPath '.sites-runtime/omr'
New-Item -ItemType Directory -Force -Path $enginePath | Out-Null
$downloadedInstaller = [string]::IsNullOrWhiteSpace($Installer)
if ($downloadedInstaller) {
    $Installer = Join-Path $enginePath 'Audiveris-5.11.0-windows-x86_64.msi'
    $downloader = Join-Path $projectPath 'scripts/download-audiveris.py'
    if (Test-Path -LiteralPath $downloader) {
        & python $downloader $Installer
        if ($LASTEXITCODE -ne 0) { throw 'Audiveris download failed.' }
    } else {
        Invoke-WebRequest -Uri 'https://github.com/Audiveris/audiveris/releases/download/5.11.0/Audiveris-5.11.0-windows-x86_64.msi' -OutFile $Installer
    }
}
$installerPath = (Resolve-Path -LiteralPath $Installer).Path
if ((Get-Item -LiteralPath $installerPath).Length -lt 1000000) { throw 'The installer is incomplete.' }
$downloadHash = (Get-FileHash -LiteralPath $installerPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($downloadedInstaller -and $downloadHash -ne 'ac221b0d39a90e32b7f43dbf9f5d5a45ff8b5424076af21b65278955688dac71') { throw 'The downloaded Audiveris installer failed SHA-256 verification.' }
$extractPath = Join-Path $enginePath 'extracted'
New-Item -ItemType Directory -Force -Path $extractPath | Out-Null
$arguments = '/a "' + $installerPath + '" /qn TARGETDIR="' + $extractPath + '"'
$process = Start-Process -FilePath 'msiexec.exe' -ArgumentList $arguments -WindowStyle Hidden -Wait -PassThru
if ($process.ExitCode -ne 0) { throw "Audiveris extraction failed: $($process.ExitCode)" }
$engine = Get-ChildItem -LiteralPath $extractPath -Recurse -Filter Audiveris.exe | Select-Object -First 1
if (-not $engine) { throw 'Audiveris.exe was not found in the extracted installer.' }
Write-Host 'Audiveris is ready. Return to the browser and click Retry recognition.'
