import { spawnSync } from 'node:child_process';

// Terminate a spawned server AND its descendants.
//
// On Windows, `child.kill()` only terminates the immediate process. Launchers
// like `npx`/`uvx` spawn the real MCP server as a grandchild, so killing the
// wrapper would orphan a live server. taskkill /T walks the tree.

export function killTree(child, signal = 'SIGTERM') {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32' && child.pid) {
    try {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      return;
    } catch {
      /* fall through to the generic path */
    }
  }
  try {
    child.kill(signal);
  } catch {
    /* already gone */
  }
}
