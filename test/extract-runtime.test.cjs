'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { deflateRawSync, crc32 } = require('node:zlib');
const { extractRuntime } = require('../server/extract-runtime.cjs');

// Small ZIPs with deliberately malformed names/metadata exercise the actual
// reader without fetching another dependency or modifying official packages.
function fixture(items) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'uniapp-x-zip-'));
  const locals = [], central = [];
  let offset = 0;
  for (const item of items) {
    const name = Buffer.from(item.name), data = Buffer.from(item.data || 'hello');
    const compressed = deflateRawSync(data);
    const local = Buffer.alloc(30), header = Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc32(data), 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(item.size ?? data.length, 22);
    local.writeUInt16LE(name.length, 26);
    header.writeUInt32LE(0x02014b50);
    header.writeUInt16LE(0x314, 4);
    local.copy(header, 6, 4, 30);
    header.writeUInt32LE(((item.mode ?? 0o100644) * 65536) >>> 0, 38);
    header.writeUInt32LE(offset, 42);
    locals.push(local, name, compressed);
    central.push(header, name);
    offset += local.length + name.length + compressed.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(items.length, 8);
  end.writeUInt16LE(items.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  const archive = path.join(root, '官方 🧪.vsix'), destination = path.join(root, '状态 with spaces');
  fs.writeFileSync(archive, Buffer.concat([...locals, directory, end]));
  return { archive, destination };
}

test('extracts Unicode names and long dependency paths without a shell', async () => {
  const name = `extension/${'dependency/'.repeat(30)}中文 🧪.js`;
  const { archive, destination } = fixture([{ name, data: 'export default "你好";', mode: 0o100755 }]);
  await extractRuntime(archive, destination);
  assert.equal(fs.readFileSync(path.join(destination, name), 'utf8'), 'export default "你好";');
  if (process.platform !== 'win32') assert.ok(fs.statSync(path.join(destination, name)).mode & 0o111);
  await assert.rejects(extractRuntime(archive, destination), /EEXIST/);
});

test('rejects traversal, absolute paths, alternate streams and symlinks before writing', async () => {
  for (const item of [
    { name: '../outside' }, { name: '/absolute' }, { name: 'C:/absolute' },
    { name: 'extension/file:stream' }, { name: 'extension/link', mode: 0o120777 },
  ]) {
    const { archive, destination } = fixture([{ name: 'extension/valid.js' }, item]);
    await assert.rejects(extractRuntime(archive, destination));
    assert.equal(fs.existsSync(destination), false);
  }
});

test('rejects case/Unicode collisions and file-directory conflicts before writing', async () => {
  for (const names of [
    ['extension/A.js', 'extension/a.js'], ['extension/é.js', 'extension/e\u0301.js'],
    ['extension/file', 'extension/file/child'], ['extension/file/child', 'extension/file'],
  ]) {
    const { archive, destination } = fixture(names.map(name => ({ name })));
    await assert.rejects(extractRuntime(archive, destination), /[Cc]onflict|Duplicate/);
    assert.equal(fs.existsSync(destination), false);
  }
});

test('rejects oversized and inconsistent uncompressed sizes', async () => {
  const oversized = fixture([{ name: 'a', size: 0xfffffffe }, { name: 'b', size: 100 }]);
  await assert.rejects(extractRuntime(oversized.archive, oversized.destination), /4 GiB/);
  assert.equal(fs.existsSync(oversized.destination), false);
  const truncated = fixture([{ name: 'extension/a', size: 1, data: 'more than one byte' }]);
  await assert.rejects(extractRuntime(truncated.archive, truncated.destination), /size|byte/);
});

test('cancelled extraction leaves the destination untouched', async () => {
  const { archive, destination } = fixture([{ name: 'extension/a' }]);
  await assert.rejects(extractRuntime(archive, destination, { signal: AbortSignal.abort() }), { name: 'AbortError' });
  assert.equal(fs.existsSync(destination), false);
});
