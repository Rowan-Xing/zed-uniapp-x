[CmdletBinding()]
param(
    [string]$RuntimePath = $env:UNIAPP_X_RUNTIME,
    [string]$NodeCommand = 'node',
    [string]$BuildDirectory = (Join-Path $PSScriptRoot '..\.cache\cargo-target'),
    [string]$TestDirectory = (Join-Path $PSScriptRoot '..\test-results'),
    [switch]$StaticOnly
)
$ErrorActionPreference = 'Stop'
$sourceRoot = Split-Path -Parent $PSScriptRoot

Push-Location $sourceRoot
try {
    Write-Host 'Checking JavaScript syntax...'
    foreach ($directory in @('server', 'test')) {
        foreach ($file in Get-ChildItem -LiteralPath $directory -Filter '*.cjs' -File -Recurse) {
            & $NodeCommand --check $file.FullName
            if ($LASTEXITCODE -ne 0) { throw "JavaScript syntax check failed: $($file.Name)" }
        }
    }

    Write-Host 'Checking PowerShell syntax...'
    foreach ($file in Get-ChildItem -LiteralPath 'scripts', 'server' -Filter '*.ps1' -File) {
        $parseTokens = $null
        $parseErrors = $null
        [System.Management.Automation.Language.Parser]::ParseFile(
            $file.FullName, [ref]$parseTokens, [ref]$parseErrors
        ) | Out-Null
        if ($parseErrors.Count -gt 0) {
            throw "PowerShell syntax check failed: $($file.Name): $($parseErrors -join '; ')"
        }
    }

    $package = Get-Content -LiteralPath 'package.json' -Raw | ConvertFrom-Json
    foreach ($manifestPath in @('Cargo.toml', 'extension.toml')) {
        $manifestText = Get-Content -LiteralPath $manifestPath -Raw
        $version = [regex]::Match($manifestText, '(?m)^version\s*=\s*"([^"]+)"').Groups[1].Value
        if ($version -ne $package.version) {
            throw "$manifestPath version '$version' differs from package.json '$($package.version)'."
        }
    }

    Write-Host 'Checking Rust formatting...'
    & cargo fmt --all -- --check
    if ($LASTEXITCODE -ne 0) { throw 'Rust formatting check failed. Run cargo fmt --all.' }
    if ($StaticOnly) {
        Write-Host 'Static checks passed. Build and real-runtime integration checks were not run.'
        return
    }
    Write-Host 'Checking update transactions, failure isolation, and rollback...'
    & $NodeCommand --test (Join-Path $sourceRoot 'test\runtime-update.test.cjs')
    if ($LASTEXITCODE -ne 0) { throw 'Runtime update tests failed.' }

    if (-not $RuntimePath -and $env:LOCALAPPDATA) {
        $statePath = Join-Path $env:LOCALAPPDATA 'Zed\extensions\work\uniapp-x\runtime-state.json'
        $pointer = Join-Path $env:LOCALAPPDATA 'Zed\extensions\work\uniapp-x\runtime-path.txt'
        if (Test-Path -LiteralPath $statePath) {
            $RuntimePath = (Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json).active.path
        } elseif (Test-Path -LiteralPath $pointer) {
            $RuntimePath = (Get-Content -LiteralPath $pointer -Raw).Trim()
        }
    }
    if (-not $RuntimePath) {
        throw 'Run scripts/setup.ps1 first, or pass -RuntimePath <official DCloud extension directory>.'
    }
    $RuntimePath = (Resolve-Path -LiteralPath $RuntimePath).Path
    $runtimeManifest = Get-Content -LiteralPath (Join-Path $RuntimePath 'package.json') -Raw | ConvertFrom-Json
    if ($runtimeManifest.name -ne 'hbuilderx-language-services' -or $runtimeManifest.publisher -ne 'dcloud-ide') {
        throw 'Integration checks require the official DCloud runtime.'
    }

    Write-Host 'Building the extension...'
    & (Join-Path $PSScriptRoot 'build.ps1') -BuildDirectory $BuildDirectory

    Write-Host 'Running integration checks against the real DCloud runtime...'
    & $NodeCommand (Join-Path $sourceRoot 'test\integration.cjs') --runtime $RuntimePath --work $TestDirectory
    if ($LASTEXITCODE -ne 0) { throw 'Integration checks failed. Inspect the report in the test directory.' }
    Write-Host 'All checks passed. No extension installation was performed.'
} finally {
    Pop-Location
}
