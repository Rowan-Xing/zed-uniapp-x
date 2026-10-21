use sha2::{Digest, Sha256};
use std::{
    env, fs,
    path::{Component, Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use zed_extension_api::{
    self as zed,
    http_client::{HttpMethod, HttpRequest, RedirectPolicy},
    serde_json::{self, Value},
    settings::LspSettings,
    LanguageServerInstallationStatus as Status, Result,
};

struct UniAppX {
    bridge: Option<PathBuf>,
}

fn text<'a>(value: &'a Value, key: &str) -> Result<&'a str> {
    value[key]
        .as_str()
        .ok_or_else(|| format!("Missing {key} in installation metadata."))
}

fn relative(value: &str) -> Result<&str> {
    if value.is_empty()
        || value.contains(['\\', ':'])
        || !Path::new(value)
            .components()
            .all(|part| matches!(part, Component::Normal(_)))
    {
        return Err("Invalid path in installation metadata.".into());
    }
    Ok(value)
}

fn digest(file: &Path) -> Result<String> {
    let bytes = fs::read(file).map_err(|e| e.to_string())?;
    Ok(format!("{:x}", Sha256::digest(bytes)))
}

fn fetch(url: &str, limit: usize) -> Result<String> {
    let response = HttpRequest::builder()
        .method(HttpMethod::Get)
        .url(url)
        .redirect_policy(RedirectPolicy::FollowLimit(5))
        .build()?
        .fetch()?;
    if response.body.len() > limit {
        return Err("The official registry response exceeds the size limit.".into());
    }
    String::from_utf8(response.body).map_err(|e| e.to_string())
}

fn latest_release() -> Result<Value> {
    let policy: Value = serde_json::from_str(include_str!("../server/runtime-policy.json"))
        .map_err(|e| e.to_string())?;
    let registry = text(&policy, "registry")?;
    let metadata: Value = serde_json::from_str(&fetch(&format!("{registry}/latest"), 1024 * 1024)?)
        .map_err(|e| e.to_string())?;
    let version = text(&metadata, "version")?;
    let parts: Vec<_> = version.split('.').collect();
    if metadata["namespace"] != policy["namespace"]
        || metadata["name"] != policy["name"]
        || metadata["preview"] == true
        || parts.len() != 3
        || parts.iter().any(|part| {
            part.is_empty()
                || !part.bytes().all(|b| b.is_ascii_digit())
                || (part.len() > 1 && part.starts_with('0'))
                || part.parse::<u64>().is_err()
        })
    {
        return Err("The registry did not return an official stable DCloud release.".into());
    }
    let prefix = format!(
        "{registry}/{version}/file/{}.{}-{version}",
        text(&policy, "namespace")?,
        text(&policy, "name")?
    );
    let url = format!("{prefix}.vsix");
    let checksum_url = format!("{prefix}.sha256");
    if metadata["files"]["download"] != url || metadata["files"]["sha256"] != checksum_url {
        return Err("Unexpected official download/checksum URL.".into());
    }
    let checksum = fetch(&checksum_url, 4096)?;
    let sha256 = checksum
        .split_whitespace()
        .next()
        .unwrap_or("")
        .to_lowercase();
    if sha256.len() != 64 || !sha256.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("Invalid official SHA-256.".into());
    }
    Ok(serde_json::json!({ "version": version, "url": url, "sha256": sha256 }))
}

