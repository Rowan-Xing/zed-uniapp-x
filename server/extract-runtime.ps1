[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Archive,
    [Parameter(Mandatory = $true)][string]$Destination,
    [string]$NodeCommand = 'node'
)
$ErrorActionPreference = 'Stop'
# Keep the old developer command usable; all hosts share the Node extractor.
& $NodeCommand (Join-Path $PSScriptRoot 'extract-runtime.cjs') $Archive $Destination
if ($LASTEXITCODE -ne 0) { throw 'Runtime extraction failed.' }
