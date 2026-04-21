// src/main/index.ts
import { app, BrowserWindow, shell } from 'electron'
import * as path from 'path'
import { registerIpcHandlers } from './ipc'

// Set FFmpeg path for packaged app
if (app.isPackaged) {
  process.env.FFMPEG_PATH = path.join(process.resourcesPath, 'ffmpeg', 'ffmpeg.exe')
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1024,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    title: 'React → MP4 Converter',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  registerIpcHandlers(win)
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
