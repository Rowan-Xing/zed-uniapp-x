# Publishing to the Zed extension registry

## Description

**A Zed port of DCloud's official uni-app x language services for UTS and UVUE.**

中文：**DCloud 官方 uni-app x 语言服务的 Zed 适配移植版。**

Provides completion, definitions, hover information, and type diagnostics using
DCloud's published local runtime. The extension supplies the Zed adapter and
protocol bridge, with verified runtime updates and rollback.

## 0.3.0 submission preparation

- The repository is public and uses the MIT license.
- The extension declares pinned Vue and TypeScript grammars.
- The LSP bridge is a separate versioned GitHub release asset, downloaded via
  Zed's Rust API and checked against a SHA-256 embedded in the extension.
- Initial runtime installation and update downloads use Zed's Rust API. The
  installer checks the official VSIX and runs 26 real checks before activation.
- Existing runtime state, update pauses, and rollback history are preserved.
- The primary README, extension messages, and settings documentation are English.
- The supported host is Windows. Other hosts return an explicit message.

## Release and submission

1. Build the deterministic bridge with `python scripts/package_bridge.py`.
2. Run the full check script, real update lifecycle, and packaged fresh-install
   test. Run the same checks in GitHub CI and verify the final code in Zed.
3. Publish the bridge archive and checksum at the URL in `bridge-release.json`.
   Verify the downloaded release bytes match the pinned hash.
4. Fork [zed-industries/extensions](https://github.com/zed-industries/extensions).
5. Add this repository as the HTTPS submodule `extensions/uniapp-x` and select
   the verified commit from its `main` branch.
6. Add the entry below to the index's `extensions.toml`, run
   `pnpm sort-extensions`, and open a PR containing only this extension.

```toml
[uniapp-x]
submodule = "extensions/uniapp-x"
version = "0.3.0"
```

Registry submission is not publication. Zed's maintainers review the PR; after
it is accepted and merged, Zed builds and distributes the extension.

## Later releases

Bump the extension and bridge version together, publish the corresponding
immutable bridge asset, and update the registry submodule commit and version in
a new PR. Runtime discovery is separate: DCloud releases can be selected locally
only after validation, while bridge changes require an extension release.

Sources: [prerequisites](https://zed.dev/docs/extensions/publishing/prerequisites),
[publishing guide](https://zed.dev/docs/extensions/publishing/publishing-guide),
[licenses](https://zed.dev/docs/extensions/publishing/license-requirements),
[maintenance](https://zed.dev/docs/extensions/publishing/updating-and-maintenance).
