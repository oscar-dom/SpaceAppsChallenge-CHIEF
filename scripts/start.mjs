// One command to install, seed and run CHIEF on any OS (`npm start`, ./start.sh, start.cmd).
//
//   node scripts/start.mjs              install what is missing, fresh demo data, run, open browser
//   node scripts/start.mjs --lite       skip the voice packages (faster-whisper, Piper): smaller
//                                       install; voice falls back to the browser's speech API
//   node scripts/start.mjs --no-agent   do not set up or run the Python agent (CHIEF answers in
//                                       fallback mode, from the rules engine and the thresholds table)
//   node scripts/start.mjs --keep-data  keep the current database instead of a fresh demo mission
//   node scripts/start.mjs --no-open    do not open the browser
//
// Every step is idempotent: running it again only does what is still missing.
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';

const root = join(import.meta.dirname, '..');
const agentDir = join(root, 'agent');
const args = new Set(process.argv.slice(2));
const isWin = process.platform === 'win32';
const APP_URL = 'http://localhost:5173';

const step = (text) => console.log(`\n\x1b[1;34m▸ ${text}\x1b[0m`);
const info = (text) => console.log(`  ${text}`);
const warn = (text) => console.log(`  \x1b[33m! ${text}\x1b[0m`);
const fail = (text) => {
  console.error(`\n\x1b[31m✖ ${text}\x1b[0m`);
  process.exit(1);
};

/** Runs a command in the foreground; stops the launcher if it fails. */
function run(cmd, cmdArgs, options = {}) {
  const result = spawnSync(cmd, cmdArgs, { stdio: 'inherit', shell: isWin, cwd: root, ...options });
  if (result.status !== 0) fail(`${cmd} ${cmdArgs.join(' ')} failed.`);
}

// --- 1. Node ----------------------------------------------------------------------------------------
step('Checking Node.js');
const [major] = process.versions.node.split('.').map(Number);
if (major < 20)
  fail(
    `Node.js 20 or newer is required (found ${process.versions.node}). Get it at https://nodejs.org`,
  );
info(`Node.js ${process.versions.node}`);

// --- 2. JavaScript dependencies ----------------------------------------------------------------------
step('Installing JavaScript dependencies (frontend, backend, shared)');
if (existsSync(join(root, 'node_modules', '.package-lock.json'))) info('Already installed.');
else run('npm', ['install', '--no-audit', '--no-fund']);

// --- 3. Python agent (CHIEF) -------------------------------------------------------------------------
/** A Python 3.11+ launcher, as [command, ...prefix args], or null. */
function findPython() {
  const candidates = isWin ? [['py', '-3'], ['python']] : [['python3'], ['python']];
  for (const [cmd, ...prefix] of candidates) {
    const r = spawnSync(
      cmd,
      [...prefix, '-c', 'import sys; print(sys.version_info[:2] >= (3, 11))'],
      {
        encoding: 'utf8',
      },
    );
    if (r.status === 0 && r.stdout.trim() === 'True') return [cmd, ...prefix];
  }
  return null;
}

const venvPython = isWin
  ? join(agentDir, '.venv', 'Scripts', 'python.exe')
  : join(agentDir, '.venv', 'bin', 'python');
let agentReady = false;

