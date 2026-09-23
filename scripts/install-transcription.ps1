$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$transcriptionPython = Join-Path $projectRoot '.sites-runtime/performance-env/Scripts/python.exe'
$vendorPath = Join-Path $projectRoot '.sites-runtime/transcription-vendor'
if (-not (Test-Path -LiteralPath $transcriptionPython)) { throw '请先配置 performance-env 运行环境' }
& $transcriptionPython -m pip install --target $vendorPath --no-deps transkun==2.0.1 moduleconf==0.1.4 mir_eval==0.8.2 pydub==0.25.1 soxr==1.1.0 imageio-ffmpeg==0.6.0 decorator==5.3.1 pillow-heif==1.7.0
if ($LASTEXITCODE -ne 0) { throw '转录组件安装失败' }
& $transcriptionPython -m pip install --target $vendorPath --no-deps torchaudio==2.7.1+cpu --index-url https://download.pytorch.org/whl/cpu
if ($LASTEXITCODE -ne 0) { throw '音频运行库安装失败' }
& $transcriptionPython -m pip install --target $vendorPath --no-deps bs-roformer-infer==0.1.5 soundfile cffi pycparser absl-py librosa==0.11.0 audioread lazy-loader msgpack pooch numba llvmlite scikit-learn joblib threadpoolctl beartype ml-collections rotary-embedding-torch einops
if ($LASTEXITCODE -ne 0) { throw '节拍与音轨分离组件安装失败' }
