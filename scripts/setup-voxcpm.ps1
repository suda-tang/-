$ErrorActionPreference = "Stop"
$runtime = "D:/PianoCoachRuntime/voxcpm"
New-Item -ItemType Directory -Force -Path $runtime | Out-Null
& "C:/Users/mail/AppData/Local/Programs/Python/Python312/python.exe" -m venv --system-site-packages "$runtime/venv"
if ($LASTEXITCODE -ne 0) { throw "Unable to create VoxCPM environment" }
& "$runtime/venv/Scripts/python.exe" -m pip install voxcpm soundfile --index-url https://pypi.tuna.tsinghua.edu.cn/simple --timeout 20 --retries 1 --progress-bar off
if ($LASTEXITCODE -ne 0) { throw "VoxCPM installation failed" }
& "$runtime/venv/Scripts/python.exe" -c "import voxcpm; print('VoxCPM installed')"
