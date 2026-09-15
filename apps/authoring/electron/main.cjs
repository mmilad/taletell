const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const { spawn } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const workerPath = path.join(repoRoot, 'apps', 'image-lab', 'worker', 'flux_worker.py');
const defaultPython = path.join(repoRoot, 'apps', 'image-lab', 'worker', '.venv', 'bin', 'python');
const defaultOutputDirectory = path.join(repoRoot, 'generated-assets');
const generationTimeoutMs = Number(process.env.STORYTELLER_FLUX_TIMEOUT_MS || 15 * 60 * 1000);

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

ipcMain.handle('generate-images', async (_event, request) => new Promise((resolve, reject) => {
  const workerPython = process.env.STORYTELLER_PYTHON || defaultPython;
  const childEnv = { ...process.env };
  const configuredMode = process.env.STORYTELLER_FLUX_MODE === 'real' ? 'real' : 'mock';
  childEnv.STORYTELLER_FLUX_MODE = configuredMode;
  childEnv.STORYTELLER_FLUX_MODEL = process.env.STORYTELLER_FLUX_MODEL || 'black-forest-labs/FLUX.2-klein-4B';
  const outputDirectory = request.outputDirectory || process.env.STORYTELLER_FLUX_OUTPUT_DIR || defaultOutputDirectory;
  const childRequest = { ...request, outputDirectory };
  const worker = spawn(workerPython, ['-u', workerPath], { env: childEnv, cwd: repoRoot });
  let stdout = '';
  let stderr = '';
  let settled = false;
  const finish = (fn, value) => { if (settled) return; settled = true; clearTimeout(timeout); fn(value); };
  const timeout = setTimeout(() => { worker.kill('SIGTERM'); finish(reject, new Error(`Image generation timed out after ${Math.round(generationTimeoutMs / 60000)} minutes.`)); }, generationTimeoutMs);
  worker.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
  worker.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  worker.on('error', (error) => finish(reject, error));
  worker.on('close', (code, signal) => {
    try {
      const line = stdout.trim().split(/\r?\n/).filter(Boolean).pop();
      const result = line ? JSON.parse(line) : {};
      if (code !== 0 || !result.ok) finish(reject, new Error(result.detail || result.error || stderr.trim() || `Worker exited with ${code ?? signal}`));
      else finish(resolve, result);
    } catch (error) { finish(reject, new Error(`Invalid image worker response: ${error.message}`)); }
  });
  worker.stdin.end(`${JSON.stringify(childRequest)}\n`);
}));

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
