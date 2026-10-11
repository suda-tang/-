param(
 [string]$ReleaseId='406112603',
 [string]$AssetDirectory=(Join-Path $PSScriptRoot '..\.sites-runtime\personal-release')
)
$ErrorActionPreference='Stop'
function Write-UploadLog([string]$Message){ Write-Output "$(Get-Date -Format s) $Message" }
$assetRoot=(Resolve-Path $AssetDirectory).Path
$originalLocation=Get-Location
Push-Location $assetRoot
$manifest=Get-Content -Raw (Join-Path $assetRoot 'runtime-manifest.json')|ConvertFrom-Json
$credentialText="protocol=https`nhost=github.com`n`n"|git credential fill
$credential=@{};foreach($line in $credentialText){$pair=$line-split'=',2;if($pair.Length -eq 2){$credential[$pair[0]]=$pair[1]}}
if(-not $credential.password){throw 'GitHub upload credential unavailable'}
$basic=[Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("$($credential.username):$($credential.password)"))
$headers=@{Authorization="Basic $basic";Accept='application/vnd.github+json';'User-Agent'='Codex'}
try {
 $release=Invoke-RestMethod -Uri "https://api.github.com/repos/suda-tang/-/releases/$ReleaseId" -Headers $headers -TimeoutSec 90
 $existing=@($release.assets.name)
 foreach($name in @($manifest.assets.name)+@('runtime-manifest.json','runtime-inventory.json')){
  if($name -in $existing){Write-UploadLog "SKIP $name";continue}
  $path=Join-Path $assetRoot $name
  if(-not(Test-Path -LiteralPath $path)){throw "Missing local asset: $name"}
  Write-UploadLog "UPLOAD $name"
  $config=@("url = `"https://uploads.github.com/repos/suda-tang/-/releases/$ReleaseId/assets?name=$name`"",'request = "POST"',"header = `"Authorization: Basic $basic`"",'header = "Accept: application/vnd.github+json"','header = "User-Agent: Codex"','header = "Content-Type: application/octet-stream"',"upload-file = `"$name`"",'fail','silent','show-error','http1.1','retry = 5','retry-delay = 10','connect-timeout = 45','max-time = 14400')
  $config|& curl.exe --config -
  if($LASTEXITCODE -ne 0){throw "Upload failed: $name ($LASTEXITCODE)"}
  Write-UploadLog "DONE $name"
 }
 Write-UploadLog 'COMPLETE'
} finally { Pop-Location; Remove-Variable basic,credentialText,credential,headers -ErrorAction SilentlyContinue }
