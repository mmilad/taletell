const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const workerRoot = path.join(repoRoot, 'apps', 'image-lab', 'worker');
const workerPath = path.join(workerRoot, 'flux_worker.py');
const defaultOutputDirectory = process.env.STORYTELLER_FLUX_OUTPUT_DIR || path.join(repoRoot, 'generated-assets');
const generationTimeoutMs = Number(process.env.STORYTELLER_FLUX_TIMEOUT_MS || 15 * 60 * 1000);

function resolvePython() {
  if (process.env.STORYTELLER_PYTHON) return process.env.STORYTELLER_PYTHON;
  const windows = path.join(workerRoot, '.venv', 'Scripts', 'python.exe');
  const posix = path.join(workerRoot, '.venv', 'bin', 'python');
  if (fs.existsSync(windows)) return windows;
  if (fs.existsSync(posix)) return posix;
  return process.platform === 'win32' ? 'python' : 'python3';
}

function workerEnv() {
  const env = { ...process.env };
  const hasVenv = fs.existsSync(path.join(workerRoot, '.venv', 'Scripts', 'python.exe')) || fs.existsSync(path.join(workerRoot, '.venv', 'bin', 'python'));
  env.STORYTELLER_FLUX_MODE = env.STORYTELLER_FLUX_MODE || (hasVenv ? 'real' : 'mock');
  env.STORYTELLER_FLUX_MODEL = env.STORYTELLER_FLUX_MODEL || 'black-forest-labs/FLUX.2-klein-4B';
  return env;
}

let worker;
let stdout = '';
const queue = [];

function ensureWorker() {
  if (worker) return worker;
  worker = spawn(resolvePython(), ['-u', workerPath], { env: workerEnv(), cwd: repoRoot });
  worker.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
    const lines = stdout.split(/\r?\n/);
    stdout = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      const pending = queue.shift();
      if (!pending) continue;
      try { pending.resolve(JSON.parse(line)); }
      catch (error) { pending.reject(error); }
    }
  });
  worker.stderr.on('data', (chunk) => { process.stderr.write(chunk); });
  worker.on('error', (error) => {
    const pending = queue.shift();
    if (pending) pending.reject(error);
  });
  worker.on('close', (code, signal) => {
    const pending = queue.shift();
    if (pending) pending.reject(new Error(`Image worker exited with ${code ?? signal}`));
    worker = undefined;
  });
  return worker;
}

function askWorker(request) {
  return new Promise((resolve, reject) => {
    const child = ensureWorker();
    const timer = setTimeout(() => reject(new Error(`Image generation timed out after ${Math.round(generationTimeoutMs / 60000)} minutes.`)), generationTimeoutMs);
    queue.push({
      resolve: (value) => { clearTimeout(timer); resolve(value); },
      reject: (error) => { clearTimeout(timer); reject(error); }
    });
    child.stdin.write(`${JSON.stringify({ ...request, outputDirectory: request.outputDirectory || defaultOutputDirectory })}\n`);
  });
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 650,
    webPreferences: { contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, 'preload.cjs') }
  });
  window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

ipcMain.handle('generate-images', async (_event, request) => askWorker(request));
ipcMain.handle('image-status', async () => new Promise((resolve, reject) => {
  const probe = spawn(resolvePython(), ['-u', workerPath, 'status'], { env: workerEnv(), cwd: repoRoot });
  let output = '';
  probe.stdout.on('data', (chunk) => { output += chunk.toString(); });
  probe.stderr.on('data', (chunk) => { output += chunk.toString(); });
  probe.on('error', reject);
  probe.on('close', () => {
    try { resolve(JSON.parse(output.trim().split(/\r?\n/).filter(Boolean).pop() || '{}')); }
    catch (error) { reject(error); }
  });
}));

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
