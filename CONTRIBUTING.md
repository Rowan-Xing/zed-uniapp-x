# Development

The Zed adapter and LSP bridge reuse DCloud's published local language services.
Current release: 0.3.0. The repository license is MIT; runtime and grammar notices
are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Requirements

Windows, Node.js 22+ (CI uses 24), Python 3, Git, Rust/rustup, and Windows tar.
`rust-toolchain.toml` selects stable Rust, rustfmt, and `wasm32-wasip2`.
There are no npm dependencies. Keep downloaded runtimes and generated artifacts
out of Git.

```powershell
python scripts/package_bridge.py --check
.\scripts\setup.ps1
.\scripts\check.ps1
```

The checker verifies syntax, versions, Rust formatting, installer/update unit
tests, WASM, both grammars, and 26 real DCloud checks. `-StaticOnly` is a quick
syntax check and does not establish runtime compatibility.

The grammar builder downloads a pinned WASI SDK and checks out the two grammar
commits from `extension.toml`. It compiles their C sources with the same flags as
Zed's extension builder. Downloaded dependencies stay in `.cache`.
An existing SDK or source checkout can be supplied with `-WasiSdkPath`,
`-VueGrammarPath`, and `-TypeScriptGrammarPath` to `scripts/build.ps1`.

## Bridge packaging

The Rust extension embeds only installation metadata. It downloads a separately
versioned bridge archive using Zed's API, verifies SHA-256, and launches it with
Zed's Node binary. Official runtime downloads also use Zed's API.

After changes to server code, fixtures, package metadata, or packaged notices:

```powershell
python scripts/package_bridge.py
.\scripts\check.ps1
```

This produces a reproducible `dist/uniapp-x-bridge-<version>.tar.gz`, its checksum,
and `bridge-release.json`. The archive contains bridge code, the integration
runner, fixed fixtures, and licenses. It never contains DCloud's runtime.
Commit `bridge-release.json` and upload the exact asset to its declared GitHub
release URL before submitting that extension version to the registry.
Do not replace an already-published release asset; bump the version instead.

## Tests

`test/fixtures/demo` contains intentional type errors. Tests copy it into isolated
work directories. `examples/demo` is an editable sample and does not affect tests.

```powershell
node --test test/runtime-update.test.cjs test/installer.test.cjs
node test/integration.cjs --runtime 'D:\tools\dcloud-4.87.0\extension' --work test-results
node test/update-lifecycle.cjs --runtime 'D:\tools\dcloud-4.87.0\extension' --vsix 'D:\downloads\dcloud.vsix' --work test-results
node test/fresh-install.cjs --bridge dist/uniapp-x-bridge-0.3.0.tar.gz --vsix 'D:\downloads\dcloud.vsix' --work test-results
```

The first command tests transaction behavior using explicit test doubles.
The remaining commands use the real official runtime: LSP behavior, package
validation, failed checker rejection, rollback, and a fresh installation from
the published bridge archive. Revalidating 4.87.0 into a new directory tests the
installation lifecycle; it does not validate an unreleased DCloud version.

For startup or grammar changes, install the submitted commit as a development
extension and check highlighting, completion menus, F12, diagnostics, and unsaved
error clearing in Zed. Prefer CLI/protocol checks; keep GUI use brief and stop
when requested. Record the actual tested scope in `docs/validation/`.

## Runtime compatibility

The bootstrap and publisher policy live in `server/runtime-policy.json`.
Automatic candidates must pass the real checker before atomic activation.
Never bypass checks to make an upstream version install. Rollback must preserve
both copies and pause automatic updates. Existing sessions may keep the old
runtime until restarted.

DCloud 4.87.0 requires the expression-matched in-memory script-setup fix in
`server/dcloud-compat.cjs`. Do not broadly rewrite unfamiliar upstream code.
Future versions with different source run unmodified and must pass the same tests.

`server/installer.cjs` plans and applies Zed-owned downloads; `runtime-update.cjs`
provides background discovery and manual CLI updates. `runtime-state.json` is the
only authoritative runtime selection. Keep old state/history and pause settings
when upgrading the extension.

## Release checks

Update `extension.toml`, `Cargo.toml`, `Cargo.lock`, `package.json`, and serverInfo.
Repackage the bridge, build from a clean checkout, run Windows CI, and verify the
submitted code in Zed. Publish the bridge asset, then submit the registry pointer.
The registry's submodule commit must be on a branch and its version must match.
See [Publishing](docs/PUBLISHING.md).

The 0.1.0 validation files remain historical snapshots. New builds need their own
record; do not reuse old binary hashes or claim old UI results for new code.
