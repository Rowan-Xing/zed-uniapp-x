[CmdletBinding()]
param(
    [ValidateSet('status', 'check', 'rollback', 'pause', 'resume')]
    [string]$Action = 'status',
    [string]$Version,
    [string]$VsixPath,
    [string]$ZedDataDirectory = (Join-Path $env:LOCALAPPDATA 'Zed'),
    [string]$NodeCommand = 'node',
    [switch]$Force,
    [switch]$Revalidate
)
$ErrorActionPreference = 'Stop'
$sourceRoot = Split-Path -Parent $PSScriptRoot
$stateDirectory = [System.IO.Path]::GetFullPath((Join-Path $ZedDataDirectory 'extensions\work\uniapp-x'))
$arguments = @((Join-Path $sourceRoot 'server\runtime-update.cjs'), $Action, '--state-dir', $stateDirectory)
if ($Version) { $arguments += @('--version', $Version) }
if ($VsixPath) { $arguments += @('--vsix', (Resolve-Path -LiteralPath $VsixPath).Path) }
if ($Force) { $arguments += '--force' }
if ($Revalidate) { $arguments += '--revalidate' }
& $NodeCommand @arguments
if ($LASTEXITCODE -ne 0) { throw "Runtime $Action failed. The command output explains the cause." }
if ($Action -in @('check', 'rollback')) {
    Write-Host 'A changed runtime selection takes effect on the next language-server start.'
}
