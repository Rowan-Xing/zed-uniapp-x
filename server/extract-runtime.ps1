[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Archive,
    [Parameter(Mandatory = $true)][string]$Destination
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
if (Test-Path -LiteralPath $Destination) { throw 'Extraction destination must be new.' }
$resolvedDestination = [System.IO.Path]::GetFullPath($Destination)
$prefix = $resolvedDestination.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
$zip = [System.IO.Compression.ZipFile]::OpenRead($Archive)
try {
    $size = [long]0
    $names = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
    if ($zip.Entries.Count -gt 150000) { throw 'VSIX has too many entries.' }
    foreach ($entry in $zip.Entries) {
        $name = $entry.FullName.Replace('\', '/')
        if ($name -match '(^/|(^|/)\.\.(/|$)|:)' -or
            (($entry.ExternalAttributes -shr 16) -band 61440) -eq 40960) {
            throw "Unsafe VSIX entry: $name"
        }
        $target = [System.IO.Path]::GetFullPath((Join-Path $resolvedDestination $name))
        if (-not $target.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase) -or
            -not $names.Add($target)) {
            throw "Invalid or duplicate VSIX entry: $name"
        }
        $size += $entry.Length
        if ($size -gt 4GB) { throw 'Expanded VSIX exceeds 4 GiB.' }
    }
} finally { $zip.Dispose() }
# Windows PowerShell's .NET Framework ZIP extractor fails on long dependency
# paths. Windows' bundled bsdtar handles them without changing OS settings.
New-Item -ItemType Directory -Path $resolvedDestination | Out-Null
$tarCommand = Join-Path $env:SystemRoot 'System32\tar.exe'
& $tarCommand -xf $Archive -C $resolvedDestination
if ($LASTEXITCODE -ne 0) { throw "VSIX extraction failed with exit code $LASTEXITCODE." }
