// Applies publisher metadata to the packaged exe.
//
// This is NOT a code signature: it does not remove the SmartScreen warning.
// It is what shows under Properties -> Details, and it is what makes the
// product look finished. Real trust still requires a purchased certificate.
import { rcedit } from 'rcedit';
import { existsSync } from 'node:fs';

const exe = process.argv[2];
if (!exe || !existsSync(exe)) {
  console.log('rcedit: nothing to edit at ' + (exe || '(no path)'));
  process.exit(0);
}

const opts = {
  productName: 'MCP SafeTripwire',
  companyName: 'MCP SafeTripwire',
  fileDescription: 'MCP SafeTripwire - MCP channel guard',
  legalCopyright: 'Copyright (c) 2026 MCP SafeTripwire',
  fileVersion: '0.1.0',
  productVersion: '0.1.0',
};
if (existsSync('assets/logo.ico')) opts.icon = 'assets/logo.ico';

try {
  await rcedit(exe, opts);
  console.log('publisher metadata applied to ' + exe);
} catch (err) {
  console.log('rcedit failed: ' + err.message + ' (the exe still works, it just lacks metadata)');
}
