'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const policy = require('./runtime-policy.json');

function versionParts(version) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    throw new Error(`Expected a stable release version, got ${version}.`);
  }
  const parts = version.split('.').map(Number);
  if (!parts.every(Number.isSafeInteger)) throw new Error('Invalid version number.');
  return parts;
}

function compareVersions(a, b) {
  const right = versionParts(b);
  const left = versionParts(a);
  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1;
  }
  return 0;
}

function validateRuntime(runtime, expectedVersion) {
  const manifest = JSON.parse(fs.readFileSync(path.join(runtime, 'package.json'), 'utf8'));
  if (manifest.name !== policy.name || manifest.publisher !== policy.namespace) {
    throw new Error('Expected the official dcloud-ide.hbuilderx-language-services runtime.');
  }
  versionParts(manifest.version);
  if (expectedVersion && manifest.version !== expectedVersion) {
    throw new Error(`Runtime version ${manifest.version} does not match ${expectedVersion}.`);
  }
  for (const name of [
    'node_modules/typescript/lib/tsserver.js',
    'jsservice/out/tsplugins/node_modules/dcloudio/index.js',
    'indexservice/out/server/server.js',
    'vueservice/packages/vue-typescript/out/sourceFile.js',
    'node_modules/vscode-languageserver/node.js',
  ]) {
    if (!fs.statSync(path.join(runtime, name)).isFile()) throw new Error(`Missing runtime file: ${name}`);
  }
  return manifest;
}

function statePath(root) { return path.join(root, 'runtime-state.json'); }

function loadState(root) {
  const file = statePath(root);
  if (!fs.existsSync(file)) return null;
  const state = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (state.schema !== 1 || !path.isAbsolute(state.active?.path || '') ||
      !Array.isArray(state.history) || typeof state.autoUpdate !== 'boolean') {
    throw new Error(`Invalid runtime state: ${file}. Restore it from a saved update report.`);
  }
  versionParts(state.active.version);
  return state;
}

// One file is authoritative. A crash can leave an unused temporary file, never
// a state containing half of the old version and half of the new version.
function saveState(root, state) {
  fs.mkdirSync(root, { recursive: true });
  const temporary = path.join(root, `runtime-state.${randomUUID()}.tmp`);
  const fd = fs.openSync(temporary, 'wx');
  try {
    fs.writeFileSync(fd, JSON.stringify(state, null, 2) + '\n');
    fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
  fs.renameSync(temporary, statePath(root));
}

function selectRuntime(root, override) {
  if (override) return path.resolve(override);
  const state = loadState(root);
  if (state) {
    validateRuntime(state.active.path, state.active.version);
    return state.active.path;
  }
  const pointer = path.join(root, 'runtime-path.txt');
  return fs.existsSync(pointer)
    ? path.resolve(fs.readFileSync(pointer, 'utf8').trim())
    : path.join(root, `dcloud-${policy.bootstrapVersion}`, 'extension');
}

function initialState(root, runtime) {
  const location = path.resolve(runtime || selectRuntime(root));
  const manifest = validateRuntime(location);
  // Only the historically validated bootstrap may be imported without a test
  // receipt. New versions must enter through the updater's regression gate.
  if (manifest.version !== policy.bootstrapVersion) {
    throw new Error(`Initial managed runtime must be ${policy.bootstrapVersion}; use setup.ps1 first.`);
  }
  return {
    schema: 1,
    autoUpdate: true,
    active: { version: manifest.version, path: location, source: 'bootstrap' },
    history: [],
    lastAttempt: null,
    lastResult: null,
  };
}

function alive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code !== 'ESRCH'; }
}

function acquireLock(root) {
  fs.mkdirSync(root, { recursive: true });
  const file = path.join(root, 'runtime-update.lock');
  const archive = path.join(root, 'update-reports', 'locks');
  fs.mkdirSync(archive, { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = randomUUID();
    try {
      const fd = fs.openSync(file, 'wx');
      try { fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, token, started: new Date().toISOString() })); }
      finally { fs.closeSync(fd); }
      return () => {
        // Retain completed lock receipts as well as failed downloads/reports.
        // No runtime directory or user file is removed by this updater.
        const current = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (current.token !== token) throw new Error('Runtime update lock ownership changed.');
        fs.renameSync(file, path.join(archive, `${token}.json`));
      };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      // Serialize recovery itself: two contenders must not mistake the lock
      // acquired by one of them for the abandoned lock they both observed.
      const recovery = path.join(root, 'runtime-update.recovery.lock');
      let recoveryFd;
      try { recoveryFd = fs.openSync(recovery, 'wx'); }
      catch (recoveryError) {
        if (recoveryError.code === 'EEXIST') return null;
        throw recoveryError;
      }
      try {
        fs.writeFileSync(recoveryFd, JSON.stringify({ pid: process.pid, token }));
        let owner;
        try { owner = JSON.parse(fs.readFileSync(file, 'utf8')); }
        catch (readError) {
          if (readError.code === 'ENOENT') continue;
          // Another process may still be writing its freshly acquired lock.
          if (Date.now() - fs.statSync(file).mtimeMs < 10 * 60_000) return null;
        }
        if (owner && alive(owner.pid)) return null;
        fs.renameSync(file, path.join(archive, `abandoned-${randomUUID()}.json`));
      } finally {
        fs.closeSync(recoveryFd);
        fs.renameSync(recovery, path.join(archive, `recovery-${token}.json`));
      }
    }
  }
  return null;
}

function activate(state, candidate) {
  state.history = [state.active, ...state.history]
    .filter((entry, index, all) => entry.path !== candidate.path &&
      all.findIndex(other => other.path === entry.path) === index);
  state.active = candidate;
}

module.exports = {
  policy, versionParts, compareVersions, validateRuntime, loadState, saveState,
  selectRuntime, initialState, acquireLock, activate,
};
