'use strict';

const path = require('node:path');
const { selectRuntime } = require('./runtime-store.cjs');
const args = process.argv;
const rootIndex = args.indexOf('--state-dir');
const overrideIndex = args.indexOf('--runtime');
try {
  if (rootIndex < 0 || !path.isAbsolute(args[rootIndex + 1] || '')) {
    throw new Error('The extension did not provide its runtime work directory.');
  }
  const root = args[rootIndex + 1];
  const override = overrideIndex < 0 ? undefined : args[overrideIndex + 1];
  const runtime = selectRuntime(root, override);
  if (overrideIndex < 0) args.push('--runtime', runtime, '--managed-runtime');
  require('./server.cjs');
} catch (error) {
  process.stderr.write(`uni-app x: ${error.message}\nRun scripts/setup.ps1 to prepare the runtime.\n`);
  process.exitCode = 1;
}