if (args.has('--no-agent')) {
  step('Python agent: skipped (--no-agent)');
} else {
  step('Setting up CHIEF, the Python agent');
  if (!existsSync(venvPython)) {
    const python = findPython();
    if (!python) {
      warn('Python 3.11+ not found: running without the agent. CHIEF answers in fallback mode');
      warn('(rules engine + sourced recommendations) and voice uses the browser. Install Python');
      warn('from https://www.python.org and run this again for the full assistant.');
    } else {
      const [cmd, ...prefix] = python;
      info(`Creating agent/.venv with ${python.join(' ')}`);
      run(cmd, [...prefix, '-m', 'venv', '.venv'], { cwd: agentDir, shell: false });
    }
  }
  if (existsSync(venvPython)) {
    const reqs = ['-r', 'requirements.txt'];
    if (!args.has('--lite')) reqs.push('-r', 'requirements-voice.txt');
    const marker = join(agentDir, '.venv', args.has('--lite') ? '.chief-lite' : '.chief-full');
    if (existsSync(marker)) info('Python packages already installed.');
    else {
      info(
        `Installing Python packages${args.has('--lite') ? ' (without voice)' : ' (with voice: a few hundred MB)'}`,
      );
      run(venvPython, ['-m', 'pip', 'install', '--disable-pip-version-check', '-q', ...reqs], {
        cwd: agentDir,
        shell: false,
      });
      writeFileSync(marker, new Date().toISOString());
    }

    // Piper voice for text-to-speech (about 60 MB). Whisper downloads its own model on first use.
    const voice = join(agentDir, 'models', 'piper', 'en_US-ryan-medium.onnx');
    if (!args.has('--lite') && !existsSync(voice)) {
      info('Downloading the Piper voice (about 60 MB)');
      const r = spawnSync(
        venvPython,
        ['-m', 'piper.download_voices', 'en_US-ryan-medium', '--download-dir', 'models/piper'],
        { cwd: agentDir, stdio: 'inherit' },
      );
      if (r.status !== 0) warn('Voice download failed: CHIEF will speak with the browser voice.');
    }

    // agent/.env with the Gemini key (optional).
    const envFile = join(agentDir, '.env');
    if (!existsSync(envFile)) copyFileSync(join(agentDir, '.env.example'), envFile);
    const env = readFileSync(envFile, 'utf8');
    const hasKey = /^GEMINI_API_KEY=\S+/m.test(env) || !!process.env.GEMINI_API_KEY;
    if (hasKey) info('Gemini API key found.');
    else if (process.stdin.isTTY) {
      console.log(
        '\n  CHIEF uses Google Gemini for its answers. A free key takes a minute at\n' +
          '  https://aistudio.google.com/apikey . Without one, CHIEF still works in fallback mode.',
      );
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const key = (await rl.question('  Paste a Gemini API key (or press Enter to skip): ')).trim();
      rl.close();
      if (key) {
        const next = /^GEMINI_API_KEY=.*$/m.test(env)
          ? env.replace(/^GEMINI_API_KEY=.*$/m, `GEMINI_API_KEY=${key}`)
          : `${env}\nGEMINI_API_KEY=${key}\n`;
        writeFileSync(envFile, next);
        info('Saved to agent/.env (git-ignored).');
      } else info('Skipped: CHIEF answers in fallback mode.');
    }
    agentReady = true;
  }
}

// --- 4. Demo data --------------------------------------------------------------------------------------
if (args.has('--keep-data') && existsSync(join(root, 'backend', 'var', 'chief.db'))) {
  step('Keeping the current mission data (--keep-data)');
} else {
  step('Loading a fresh demo mission (day 60 of 180, 4 crew members, NASA data)');
  run('npm', ['run', 'db:reset', '-w', 'backend', '--silent']);
}

// --- 5. Run --------------------------------------------------------------------------------------------
step('Starting CHIEF');
info(
  `Frontend ${APP_URL} · backend http://localhost:3000 · agent ${agentReady ? 'http://localhost:8000' : 'off (fallback mode)'}`,
);
info('Press Ctrl+C to stop everything.\n');
const dev = spawn('npm', ['run', 'dev'], {
  cwd: root,
  stdio: 'inherit',
  shell: isWin,
  env: { ...process.env, ...(agentReady ? {} : { CHIEF_NO_AGENT: '1' }) },
});
dev.on('exit', (code) => process.exit(code ?? 0));
process.on('SIGINT', () => dev.kill('SIGINT'));

// Open the browser once the frontend answers.
if (!args.has('--no-open')) {
  const started = Date.now();
  const timer = setInterval(async () => {
    try {
      const res = await fetch(APP_URL);
      if (!res.ok) return;
      clearInterval(timer);
      console.log(`\n\x1b[1;32m✔ CHIEF is running: ${APP_URL}\x1b[0m\n`);
      const opener = isWin
        ? ['cmd', ['/c', 'start', '', APP_URL]]
        : process.platform === 'darwin'
          ? ['open', [APP_URL]]
          : ['xdg-open', [APP_URL]];
      spawn(opener[0], opener[1], { stdio: 'ignore', detached: true })
        .on('error', () => {})
        .unref();
    } catch {
      if (Date.now() - started > 120_000) clearInterval(timer);
    }
  }, 1500);
}
