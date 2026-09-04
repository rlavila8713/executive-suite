/**
 * Electron main process (CommonJS: .cjs so it works with "type": "module" in package.json).
 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

const isDev = !app.isPackaged;
let apiProcess = null;

function waitForHealth(port, attempts = 30) {
  return new Promise((resolve) => {
    let n = 0;
    const tick = () => {
      const req = http.get(`http://127.0.0.1:${port}/health`, (res) => {
        res.resume();
        if (res.statusCode === 200) resolve(true);
        else retry();
      });
      req.on('error', retry);
      req.setTimeout(500, () => {
        req.destroy();
        retry();
      });
    };
    const retry = () => {
      n += 1;
      if (n >= attempts) {
        resolve(false);
        return;
      }
      setTimeout(tick, 200);
    };
    tick();
  });
}

function startApiServer() {
  const dataDir = app.getPath('userData');
  const port = process.env.PORT || '4000';
  const env = { ...process.env, DATA_DIR: dataDir, PORT: port };
  const projectRoot = path.join(__dirname, '..');

  if (isDev) {
    const serverEntry = path.join(projectRoot, 'server', 'index.ts');
    apiProcess = spawn('npx', ['tsx', serverEntry], {
      env,
      stdio: 'inherit',
      shell: true,
      cwd: projectRoot,
    });
    apiProcess.on('error', (err) => {
      console.warn('API server failed to start (dev). Is port', port, 'in use?', err.message);
    });
    return;
  }

  const bundled = path.join(projectRoot, 'server', 'dist', 'index.cjs');
  apiProcess = spawn(process.execPath, [bundled], {
    env: { ...env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: 'inherit',
    cwd: projectRoot,
  });
  apiProcess.on('error', (err) => {
    console.warn('API server failed to start. Is port', port, 'in use?', err.message);
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (isDev) {
    win.loadURL('http://localhost:3000');
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(async () => {
  startApiServer();
  const port = process.env.PORT || '4000';
  const ok = await waitForHealth(port);
  if (!ok) {
    console.warn(`API not reachable on 127.0.0.1:${port}; UI will show offline until it is available.`);
  }
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (apiProcess && !apiProcess.killed) {
    apiProcess.kill();
  }
});
