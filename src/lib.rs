use std::{env, fs};
use zed_extension_api::{self as zed, serde_json, settings::LspSettings, Result};

struct UniAppX;

impl zed::Extension for UniAppX {
    fn new() -> Self {
        Self
    }

    fn language_server_command(
        &mut self,
        _language_server_id: &zed::LanguageServerId,
        worktree: &zed::Worktree,
    ) -> Result<zed::Command> {
        let cwd = env::current_dir().map_err(|e| e.to_string())?;
        let directory = cwd.join(concat!("bridge-", env!("CARGO_PKG_VERSION")));
        fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
        macro_rules! asset {
            ($file:literal) => {
                ($file, include_str!(concat!("../", $file)))
            };
        }
        for (name, source) in [
            asset!("server/server.cjs"),
            asset!("server/ts-client.cjs"),
            asset!("server/dcloud-compat.cjs"),
            asset!("server/launch.cjs"),
            asset!("server/auto-update.cjs"),
            asset!("server/runtime-store.cjs"),
            asset!("server/runtime-update.cjs"),
            asset!("server/runtime-policy.json"),
            asset!("server/extract-runtime.ps1"),
            asset!("test/integration.cjs"),
            asset!("test/fixtures/demo/main.uts"),
            asset!("test/fixtures/demo/App.uvue"),
            asset!("test/fixtures/demo/pages.json"),
            asset!("test/fixtures/demo/manifest.json"),
            asset!("test/fixtures/demo/platformConfig.json"),
            asset!("test/fixtures/demo/sample.uts"),
            asset!("test/fixtures/demo/utils/greet.uts"),
            asset!("test/fixtures/demo/pages/index/index.uvue"),
            asset!("test/fixtures/demo/pages/options/options.uvue"),
        ] {
            let file = directory.join(name);
            if fs::read(&file).ok().as_deref() != Some(source.as_bytes()) {
                fs::create_dir_all(file.parent().unwrap()).map_err(|e| e.to_string())?;
                fs::write(file, source).map_err(|e| e.to_string())?;
            }
        }
        let options = LspSettings::for_worktree("uniapp-x", worktree)
            .ok()
            .and_then(|s| s.initialization_options);
        let configured = options
            .as_ref()
            .and_then(|o| o.get("runtimePath"))
            .and_then(|p| p.as_str())
            .map(str::to_string);
        let mut args = vec![
            directory
                .join("server/launch.cjs")
                .to_string_lossy()
                .into_owned(),
            "--stdio".into(),
            "--state-dir".into(),
            cwd.to_string_lossy().into_owned(),
        ];
        // Node reads the atomic selection on the host, outside the WASI sandbox.
        // An explicit path opts this workspace out of managed runtime updates.
        if let Some(runtime) = configured {
            if runtime.trim().is_empty() {
                return Err("runtimePath must be an absolute runtime directory.".into());
            }
            args.extend(["--runtime".into(), runtime]);
        }
        Ok(zed::Command {
            command: zed::node_binary_path()?,
            args,
            env: Default::default(),
        })
    }

    fn language_server_initialization_options(
        &mut self,
        _language_server_id: &zed::LanguageServerId,
        worktree: &zed::Worktree,
    ) -> Result<Option<serde_json::Value>> {
        Ok(LspSettings::for_worktree("uniapp-x", worktree)
            .ok()
            .and_then(|s| s.initialization_options))
    }

    fn language_server_workspace_configuration(
        &mut self,
        _language_server_id: &zed::LanguageServerId,
        worktree: &zed::Worktree,
    ) -> Result<Option<serde_json::Value>> {
        Ok(LspSettings::for_worktree("uniapp-x", worktree)
            .ok()
            .and_then(|s| s.settings))
    }
}

zed::register_extension!(UniAppX);
