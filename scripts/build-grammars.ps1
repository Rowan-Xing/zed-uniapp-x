[CmdletBinding()]
param(
    [string]$WasiSdkPath,
    [string]$VueGrammarPath,
    [string]$TypeScriptGrammarPath
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$sourceRoot = Split-Path -Parent $PSScriptRoot
$cache = Join-Path $sourceRoot '.cache'
$output = Join-Path $sourceRoot 'grammars'
New-Item -ItemType Directory -Force -Path $cache, $output | Out-Null
$grammars = @(
    @{ Name = 'vue'; Repository = 'https://github.com/tree-sitter-grammars/tree-sitter-vue'; Commit = '7e48557b903a9db9c38cea3b7839ef7e1f36c693'; Source = $VueGrammarPath; Subdirectory = '' },
    @{ Name = 'typescript'; Repository = 'https://github.com/tree-sitter/tree-sitter-typescript'; Commit = '75b3874edb2dc714fb1fd77a32013d0f8699989f'; Source = $TypeScriptGrammarPath; Subdirectory = 'typescript' }
)
$receipt = Join-Path $cache 'grammar-build.json'
$expectedReceipt = 'wasi-sdk-34:' + (($grammars | ForEach-Object { $_.Commit }) -join ':')
if ((Test-Path -LiteralPath $receipt) -and
    (Get-Content -LiteralPath $receipt -Raw).Trim() -eq $expectedReceipt -and
    (Test-Path -LiteralPath (Join-Path $output 'vue.wasm')) -and
    (Test-Path -LiteralPath (Join-Path $output 'typescript.wasm'))) {
    Write-Host 'Pinned Vue and TypeScript grammars are already built.'
    return
}
if (-not $WasiSdkPath) {
    $WasiSdkPath = Join-Path $cache 'wasi-sdk-34.0-x86_64-windows'
    if (-not (Test-Path -LiteralPath (Join-Path $WasiSdkPath 'bin\clang.exe'))) {
        $archive = Join-Path $cache 'wasi-sdk-34.0-x86_64-windows.tar.gz'
        $expectedHash = 'cccb5c323a9b34f0349a9b09e8804a0a7632c68c3310f4b5f437ed57d7e71d8f'
        if (-not (Test-Path -LiteralPath $archive)) {
            Write-Host 'Downloading the pinned WASI SDK for grammar compilation...'
            Invoke-WebRequest 'https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-34/wasi-sdk-34.0-x86_64-windows.tar.gz' -OutFile $archive
        }
        if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedHash) {
            throw "WASI SDK checksum mismatch: $archive"
        }
        & tar -xzf $archive -C $cache
        if ($LASTEXITCODE -ne 0) { throw 'WASI SDK extraction failed.' }
    }
}
$clang = Join-Path $WasiSdkPath 'bin\clang.exe'
if (-not (Test-Path -LiteralPath $clang)) { throw "Missing WASI clang: $clang" }
foreach ($grammar in $grammars) {
    $checkout = $grammar.Source
    if (-not $checkout) {
        $checkout = Join-Path $cache "grammar-$($grammar.Name)"
        if (-not (Test-Path -LiteralPath (Join-Path $checkout '.git'))) {
            & git init $checkout
            if ($LASTEXITCODE -ne 0) { throw 'Grammar Git initialization failed.' }
            & git -C $checkout remote add origin $grammar.Repository
            if ($LASTEXITCODE -ne 0) { throw 'Grammar remote setup failed.' }
        }
        & git -C $checkout fetch --depth 1 origin $grammar.Commit
        if ($LASTEXITCODE -ne 0) { throw "Could not fetch $($grammar.Name) grammar." }
        & git -C $checkout checkout --detach $grammar.Commit
        if ($LASTEXITCODE -ne 0) { throw "Could not check out $($grammar.Name) grammar." }
    }
    $base = if ($grammar.Subdirectory) { Join-Path $checkout $grammar.Subdirectory } else { $checkout }
    $src = Join-Path $base 'src'
    $arguments = @('-fPIC', '-shared', '-Os', "-Wl,--export=tree_sitter_$($grammar.Name)",
        '-o', (Join-Path $output "$($grammar.Name).wasm"), '-I', $src, (Join-Path $src 'parser.c'))
    $scanner = Join-Path $src 'scanner.c'
    if (Test-Path -LiteralPath $scanner) { $arguments += $scanner }
    & $clang @arguments
    if ($LASTEXITCODE -ne 0) { throw "$($grammar.Name) grammar compilation failed." }
}
[System.IO.File]::WriteAllText($receipt, $expectedReceipt)
Write-Host 'Built pinned Vue and TypeScript grammars from source.'
