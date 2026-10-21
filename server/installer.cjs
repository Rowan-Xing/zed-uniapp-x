'use strict';

// The Zed adapter owns network downloads. This helper plans destinations inside
// the extension work directory, then validates and installs the downloaded VSIX.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const {
  policy, versionParts, compareVersions, validateRuntime, loadState, saveState,
  initialState, selectRuntime, acquireLock, activate,
} = require('./runtime-store.cjs');
const { stageRelease, verifyRuntime, bridgeFingerprint } = require('./runtime-update.cjs');

function validateRelease(release) {
  versionParts(release?.version);
  const url = `${policy.registry}/${release.version}/file/${policy.namespace}.${policy.name}-${release.version}.vsix`;
  if (release.url !== url || !/^[a-f0-9]{64}$/.test(release.sha256 || '')) {
    throw new Error('Invalid official DCloud release metadata.');
  }
  if (release.version === policy.bootstrapVersion && release.sha256 !== policy.bootstrapSha256) {
    throw new Error('The bootstrap checksum differs from the pinned release.');
  }
  return release;
}

function bootstrapRelease() {
  return validateRelease({
    version: policy.bootstrapVersion, sha256: policy.bootstrapSha256,
    url: `${policy.registry}/${policy.bootstrapVersion}/file/${policy.namespace}.${policy.name}-${policy.bootstrapVersion}.vsix`,
  });
}

function inside(root, relative) {
  if (typeof relative !== 'string' || path.isAbsolute(relative)) throw new Error('Expected a relative installation path.');
  const resolved = path.resolve(root, relative);
  if (!resolved.startsWith(path.resolve(root) + path.sep)) throw new Error('Installation path leaves the extension work directory.');
  return resolved;
}

function prepare(root, autoUpdate = true) {
  let state = loadState(root);
  if (!state) {
    // Preserve existing 0.1/0.2 installations without requiring a migration step.
    const legacy = selectRuntime(root);
    if (fs.existsSync(path.join(legacy, 'package.json'))) {
      const unlock = acquireLock(root);
      if (!unlock) throw new Error('Another runtime operation is running. Restart the language server shortly.');
      try {
        state = loadState(root) || initialState(root, legacy);
        saveState(root, state);
      } finally { unlock(); }
    }
  }
  if (!state) return { status: 'download', release: bootstrapRelease(), hasActive: false };
  validateRuntime(state.active.path, state.active.version);
  const ready = { status: 'ready', hasActive: true, version: state.active.version };
  if (!autoUpdate || !state.autoUpdate) return ready;
  if (state.pendingRelease && compareVersions(state.pendingRelease.version, state.active.version) > 0) {
    return { ...ready, status: 'download', release: validateRelease(state.pendingRelease) };
  }
  return Date.now() - Date.parse(state.lastAttempt || '') < policy.checkIntervalHours * 3600_000
    ? ready : { ...ready, status: 'check' };
}

function plan(root, release) {
  validateRelease(release);
  const unlock = acquireLock(root);
  if (!unlock) throw new Error('Another runtime operation is running. Restart the language server shortly.');
  try {
    const state = loadState(root);
    if (!state && release.version !== policy.bootstrapVersion) throw new Error('A fresh installation must use the pinned bootstrap.');
    const fingerprint = bridgeFingerprint();
    if (state) {
      validateRuntime(state.active.path, state.active.version);
      if (!state.autoUpdate) return { status: 'ready' };
      state.lastAttempt = new Date().toISOString();
      if (compareVersions(release.version, state.active.version) <= 0) {
        state.pendingRelease = null;
        state.lastResult = { status: 'current', available: release.version, at: state.lastAttempt };
        saveState(root, state);
        return { status: 'ready' };
      }
      if (state.failedCandidate?.version === release.version &&
          state.failedCandidate.sha256 === release.sha256 && state.failedCandidate.bridge === fingerprint) {
        state.pendingRelease = null;
        saveState(root, state);
        return { status: 'ready', reason: 'previously-failed' };
      }
      saveState(root, state);
    }
    const id = randomUUID();
    const sessionRelative = `runtime-releases/${release.version}-${id}`;
    const archiveRelative = `downloads/dcloud-${release.version}-${id}.vsix`;
    const requestRelative = `${sessionRelative}/request.json`;
    fs.mkdirSync(inside(root, sessionRelative), { recursive: true });
    fs.mkdirSync(path.dirname(inside(root, archiveRelative)), { recursive: true });
    const request = { release, fingerprint, archiveRelative, sessionRelative };
    fs.writeFileSync(inside(root, requestRelative), JSON.stringify(request, null, 2));
    return { status: 'download', url: release.url, archiveRelative, requestRelative };
  } finally { unlock(); }
}

