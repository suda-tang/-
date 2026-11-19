$ErrorActionPreference='Continue'
$python='D:/PianoCoachRuntime/voxcpm/venv/Scripts/python.exe'
for($attempt=0;$attempt -lt 360;$attempt++) {
 if(Test-Path $python) {
  & $python -c "import voxcpm, torch, soundfile" 2>$null
  if($LASTEXITCODE -eq 0) { & $python -u scripts/synthesize-voxcpm-trial.py; if($LASTEXITCODE -eq 0) { & $python -u scripts/synthesize-voxcpm-report.py }; exit $LASTEXITCODE }
 }
 Start-Sleep -Seconds 10
}
throw 'VoxCPM dependency installation did not finish within one hour'
