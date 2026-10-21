# Roadmap

The project reuses DCloud's local semantics to support uni-app x editing in Zed.

## Implemented

- UTS and UVUE completion, details, definitions, hover, and type diagnostics.
- Ordinary script and script setup; diagnostics after unsaved edits.
- Real-runtime regression tests, isolated fixtures, and Windows CI.
- Stable-runtime discovery, checksum checks, validation before activation, and rollback.
- Zed API downloads for the versioned bridge and official runtime.
- First-launch installation, explicit grammar declarations, and English user documentation.

## Release 0.3

- [x] Complete fresh-install and update lifecycle validation locally and in Windows CI.
- [ ] Complete editor validation on the submitted code.
- [x] Publish and verify the checksum-pinned bridge asset.
- [ ] Submit and address review of the Zed registry PR.

## Follow-up work

- More real projects: CLI src layout, multi-root workspaces, file changes, and long sessions.
- Full coexistence testing with the Vue extension.
- Template attributes/events, CSS, platform-native types, and refactoring.
- iOS, Web, and HarmonyOS target coverage.
- macOS Apple Silicon editor validation; then Intel Mac and Linux host coverage.
- UTS-specific grammar coverage and large-project performance measurements.

Build, run, packaging, and device debugging require separate integrations.
