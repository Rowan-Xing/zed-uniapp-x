'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');
const yauzl = require('yauzl');

// The caller verifies the official archive's SHA-256 before extraction. Inspect
// the central directory first, then stream files into a new staging directory.
async function extractRuntime(archive, destination, { signal } = {}) {
  signal?.throwIfAborted();
  const root = path.resolve(destination);
  const zip = await yauzl.openPromise(archive, {
    autoClose: false, strictFileNames: true, validateEntrySizes: true,
  });
  try {
    if (zip.entryCount > 150_000) throw new Error('VSIX has too many entries.');
    const entries = [], names = new Set(), kinds = new Map();
    let size = 0;
    for await (const entry of zip.eachEntry()) {
      signal?.throwIfAborted();
      const directory = entry.fileName.endsWith('/');
      const parts = (directory ? entry.fileName.slice(0, -1) : entry.fileName).split('/');
      const mode = entry.externalFileAttributes >>> 16;
      const type = mode & 0o170000;
      if (parts.some(part => !part || part === '.' || part === '..' || /[\x00-\x1f:]/.test(part) || /[. ]$/.test(part)) ||
          (type !== 0 && type !== (directory ? 0o040000 : 0o100000)) || !entry.canDecodeFileData()) {
        throw new Error(`Unsafe VSIX entry: ${entry.fileName}`);
      }
      const target = path.resolve(root, ...parts);
      if (!target.startsWith(root + path.sep)) throw new Error(`Unsafe VSIX path: ${entry.fileName}`);
      // Windows and default macOS volumes ignore case. Also reject Unicode
      // normalization collisions so extraction has the same result on both.
      const key = parts.join('/').normalize('NFC').toLowerCase();
      if (names.has(key) || (kinds.has(key) && kinds.get(key) !== directory)) {
        throw new Error(`Duplicate or conflicting VSIX entry: ${entry.fileName}`);
      }
      names.add(key);
      kinds.set(key, directory);
      for (let i = 1; i < parts.length; i++) {
        const parent = parts.slice(0, i).join('/').normalize('NFC').toLowerCase();
        if (kinds.get(parent) === false) throw new Error(`Conflicting VSIX parent: ${entry.fileName}`);
        kinds.set(parent, true);
      }
      size += entry.uncompressedSize;
      if (size > 4 * 1024 ** 3) throw new Error('Expanded VSIX exceeds 4 GiB.');
      entries.push({ entry, target, directory, mode });
    }
    signal?.throwIfAborted();
    // No recursive option: an existing destination (including a symlink) fails.
    await fs.promises.mkdir(root);
    for (const { entry, target, directory, mode } of entries) {
      signal?.throwIfAborted();
      await fs.promises.mkdir(directory ? target : path.dirname(target), { recursive: true });
      if (directory) continue;
      const input = await zip.openReadStreamPromise(entry);
      await pipeline(input, fs.createWriteStream(target, {
        flags: 'wx', mode: mode & 0o111 ? 0o755 : 0o644,
      }), { signal });
    }
  } finally { zip.close(); }
}

if (require.main === module) {
  const [archive, destination] = process.argv.slice(2);
  if (!archive || !destination) throw new Error('Usage: node extract-runtime.cjs <archive> <new directory>');
  extractRuntime(archive, destination).catch(error => { console.error(error); process.exitCode = 1; });
}
module.exports = { extractRuntime };