async function install(root, requestRelative, dependencies = {}) {
  const request = JSON.parse(fs.readFileSync(inside(root, requestRelative), 'utf8'));
  const release = validateRelease(request.release);
  const session = inside(root, request.sessionRelative);
  const archive = inside(root, request.archiveRelative);
  if (inside(root, requestRelative) !== path.join(session, 'request.json')) throw new Error('Installation request path mismatch.');
  const fingerprint = bridgeFingerprint();
  if (request.fingerprint !== fingerprint) throw new Error('The bridge changed during installation. Restart the language server.');
  const unlock = acquireLock(root);
  if (!unlock) throw new Error('Another runtime operation is running. Restart the language server shortly.');
  let state, validating = false;
  try {
    state = loadState(root);
    if (state) {
      validateRuntime(state.active.path, state.active.version);
      // A rollback/pause or a newer install can happen while Zed is downloading.
      if (!state.autoUpdate || compareVersions(release.version, state.active.version) <= 0) {
        return { status: 'ready', version: state.active.version };
      }
    } else if (release.version !== policy.bootstrapVersion) {
      throw new Error('A fresh installation must use the pinned bootstrap.');
    }
    fs.writeFileSync(path.join(session, 'before.json'), JSON.stringify(state, null, 2));
    fs.writeFileSync(path.join(session, 'release.json'), JSON.stringify(release, null, 2));
    const runtime = await (dependencies.stageRelease || stageRelease)(release, session, { vsix: archive });
    validateRuntime(runtime, release.version);
    validating = true;
    const report = await (dependencies.verifyRuntime || verifyRuntime)(runtime, session);
    const candidate = {
      version: release.version, path: runtime, sha256: release.sha256, source: release.url,
      validatedAt: new Date().toISOString(), bridge: fingerprint, report,
    };
    const next = state ? structuredClone(state) : {
      schema: 1, autoUpdate: true, active: candidate, history: [],
    };
    if (state) activate(next, candidate);
    next.lastAttempt = new Date().toISOString();
    next.lastResult = { status: 'updated', version: release.version, at: next.lastAttempt, report };
    next.failedCandidate = null;
    next.pendingRelease = null;
    fs.writeFileSync(path.join(session, 'after.json'), JSON.stringify(next, null, 2));
    saveState(root, next);
    return next.lastResult;
  } catch (error) {
    fs.writeFileSync(path.join(session, 'failure.json'), JSON.stringify({ error: error.message }, null, 2));
    if (state) {
      state.lastAttempt = new Date().toISOString();
      state.lastResult = { status: 'failed', at: state.lastAttempt, error: error.message, session };
      state.pendingRelease = null;
      if (validating) state.failedCandidate = { version: release.version, sha256: release.sha256, bridge: fingerprint };
      saveState(root, state);
    }
    throw error;
  } finally { unlock(); }
}

function recordFailure(root, message) {
  const unlock = acquireLock(root);
  if (!unlock) return;
  try {
    const state = loadState(root);
    if (!state) return;
    state.lastAttempt = new Date().toISOString();
    state.pendingRelease = null;
    state.lastResult = { status: 'failed', at: state.lastAttempt, error: message };
    saveState(root, state);
  } finally { unlock(); }
}

async function main() {
  const args = process.argv.slice(2);
  const action = args.shift();
  const value = name => args[args.indexOf(name) + 1];
  const root = value('--state-dir');
  if (!args.includes('--state-dir') || !path.isAbsolute(root || '')) throw new Error('An absolute extension work directory is required.');
  if (!['win32', 'darwin'].includes(process.platform)) throw new Error('uni-app x supports Windows and macOS. Linux has not been validated.');
  let result;
  if (action === 'prepare') result = prepare(root, !args.includes('--no-auto'));
  else if (action === 'plan') result = plan(root, JSON.parse(value('--release')));
  else if (action === 'install') result = await install(root, value('--request'));
  else if (action === 'failed') result = recordFailure(root, value('--message')) || { status: 'recorded' };
  else throw new Error(`Unknown installation action: ${action}`);
  process.stdout.write(JSON.stringify(result) + '\n');
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { prepare, plan, install, validateRelease, bootstrapRelease, inside };