fn manager(
    node: &str,
    bridge: &Path,
    root: &Path,
    action: &str,
    extra: &[String],
) -> Result<Value> {
    let output = zed::process::Command::new(node)
        .arg(bridge.join("server/installer.cjs").to_string_lossy())
        .arg(action)
        .arg("--state-dir")
        .arg(root.to_string_lossy())
        .args(extra.iter().cloned())
        .output()?;
    if output.status != Some(0) {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    serde_json::from_slice(&output.stdout).map_err(|e| format!("Invalid installer response: {e}"))
}

impl UniAppX {
    fn bridge(&mut self, id: &zed::LanguageServerId) -> Result<PathBuf> {
        if let Some(directory) = &self.bridge {
            return Ok(directory.clone());
        }
        let release: Value = serde_json::from_str(include_str!("../bridge-release.json"))
            .map_err(|e| e.to_string())?;
        let hash = text(&release, "sha256")?;
        let root = env::current_dir().map_err(|e| e.to_string())?;
        let directory = root.join(concat!("bridge-", env!("CARGO_PKG_VERSION")));
        if fs::read_to_string(directory.join(".ready")).ok().as_deref() != Some(hash) {
            zed::set_language_server_installation_status(id, &Status::Downloading);
            fs::create_dir_all(root.join("downloads")).map_err(|e| e.to_string())?;
            let archive_relative =
                concat!("downloads/bridge-", env!("CARGO_PKG_VERSION"), ".tar.gz");
            let archive = root.join(archive_relative);
            if digest(&archive).ok().as_deref() != Some(hash) {
                zed::download_file(
                    text(&release, "url")?,
                    archive_relative,
                    zed::DownloadedFileType::Uncompressed,
                )?;
            }
            if digest(&archive)? != hash {
                return Err(
                    "Bridge download checksum mismatch. Restart the language server to retry."
                        .into(),
                );
            }
            let timestamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map_err(|e| e.to_string())?
                .as_nanos();
            let staging = root.join(format!("bridge-staging-{timestamp}"));
            fs::create_dir_all(&staging).map_err(|e| e.to_string())?;
            let archive_file = fs::File::open(&archive).map_err(|e| e.to_string())?;
            let decoder = flate2::read::GzDecoder::new(archive_file);
            tar::Archive::new(decoder)
                .unpack(&staging)
                .map_err(|e| format!("Bridge extraction failed: {e}"))?;
            if !staging.join("server/installer.cjs").is_file()
                || !staging.join("server/launch.cjs").is_file()
            {
                return Err("The bridge archive is incomplete.".into());
            }
            fs::write(staging.join(".ready"), hash).map_err(|e| e.to_string())?;
            // Preserve previous/incomplete directories for diagnosis and existing sessions.
            if directory.exists() {
                fs::rename(
                    &directory,
                    root.join(format!("bridge-retained-{timestamp}")),
                )
                .map_err(|e| e.to_string())?;
            }
            fs::rename(staging, &directory).map_err(|e| e.to_string())?;
        }
        self.bridge = Some(directory.clone());
        Ok(directory)
    }

    fn prepare_runtime(
        &self,
        id: &zed::LanguageServerId,
        node: &str,
        bridge: &Path,
        root: &Path,
        auto_update: bool,
    ) -> Result<()> {
        let extra = if auto_update {
            vec![]
        } else {
            vec!["--no-auto".into()]
        };
        let prepared = manager(node, bridge, root, "prepare", &extra)?;
        let has_active = prepared["hasActive"] == true;
        let update = || -> Result<()> {
            let release = match text(&prepared, "status")? {
                "ready" => return Ok(()),
                "download" => prepared["release"].clone(),
                "check" => {
                    zed::set_language_server_installation_status(id, &Status::CheckingForUpdate);
                    latest_release()?
                }
                _ => return Err("Unknown runtime preparation response.".into()),
            };
            let plan = manager(
                node,
                bridge,
                root,
                "plan",
                &["--release".into(), release.to_string()],
            )?;
            if plan["status"] == "ready" {
                return Ok(());
            }
            zed::set_language_server_installation_status(id, &Status::Downloading);
            zed::download_file(
                text(&plan, "url")?,
                relative(text(&plan, "archiveRelative")?)?,
                zed::DownloadedFileType::Uncompressed,
            )?;
            zed::set_language_server_installation_status(id, &Status::CheckingForUpdate);
            manager(
                node,
                bridge,
                root,
                "install",
                &[
                    "--request".into(),
                    relative(text(&plan, "requestRelative")?)?.into(),
                ],
            )?;
            Ok(())
        };
        if let Err(error) = update() {
            let _ = manager(
                node,
                bridge,
                root,
                "failed",
                &["--message".into(), error.clone()],
            );
            if !has_active {
                return Err(format!(
                    "uni-app x installation failed: {error} Restart the language server to retry."
                ));
            }
            eprintln!("uni-app x update failed; continuing with the retained runtime: {error}");
        }
        Ok(())
    }
}

impl zed::Extension for UniAppX {
    fn new() -> Self {
        Self { bridge: None }
    }

    fn language_server_command(
        &mut self,
        language_server_id: &zed::LanguageServerId,
        worktree: &zed::Worktree,
    ) -> Result<zed::Command> {
        if !matches!(zed::current_platform().0, zed::Os::Windows | zed::Os::Mac) {
            return Err(
                "uni-app x supports Windows and macOS. Linux has not been validated.".into(),
            );
        }
        let cwd = env::current_dir().map_err(|e| e.to_string())?;
        let directory = self.bridge(language_server_id).inspect_err(|error| {
            zed::set_language_server_installation_status(
                language_server_id,
                &Status::Failed(error.clone()),
            );
        })?;
        let node = zed::node_binary_path()?;
        let options = LspSettings::for_worktree("uniapp-x", worktree)
            .ok()
            .and_then(|s| s.initialization_options);
        let configured = options
            .as_ref()
            .and_then(|o| o.get("runtimePath"))
            .and_then(|p| p.as_str())
            .map(str::to_string);
        if configured.is_none() {
            self.prepare_runtime(
                language_server_id,
                &node,
                &directory,
                &cwd,
                options
                    .as_ref()
                    .and_then(|o| o.get("autoUpdate"))
                    .and_then(Value::as_bool)
                    != Some(false),
            )
            .inspect_err(|error| {
                zed::set_language_server_installation_status(
                    language_server_id,
                    &Status::Failed(error.clone()),
                );
            })?;
        }
        let mut args = vec![
            directory
                .join("server/launch.cjs")
                .to_string_lossy()
                .into_owned(),
            "--stdio".into(),
            "--state-dir".into(),
            cwd.to_string_lossy().into_owned(),
            "--zed-managed-downloads".into(),
        ];
        // Node reads the atomic selection on the host, outside the WASI sandbox.
        // An explicit path opts this workspace out of managed runtime updates.
        if let Some(runtime) = configured {
            if runtime.trim().is_empty() {
                return Err("runtimePath must be an absolute runtime directory.".into());
            }
            args.extend(["--runtime".into(), runtime]);
        }
        zed::set_language_server_installation_status(language_server_id, &Status::None);
        Ok(zed::Command {
            command: node,
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
