'use strict';

const path = require('node:path');
const { fork } = require('node:child_process');

function startAutoUpdate(root, log, updated) {
  let worker, stopped = false;
  const check = () => {
    if (stopped || worker) return;
    let output = '';
    worker = fork(path.join(__dirname, 'runtime-update.cjs'), ['check', '--state-dir', root, '--auto'], {
      windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    worker.stdout.on('data', chunk => { output = (output + chunk).slice(-65536); });
    worker.stderr.on('data', chunk => log(`Runtime update: ${chunk.toString().slice(0, 1800)}`));
    worker.on('error', error => log(`Runtime update: ${error.message}`));
    worker.on('close', code => {
      worker = null;
      if (code === 0 && !stopped) {
        try {
          const result = JSON.parse(output);
          if (result.status === 'updated') updated(result);
          else if (!['not-due', 'busy', 'paused'].includes(result.status)) {
            log(`Runtime update: ${result.status}${result.available ? ` (${result.available})` : ''}`);
          }
        } catch (error) { log(`Runtime update response: ${error.message}`); }
      }
    });
  };
  // Do not put registry access or the regression suite on the LSP startup path.
  const first = setTimeout(check, 5000);
  const repeated = setInterval(check, 3600_000);
  first.unref();
  repeated.unref();
  return () => {
    stopped = true;
    clearTimeout(first);
    clearInterval(repeated);
    // Disconnect aborts downloads/tests in the worker, including when the editor
    // exits unexpectedly. It can finish its failure receipt before it terminates.
    if (worker?.connected) worker.disconnect();
  };
}

module.exports = { startAutoUpdate };
