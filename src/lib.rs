use std::{env, fs, path::PathBuf};
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
        let directory = cwd.join("server");
        fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
        for (name, source) in [
            ("server.cjs", include_str!("../server/server.cjs")),
            ("ts-client.cjs", include_str!("../server/ts-client.cjs")),
            ("dcloud-compat.cjs", include_str!("../server/dcloud-compat.cjs")),
        ] {
            fs::write(directory.join(name), source).map_err(|e| e.to_string())?;
        }
        let options = LspSettings::for_worktree("uniapp-x", worktree)
            .ok()
            .and_then(|s| s.initialization_options);
        let configured = options
            .as_ref()
            .and_then(|o| o.get("runtimePath"))
            .and_then(|p| p.as_str())
            .map(str::to_string);
        let saved = fs::read_to_string(cwd.join("runtime-path.txt"))
            .ok()
            .map(|s| s.trim().to_string());
        let runtime = configured.or(saved).unwrap_or_else(|| {
            cwd.join("dcloud-4.87.0/extension")
                .to_string_lossy()
                .into_owned()
        });
        let script = PathBuf::from(&runtime).join("node_modules/typescript/lib/tsserver.js");
        // Host paths supplied in settings may not be readable from the WASI sandbox.
        // The Node process validates the complete runtime on startup.
        if runtime.trim().is_empty() {
            return Err(format!(
                "Run scripts/setup.ps1 or set lsp.uniapp-x.initialization_options.runtimePath. Expected {}",
                script.display()
            ));
        }
        Ok(zed::Command {
            command: zed::node_binary_path()?,
            args: vec![
                directory.join("server.cjs").to_string_lossy().into_owned(),
                "--stdio".into(),
                "--runtime".into(),
                runtime,
            ],
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
