# Project maintenance

- This repository is an independent Zed extension for `.uts` and `.uvue`.
  DCloud's local runtime supplies semantics; do not replace it with mock results
  or generic TypeScript diagnostics.
- Read `README.md`, `CONTRIBUTING.md`, and `ROADMAP.md` before changing behavior.
- Preserve extension ID `uniapp-x` and its settings keys when possible.
- The supported runtime is DCloud 4.87.0. Version changes must follow the upgrade
  procedure in `CONTRIBUTING.md`, including review of the narrow compatibility patch.
- `server/*.cjs` is embedded by `src/lib.rs`. Rebuild WASM after any server change.
- Keep downloaded runtimes, build outputs, caches, and machine-specific paths out
  of Git. Preserve third-party license files and attribution.
- Run `scripts/check.ps1` for executable changes. For documentation-only changes,
  check links and Git diffs; do not claim to have repeated Zed UI validation.
- GUI checks are required to establish editor behavior after changing language
  configuration, Tree-sitter queries, or extension startup. Protocol tests alone
  do not prove completion menus, highlighting, or editor integration.
- Type errors in `test/fixtures/demo` are intentional. Tests use copies; do not
  "fix" these fixtures. `examples/demo` is editable and independent of the tests.
- Keep `VALIDATION.md` and `verification.json` as the 0.1.0 validation record.
  Record future validation separately with its actual versions and scope.
