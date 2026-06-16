/**
 * Cross-platform daemon manager for wechat-claude-code.
 * Replaces scripts/daemon.sh with native TypeScript.
 *
 * CLI: node dist/daemon.js {start|stop|restart|status|logs}
 *
 * Platform support:
 *   macOS  — launchd (plist-based, auto-start on boot, auto-restart on crash)
 *   Linux  — systemd (preferred) or direct mode (nohup + PID file)
 *   Win32  — direct mode (detached child + PID file)
 */

import { spawn, execSync } from 'node:child_process';
import {
  existsSync, readFileSync, writeFileSync, unlinkSync,
  mkdirSync, readdirSync, openSync, closeSync,
} from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Paths & constants
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATA_DIR = join(homedir(), '.wechat-claude-code');
const PID_FILE = join(DATA_DIR, 'wechat-claude-code.pid');
const LOG_DIR = join(DATA_DIR, 'logs');
const PROJECT_ROOT = resolve(__dirname, '..');

const SERVICE_NAME = 'wechat-claude-code';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readPid(): number | null {
  if (!existsSync(PID_FILE)) return null;
  try {
    const pid = parseInt(readFileSync(PID_FILE, 'utf8').trim(), 10);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Synchronous sleep using Atomics.wait (works on all platforms, Node 9+). */
function sleepMs(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Collect Anthropic/Claude env vars for passthrough to child / plist / systemd. */
function collectEnv(): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const key of ['ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL', 'CLAUDE_API_KEY']) {
    if (process.env[key]) vars[key] = process.env[key]!;
  }
  return vars;
}

/** Print bridge-*.log and stdout/stderr logs from LOG_DIR. */
function printLogs(): void {
  if (!existsSync(LOG_DIR)) {
    console.log('No logs found');
    return;
  }

  const bridgeLogs = readdirSync(LOG_DIR)
    .filter(f => f.startsWith('bridge-') && f.endsWith('.log'))
    .sort()
    .reverse();

  if (bridgeLogs.length > 0) {
    const latest = join(LOG_DIR, bridgeLogs[0]);
    console.log(`=== ${bridgeLogs[0]} (last 100 lines) ===`);
    const content = readFileSync(latest, 'utf8').split('\n').slice(-100).join('\n');
    console.log(content);
    console.log('');
  }

  for (const name of ['stdout.log', 'stderr.log']) {
    const f = join(LOG_DIR, name);
    if (existsSync(f)) {
      console.log(`=== ${name} (last 50 lines) ===`);
      const content = readFileSync(f, 'utf8').split('\n').slice(-50).join('\n');
      console.log(content);
      console.log('');
    }
  }
}

// ---------------------------------------------------------------------------
// Generic direct-mode start / stop (used by Linux fallback and Windows)
// ---------------------------------------------------------------------------

function directStart(): void {
  const pid = readPid();
  if (pid !== null && isAlive(pid)) {
    console.log(`Already running (PID: ${pid})`);
    process.exit(0);
  }
  if (pid !== null) {
    try { unlinkSync(PID_FILE); } catch { /* stale */ }
  }

  mkdirSync(LOG_DIR, { recursive: true });

  const stdoutPath = join(LOG_DIR, 'stdout.log');
  const stderrPath = join(LOG_DIR, 'stderr.log');
  const stdoutFd = openSync(stdoutPath, 'a');
  const stderrFd = openSync(stderrPath, 'a');

  const child = spawn(
    process.execPath,
    [join(PROJECT_ROOT, 'dist', 'main.js'), 'start'],
    {
      cwd: PROJECT_ROOT,
      detached: true,
      stdio: ['ignore', stdoutFd, stderrFd],
      env: { ...process.env },
    },
  );

  child.unref(); // allow the parent to exit independently

  writeFileSync(PID_FILE, String(child.pid!));
  closeSync(stdoutFd);
  closeSync(stderrFd);

  console.log(`Started (PID: ${child.pid})`);
  console.log(`Logs: ${LOG_DIR}`);
}

function directStop(): void {
  const pid = readPid();
  if (pid === null) {
    console.log('Not running (no PID file)');
    return;
  }

  if (!isAlive(pid)) {
    console.log('Process not running (cleaning up PID file)');
    try { unlinkSync(PID_FILE); } catch { /* ignore */ }
    return;
  }

  // Graceful shutdown — on Windows SIGTERM calls TerminateProcess
  try { process.kill(pid, 'SIGTERM'); } catch { /* ignore */ }

  // Wait up to 10 s for graceful exit
  let waited = 0;
  while (isAlive(pid) && waited < 10) {
    sleepMs(1000);
    waited++;
  }

  // Force kill if still alive
  if (isAlive(pid)) {
    if (process.platform === 'win32') {
      try { execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' }); } catch { /* ignore */ }
    } else {
      try { process.kill(pid, 'SIGKILL'); } catch { /* ignore */ }
    }
  }

  try { unlinkSync(PID_FILE); } catch { /* ignore */ }
  console.log(`Stopped (PID: ${pid})`);
}

function directStatus(): void {
  const pid = readPid();
  if (pid === null || !isAlive(pid)) {
    console.log('Not running');
    return;
  }
  console.log(`Running (PID: ${pid})`);
}

// ===========================================================================
// macOS (launchd)
// ===========================================================================

function macosPlistLabel(): string {
  return 'com.wechat-claude-code.bridge';
}

function macosPlistPath(): string {
  return join(homedir(), 'Library', 'LaunchAgents', `${macosPlistLabel()}.plist`);
}

function macosIsLoaded(): boolean {
  try {
    const uid = typeof process.getuid === 'function' ? process.getuid() : 0;
    execSync(`launchctl print "gui/${uid}/${macosPlistLabel()}"`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function macosStart(): void {
  if (macosIsLoaded()) {
    console.log('Already running (or plist loaded)');
    process.exit(0);
  }

  mkdirSync(LOG_DIR, { recursive: true });

  const extraEnv = collectEnv();
  const extraEnvXml = Object.entries(extraEnv)
    .map(([k, v]) => `    <key>${k}</key>\n    <string>${v}</string>`)
    .join('\n');

  const nodeBin = process.execPath;
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${macosPlistLabel()}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${nodeBin}</string>
    <string>${join(PROJECT_ROOT, 'dist', 'main.js')}</string>
    <string>start</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${PROJECT_ROOT}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${join(LOG_DIR, 'stdout.log')}</string>
  <key>StandardErrorPath</key>
  <string>${join(LOG_DIR, 'stderr.log')}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${homedir()}/.local/bin:${dirname(nodeBin)}:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
${extraEnvXml}  </dict>
</dict>
</plist>`;

  writeFileSync(macosPlistPath(), plist);
  execSync(`launchctl load "${macosPlistPath()}"`, { stdio: 'inherit' });
  console.log('Started wechat-claude-code daemon (macOS launchd)');
}

function macosStop(): void {
  try {
    const uid = typeof process.getuid === 'function' ? process.getuid() : 0;
    execSync(`launchctl bootout "gui/${uid}/${macosPlistLabel()}"`, { stdio: 'ignore' });
  } catch { /* ignore */ }
  try { unlinkSync(macosPlistPath()); } catch { /* ignore */ }
  console.log('Stopped wechat-claude-code daemon (macOS launchd)');
}

function macosStatus(): void {
  if (macosIsLoaded()) {
    try {
      const result = execSync('pgrep -f "dist/main.js start"', { encoding: 'utf8' });
      const pid = result.trim().split('\n')[0];
      if (pid) {
        console.log(`Running (PID: ${pid})`);
      } else {
        console.log('Loaded but not running');
      }
    } catch {
      console.log('Loaded but not running');
    }
  } else {
    console.log('Not running');
  }
}

// ===========================================================================
// Linux (systemd + direct fallback)
// ===========================================================================

function linuxServicePath(): string {
  return join(homedir(), '.config', 'systemd', 'user', `${SERVICE_NAME}.service`);
}

function linuxSystemdAvailable(): boolean {
  try {
    execSync('systemctl --user list-units', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function linuxCreateService(): void {
  const svcDir = dirname(linuxServicePath());
  mkdirSync(svcDir, { recursive: true });

  const extraEnv = collectEnv();
  const extraEnvLines = Object.entries(extraEnv)
    .map(([k, v]) => `Environment=${k}=${v}`)
    .join('\n');

  const nodeBin = process.execPath;
  const service = `[Unit]
Description=WeChat Claude Code Bridge
Documentation=https://github.com/Wechat-ggGitHub/wechat-claude-code
After=network.target

[Service]
Type=simple
ExecStart=${nodeBin} ${join(PROJECT_ROOT, 'dist', 'main.js')} start
WorkingDirectory=${PROJECT_ROOT}
Restart=always
RestartSec=10
Environment=PATH=${homedir()}/.local/bin:${dirname(nodeBin)}:/usr/local/bin:/usr/bin:/bin
${extraEnvLines}
StandardOutput=append:${join(LOG_DIR, 'stdout.log')}
StandardError=append:${join(LOG_DIR, 'stderr.log')}
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=default.target
`;

  writeFileSync(linuxServicePath(), service);
}

function linuxStart(): void {
  if (linuxSystemdAvailable()) {
    mkdirSync(LOG_DIR, { recursive: true });
    linuxCreateService();
    execSync('systemctl --user daemon-reload', { stdio: 'ignore' });
    execSync(`systemctl --user start ${SERVICE_NAME}`, { stdio: 'inherit' });
    try { execSync(`systemctl --user enable ${SERVICE_NAME}`, { stdio: 'ignore' }); } catch { /* non-fatal */ }
    console.log('Started wechat-claude-code daemon (Linux systemd)');
  } else {
    console.log('Note: systemd user session not available, using direct mode');
    console.log("To enable systemd mode, run: 'loginctl enable-linger $(whoami)'");
    console.log('');
    directStart();
  }
}

function linuxStop(): void {
  if (linuxSystemdAvailable()) {
    try {
      execSync(`systemctl --user cat ${SERVICE_NAME}`, { stdio: 'ignore' });
      execSync(`systemctl --user stop ${SERVICE_NAME}`, { stdio: 'ignore' });
      try { execSync(`systemctl --user disable ${SERVICE_NAME}`, { stdio: 'ignore' }); } catch { /* ignore */ }
      console.log('Stopped wechat-claude-code daemon (Linux systemd)');
      return;
    } catch { /* service file not found → fall through to direct */ }
  }
  directStop();
}

function linuxStatus(): void {
  if (linuxSystemdAvailable()) {
    try {
      execSync(`systemctl --user cat ${SERVICE_NAME}`, { stdio: 'ignore' });
      execSync(`systemctl --user status ${SERVICE_NAME} --no-pager`, { stdio: 'inherit' });
      return;
    } catch { /* fall through */ }
  }
  directStatus();
}

function linuxLogs(): void {
  if (linuxSystemdAvailable()) {
    try {
      execSync(`journalctl --user --unit=${SERVICE_NAME} --quiet`, { stdio: 'ignore' });
      console.log('=== systemd journal logs (last 100 lines) ===');
      execSync(`journalctl --user --unit=${SERVICE_NAME} --no-pager -n 100`, { stdio: 'inherit' });
      console.log('');
      console.log('=== File logs ===');
    } catch { /* no journal entries, just show files */ }
  }
  printLogs();
}

// ===========================================================================
// Main dispatcher
// ===========================================================================

function main(): void {
  const command = process.argv[2];
  const platform = process.platform;

  if (!command || !['start', 'stop', 'restart', 'status', 'logs'].includes(command)) {
    const platName = platform === 'darwin' ? 'macOS (launchd)'
      : platform === 'linux' ? 'Linux (systemd)'
      : 'Windows (direct mode)';
    console.log(`Usage: node dist/daemon.js {start|stop|restart|status|logs}`);
    console.log(`Platform: ${platName}`);
    process.exit(1);
  }

  switch (platform) {
    case 'darwin':
      switch (command) {
        case 'start':   macosStart(); break;
        case 'stop':    macosStop(); break;
        case 'restart': macosStop(); sleepMs(1000); macosStart(); break;
        case 'status':  macosStatus(); break;
        case 'logs':    printLogs(); break;
        default: break;
      }
      break;

    case 'linux':
      switch (command) {
        case 'start':   linuxStart(); break;
        case 'stop':    linuxStop(); break;
        case 'restart': linuxStop(); sleepMs(1000); linuxStart(); break;
        case 'status':  linuxStatus(); break;
        case 'logs':    linuxLogs(); break;
        default: break;
      }
      break;

    case 'win32':
      switch (command) {
        case 'start':   directStart(); break;
        case 'stop':    directStop(); break;
        case 'restart': directStop(); sleepMs(1000); directStart(); break;
        case 'status':  directStatus(); break;
        case 'logs':    printLogs(); break;
        default: break;
      }
      break;

    default:
      console.log(`Error: Unsupported platform '${platform}'`);
      console.log('Supported platforms: macOS (Darwin), Linux, Windows (Win32)');
      process.exit(1);
  }
}

main();
