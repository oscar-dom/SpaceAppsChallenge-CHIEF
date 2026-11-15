// Starts the Python agent (agent/) for `npm run dev`, on any OS.
// Skips quietly while the agent has not been scaffolded yet, so the rest of the
// stack can still start.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const agentDir = join(import.meta.dirname, '..', 'agent');
const entry = join(agentDir, 'main.py');

// The one-command launcher (scripts/start.mjs) sets this when Python is not available: the
// stack then runs without the agent and CHIEF answers in fallback mode.
if (process.env.CHIEF_NO_AGENT === '1') {
  console.log('[agent] Not started (no Python agent): CHIEF answers in fallback mode.');
  process.exit(0);
}

if (!existsSync(entry)) {
  console.log('[agent] agent/main.py not found yet, skipping the agent.');
  process.exit(0);
}

const venvPython =
  process.platform === 'win32'
    ? join(agentDir, '.venv', 'Scripts', 'python.exe')
    : join(agentDir, '.venv', 'bin', 'python');

if (!existsSync(venvPython)) {
  console.error('[agent] agent/.venv not found. Create it first (see agent/README.md).');
  process.exit(1);
}

const port = process.env.AGENT_PORT ?? '8000';
const child = spawn(venvPython, ['-m', 'uvicorn', 'main:app', '--reload', '--port', port], {
  cwd: agentDir,
  stdio: 'inherit',
});

child.on('exit', (code) => process.exit(code ?? 0));
