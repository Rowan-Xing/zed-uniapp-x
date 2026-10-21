# Configuration and runtime management

[Back to README](../README.md)

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

On macOS, use the Node entry point with Zed's extension work directory (adjust
the path if using a custom data directory):

```sh
state="$HOME/Library/Application Support/Zed/extensions/work/uniapp-x"
node server/runtime-update.cjs status --state-dir "$state"
node server/runtime-update.cjs check --state-dir "$state"
node server/runtime-update.cjs rollback --state-dir "$state"
node server/runtime-update.cjs resume --state-dir "$state"
```

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

- Windows is supported. macOS Apple Silicon is available for
  [on-device validation](MACOS-VALIDATION.md); Intel Mac is untested. Linux startup
  returns an unsupported-platform message.
- Android fixtures cover UTS, ordinary UVUE scripts, and script setup. They do not
  establish full support for iOS, Web, HarmonyOS, or large projects.
- Highlighting uses pinned TypeScript and Vue Tree-sitter grammars; UTS-specific
  syntax may not be fully represented.
- Template/CSS support, native platform types, refactoring, and complex generics
  have not been fully tested. Build, run, device debugging, rename, and code actions
  are outside this release's scope.
- DCloud 4.87.0 needs a narrow in-memory script-setup compatibility fix. Original
  runtime files are unchanged. Future runtimes must pass the same regression gate.

Validation records are in [docs/validation](validation).
The 0.1.0 records in `VALIDATION.md` and `verification.json` describe that release,
not later builds. Third-party sources and licenses are listed in
[THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).

[DCloud language service documentation](https://doc.dcloud.net.cn/uni-app-x/tutorial/ls-plugin.html)
