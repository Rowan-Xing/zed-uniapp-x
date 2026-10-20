# uni-app x for Zed

A Zed port of DCloud's official local uni-app x language services.

Provides completion, completion details, go to definition, hover information,
and type diagnostics for `.uts` and `.uvue`, including `<script setup lang="uts">`.
Semantic analysis and platform types come from DCloud's published runtime.

[中文说明](README.zh-CN.md) · [Development](CONTRIBUTING.md) ·
[Publishing](docs/PUBLISHING.md) · [Changelog](CHANGELOG.md)

## Installation

Version **0.3.0** targets Windows. Registry submission is being prepared;
the extension is not yet available in Zed's extension catalog.
After it is accepted, search for **uni-app x** in Zed's Extensions panel.

For a development installation, follow [Development](CONTRIBUTING.md), then use
Zed's **Install Dev Extension** action and select this repository.

Open the root of a uni-app x project, then open a `.uts` or `.uvue` file.
On first launch, the extension:

1. Downloads the fixed-version bridge release through Zed's extension API and
   verifies its pinned SHA-256 before extraction.
2. Downloads DCloud 4.87.0 from Open VSX through the same API.
3. Verifies the VSIX checksum and package identity, then runs 26 real
   language-service checks on isolated fixtures before selecting the runtime.

No PowerShell setup command is required for a gallery/development-extension
installation. Zed provides Node.js; Windows `tar.exe` must be available on PATH.
Initial setup may take a minute or more. Zed shows installation progress; if it
fails, check the language-server log and restart the language server to retry.
Later starts reuse the downloaded files.

The bridge and runtime stay in Zed's extension work directory. Project source
is processed locally; the installer and regression suite do not upload it.
Downloads require access to GitHub Releases and Open VSX.

## Using the extension

Open a project containing `manifest.json` and `pages.json`, with `"uni-app-x": {}`
in its manifest. The examples use the HBuilderX directory layout. CLI `src`
layout detection exists but has not received the same coverage.

- Type `uni.` and invoke **editor: show completions** for official API suggestions.
- Use **Go to Definition** / F12 on an imported function or `uni.request`.
- Hover over a symbol for its type.
- Edit a type error: diagnostics update without saving the file.

Try `examples/demo/sample.uts`, `pages/index/index.uvue`, and
`pages/options/options.uvue`. The demo contains intentional errors for testing.

Normal `.vue` files remain the responsibility of Zed's
[Vue extension](https://github.com/zed-extensions/vue). This extension registers
only `.uts` and `.uvue`.

## Runtime updates and rollback

Automatic discovery is enabled by default and limited to one registry check per
24 hours per extension work directory. It runs at language-server startup and
while the service is running. Closing Zed stops background checks.

When a newer stable release is found during editing, Zed displays a message.
On the next language-server start, the Rust adapter downloads the VSIX through
Zed's API, verifies it, and runs all 26 checks. Only a passing candidate becomes
active. A failed update keeps the previous runtime. Old versions and receipts
remain available for rollback. No runtime is bundled with the extension.

This changes the 0.2 background-download behavior: discovery still runs in the
background; downloading and validation happen when the language server starts.
The bridge itself is pinned to the extension version and updated with the extension.

Management commands from a source checkout (Node.js 22+):

```powershell
.\scripts\runtime.ps1                         # status and retained versions
.\scripts\runtime.ps1 -Action check           # immediate manual check and validation
.\scripts\runtime.ps1 -Action rollback        # previous runtime; pauses automatic updates
.\scripts\runtime.ps1 -Action resume          # enable automatic updates again
.\scripts\runtime.ps1 -Action pause
```

Restart the language server after a manual update or rollback. Reinstalling the
extension preserves the selected runtime, history, and pause setting.
Old packages are not automatically deleted.

## Settings

The project target defaults to `platformConfig.json`. The verified sample target
is `APP-ANDROID`. Example `.zed/settings.json`:

```json
{
  "lsp": {
    "uniapp-x": {
      "initialization_options": {
        "targets": ["APP-ANDROID"],
        "locale": "en",
        "autoUpdate": true
      }
    }
  }
}
```

Optional settings:

| Setting | Effect |
| --- | --- |
| `runtimePath` | Absolute path to an extracted official DCloud extension. Opts this workspace out of managed runtime installation and updates. |
| `autoUpdate: false` | Disables automatic discovery and updates for this workspace; first installation still works. Use `pause` for all workspaces sharing this installation. |
| `diagnostics: false` | Disables type diagnostics from this service. |

Restart the language server after changing runtime or target settings.

## Scope

- Windows is the supported host for this release. macOS and Linux startup returns
  a clear unsupported-platform message; those hosts have not been validated.
- Android fixtures cover UTS, ordinary UVUE scripts, and script setup. They do not
  establish full support for iOS, Web, HarmonyOS, or large projects.
- Highlighting uses pinned TypeScript and Vue Tree-sitter grammars; UTS-specific
  syntax may not be fully represented.
- Template/CSS support, native platform types, refactoring, and complex generics
  have not been fully tested. Build, run, device debugging, rename, and code actions
  are outside this release's scope.
- DCloud 4.87.0 needs a narrow in-memory script-setup compatibility fix. Original
  runtime files are unchanged. Future runtimes must pass the same regression gate.

Validation records are in [docs/validation](docs/validation).
The 0.1.0 records in `VALIDATION.md` and `verification.json` describe that release,
not later builds. Third-party sources and licenses are listed in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

[DCloud language service documentation](https://doc.dcloud.net.cn/uni-app-x/tutorial/ls-plugin.html)
