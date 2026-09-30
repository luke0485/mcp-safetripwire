import { dirname, join, resolve } from 'node:path';

// Where am I, and how do I re-invoke myself?
//
// Two worlds:
//   development -> the script Node was asked to run (process.argv[1])
//   packaged    -> the executable itself (process.execPath); Node SEA sets
//                  __TRIPWIRE_BUILT__ via the bundler's define
//
// This deliberately avoids both `import.meta.url` and `__dirname`: the first is
// illegal in CommonJS output (which is what we bundle to), and the second makes
// raw ESM fail. process.argv[1] is correct for a CLI entry point in both worlds
// and needs no build-time tricks.
//
// The trade-off: if this module is imported by something other than our own CLI
// entry, argv[1] is that other entry. Every caller here is our CLI, so this is
// safe; tests that merely import modules do not depend on the result.
const BUILT = typeof __TRIPWIRE_BUILT__ !== 'undefined' && __TRIPWIRE_BUILT__ === true;

function entryPath() {
  const arg = process.argv[1];
  return arg ? resolve(arg) : '';
}

export function isSea() {
  try {
    const sea = process.getBuiltinModule?.('node:sea');
    return Boolean(sea?.isSea?.());
  } catch {
    return false;
  }
}

export function selfDir() {
  if (BUILT || isSea()) return dirname(process.execPath);
  const entry = entryPath();
  return entry ? dirname(entry) : process.cwd();
}

// "The program folder". In a packaged build there is no source tree, so it is
// the folder holding the executable.
export function appRoot() {
  if (process.env.TRIPWIRE_ROOT) return process.env.TRIPWIRE_ROOT;
  if (BUILT || isSea()) return dirname(process.execPath);
  return join(selfDir(), '..');
}

// How to launch ourselves again. In development that is `node <cli.js>`; once
// packaged, the executable *is* the CLI.
export function cliLauncher() {
  if (BUILT || isSea()) return { command: process.execPath, prefix: [] };
  const entry = entryPath();
  return { command: process.execPath, prefix: [entry || join(selfDir(), 'cli.js')] };
}

export function describeSelf() {
  return BUILT || isSea() ? `packaged executable (${process.execPath})` : `source tree (${appRoot()})`;
}
