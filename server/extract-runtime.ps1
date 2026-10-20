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
# Use tar for long dependency paths. Older Windows tar builds cannot represent
# Unicode command-line paths, so send the archive on stdin and set the working
# directory through .NET's Unicode process API.
New-Item -ItemType Directory -Path $resolvedDestination | Out-Null
$tarCommand = Join-Path $env:SystemRoot 'System32\tar.exe'
$tarInfo = [System.Diagnostics.ProcessStartInfo]::new()
$tarInfo.FileName = $tarCommand
$tarInfo.Arguments = '-xf -'
$tarInfo.WorkingDirectory = $resolvedDestination
$tarInfo.UseShellExecute = $false
$tarInfo.CreateNoWindow = $true
$tarInfo.RedirectStandardInput = $true
$tarInfo.RedirectStandardOutput = $true
$tarInfo.RedirectStandardError = $true
$tarProcess = [System.Diagnostics.Process]::new()
$tarProcess.StartInfo = $tarInfo
$archiveStream = [System.IO.File]::OpenRead($Archive)
try {
    if (-not $tarProcess.Start()) { throw 'Could not start Windows tar.exe.' }
    $stdout = $tarProcess.StandardOutput.ReadToEndAsync()
    $stderr = $tarProcess.StandardError.ReadToEndAsync()
    $archiveStream.CopyTo($tarProcess.StandardInput.BaseStream)
    $tarProcess.StandardInput.Close()
    $tarProcess.WaitForExit()
    [Console]::Out.Write($stdout.Result)
    [Console]::Error.Write($stderr.Result)
    if ($tarProcess.ExitCode -ne 0) {
        throw "VSIX extraction failed with exit code $($tarProcess.ExitCode)."
    }
} finally {
    $archiveStream.Dispose()
    $tarProcess.Dispose()
}
