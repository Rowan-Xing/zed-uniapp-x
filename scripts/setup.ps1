[CmdletBinding()]
param(
    [string]$RuntimePath,
    [string]$VsixPath,
    [string]$ZedDataDirectory = (Join-Path $env:LOCALAPPDATA 'Zed'),
    [string]$NodeCommand = 'node',
    [switch]$ExtensionOnly,
    [switch]$Install
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$sourceRoot = Split-Path -Parent $PSScriptRoot
if ($ExtensionOnly -and -not $Install) { throw '-ExtensionOnly requires -Install.' }
if (-not $ExtensionOnly) {
$cacheRoot = Join-Path $ZedDataDirectory 'extensions\work\uniapp-x'
$policy = Get-Content -LiteralPath (Join-Path $sourceRoot 'server\runtime-policy.json') -Raw | ConvertFrom-Json
$expectedHash = $policy.bootstrapSha256
New-Item -ItemType Directory -Force -Path $cacheRoot | Out-Null
$stateFile = Join-Path $cacheRoot 'runtime-state.json'
$hasManagedState = Test-Path -LiteralPath $stateFile
if ($hasManagedState) {
    $state = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
    if ($state.schema -ne 1) { throw "Unsupported runtime state: $stateFile" }
    if ($RuntimePath -and [System.IO.Path]::GetFullPath($RuntimePath) -ne $state.active.path) {
        throw 'A managed runtime already exists. Use runtime.ps1 check/rollback, or a workspace runtimePath override.'
    }
    if ($VsixPath) { throw 'Use runtime.ps1 -Action check -VsixPath to validate an update to an existing installation.' }
    $RuntimePath = $state.active.path
}

if (-not $RuntimePath) {
    $runtimeContainer = Join-Path $cacheRoot "dcloud-$($policy.bootstrapVersion)"
    $RuntimePath = Join-Path $runtimeContainer 'extension'
    if (-not (Test-Path -LiteralPath (Join-Path $RuntimePath 'package.json'))) {
        if (Test-Path -LiteralPath $runtimeContainer) {
            throw "An incomplete runtime already exists: $runtimeContainer. Inspect it before retrying."
        }
        if (-not $VsixPath) {
            $VsixPath = Join-Path $cacheRoot "dcloud-language-services-$($policy.bootstrapVersion).vsix"
            if (-not (Test-Path -LiteralPath $VsixPath)) {
                Write-Host "Downloading official DCloud language service $($policy.bootstrapVersion) from Open VSX..."
                $downloadUrl = "$($policy.registry)/$($policy.bootstrapVersion)/file/$($policy.namespace).$($policy.name)-$($policy.bootstrapVersion).vsix"
                Invoke-WebRequest -Uri $downloadUrl -OutFile $VsixPath
            }
        }
        $VsixPath = (Resolve-Path -LiteralPath $VsixPath).Path
        if ((Get-FileHash -LiteralPath $VsixPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedHash) {
            throw "DCloud VSIX checksum mismatch: $VsixPath"
        }
        Write-Host "Extracting the verified runtime to $runtimeContainer..."
        & (Join-Path $sourceRoot 'server\extract-runtime.ps1') -Archive $VsixPath -Destination $runtimeContainer
    }
}
$RuntimePath = (Resolve-Path -LiteralPath $RuntimePath).Path
$manifest = Get-Content -LiteralPath (Join-Path $RuntimePath 'package.json') -Raw | ConvertFrom-Json
$expectedVersion = if ($hasManagedState) { $state.active.version } else { $policy.bootstrapVersion }
if ($manifest.name -ne $policy.name -or $manifest.publisher -ne $policy.namespace -or $manifest.version -ne $expectedVersion) {
    throw "Expected official DCloud $expectedVersion."
}
foreach ($required in @(
    'node_modules\typescript\lib\tsserver.js',
    'jsservice\out\tsplugins\node_modules\dcloudio\index.js',
    'indexservice\out\server\server.js',
    'vueservice\packages\vue-typescript\out\sourceFile.js'
)) {
    if (-not (Test-Path -LiteralPath (Join-Path $RuntimePath $required))) {
        throw "Incomplete DCloud runtime: $required"
    }
}
if (-not $hasManagedState) {
    [System.IO.File]::WriteAllText((Join-Path $cacheRoot 'runtime-path.txt'), $RuntimePath)
}
& $NodeCommand (Join-Path $sourceRoot 'server\runtime-update.cjs') init --state-dir $cacheRoot --runtime $RuntimePath
if ($LASTEXITCODE -ne 0) { throw 'Runtime state initialization failed.' }
}

if ($Install) {
    foreach ($required in @('extension.wasm', 'grammars\vue.wasm', 'grammars\typescript.wasm')) {
        if (-not (Test-Path -LiteralPath (Join-Path $sourceRoot $required))) {
            throw "Missing $required. Build the extension first; see README.md."
        }
    }
    $installRoot = Join-Path $ZedDataDirectory 'extensions\installed\uniapp-x'
    if (Test-Path -LiteralPath $installRoot) {
        $existingManifest = Join-Path $installRoot 'extension.toml'
        if (-not (Test-Path -LiteralPath $existingManifest)) {
            throw "A different extension occupies $installRoot. No files were overwritten."
        }
        $existingText = Get-Content -LiteralPath $existingManifest -Raw
        if ($existingText -notmatch '(?m)^id\s*=\s*"uniapp-x"\s*$' -or
            $existingText -notmatch 'repository\s*=\s*"https://github.com/Rowan-Xing/zed-uniapp-x"') {
            throw "A different extension occupies $installRoot. No files were overwritten."
        }
    }
    New-Item -ItemType Directory -Force -Path $installRoot | Out-Null
    foreach ($item in @('extension.toml', 'extension.wasm', 'languages', 'grammars', 'licenses', 'LICENSE', 'THIRD_PARTY_NOTICES.md')) {
        Copy-Item -LiteralPath (Join-Path $sourceRoot $item) -Destination $installRoot -Recurse -Force
    }
    Write-Host "Installed local extension: $installRoot"
    Write-Host 'In Zed, run "zed: reload extensions" from the command palette, or reopen Zed.'
}
if (-not $ExtensionOnly) {
    Write-Host "DCloud local runtime: $RuntimePath"
    Write-Host "Runtime state: $stateFile"
}
