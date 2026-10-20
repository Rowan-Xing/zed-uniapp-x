# Project maintenance

- This repository adapts DCloud's official local uni-app x language services to
  Zed for `.uts` and `.uvue`. Keep public descriptions focused on that function.
- Read README.md, CONTRIBUTING.md, and ROADMAP.md before behavioral changes.
- Preserve extension ID `uniapp-x` and existing settings where possible.
- DCloud supplies semantics. Do not substitute mock completion/type results or
  generic TypeScript diagnostics for the real official runtime.
- The Rust extension embeds installation metadata only; bridge code and official
  runtimes are downloaded through Zed's API into its work directory.
- Repackage with scripts/package_bridge.py after changes to bridge files,
  fixtures, or packaged notices. Commit bridge-release.json, rebuild WASM, and
  publish the exact checksum-pinned asset before submitting to the registry.
- Preserve runtime state/history and pause settings. Candidates must pass the
  real regression suite before atomic activation; rollback pauses auto-updates.
- Keep runtimes, build outputs, caches, and local paths out of Git. Preserve
  dependency license files and attribution.
- Executable changes require scripts/check.ps1. Installation changes additionally
  require test/fresh-install.cjs and test/update-lifecycle.cjs with the official VSIX.
- GUI checks establish editor behavior after startup, language, or grammar
  changes. Prefer CLI/protocol checks and keep GUI use minimal; stop when asked.
  Report unverified scope honestly.
- Fixed test fixtures contain intentional type errors. Do not fix them as part
  of cleanup. examples/demo is editable and independent of tests.
- Preserve VALIDATION.md and verification.json as historical 0.1.0 records.
  Add new validation records under docs/validation/ with actual versions/scope.
