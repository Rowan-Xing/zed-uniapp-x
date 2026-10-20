"""Build a reproducible, source-only bridge download; never include DCloud files."""
import argparse
import gzip
import hashlib
import io
import json
from pathlib import Path
import tarfile

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument("--check", action="store_true", help="Verify committed release metadata without changing it")
args = parser.parse_args()
version = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
files = [
    "LICENSE", "THIRD_PARTY_NOTICES.md", "package.json", "test/integration.cjs",
    *[f"server/{name}" for name in (
        "server.cjs", "ts-client.cjs", "dcloud-compat.cjs", "launch.cjs", "auto-update.cjs",
        "runtime-store.cjs", "runtime-update.cjs", "runtime-policy.json", "extract-runtime.ps1", "installer.cjs",
    )],
    *[p.relative_to(ROOT).as_posix() for p in (ROOT / "test/fixtures/demo").rglob("*") if p.is_file()],
]
tar_bytes = io.BytesIO()
with tarfile.open(fileobj=tar_bytes, mode="w", format=tarfile.USTAR_FORMAT) as archive:
    for name in sorted(files):
        source = ROOT / name
        if source.is_symlink():
            raise ValueError(f"Symlinks are not allowed in the bridge: {name}")
        # Git checkout line endings must not change a release asset's checksum.
        data = source.read_bytes().replace(b"\r\n", b"\n")
        info = tarfile.TarInfo(name)
        info.size, info.mode, info.mtime = len(data), 0o644, 0
        archive.addfile(info, io.BytesIO(data))
compressed = io.BytesIO()
with gzip.GzipFile(filename="", mode="wb", fileobj=compressed, mtime=0, compresslevel=9) as stream:
    stream.write(tar_bytes.getvalue())
payload = compressed.getvalue()
filename = f"uniapp-x-bridge-{version}.tar.gz"
metadata = {
    "version": version,
    "url": f"https://github.com/Rowan-Xing/zed-uniapp-x/releases/download/v{version}/{filename}",
    "sha256": hashlib.sha256(payload).hexdigest(),
}
metadata_path = ROOT / "bridge-release.json"
if args.check:
    if json.loads(metadata_path.read_text(encoding="utf-8")) != metadata:
        raise SystemExit("Bridge sources differ from bridge-release.json. Rebuild the release asset before compiling WASM.")
else:
    metadata_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8", newline="\n")
output = ROOT / "dist" / filename
output.parent.mkdir(parents=True, exist_ok=True)
output.write_bytes(payload)
(output.parent / f"{filename}.sha256").write_text(f"{metadata['sha256']}  {filename}\n", encoding="utf-8")
print(f"{output}\nSHA256 {metadata['sha256']}")
