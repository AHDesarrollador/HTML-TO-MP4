// src/main/capturer.ts
import { BrowserWindow } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'

export interface CaptureOptions {
  url: string
  width: number
  height: number
  fps: number
  duration: number
  onProgress: (frame: number, total: number) => void
}

export interface CaptureResult {
  framesDir: string
  frameCount: number
}

export async function captureFrames(options: CaptureOptions): Promise<CaptureResult> {
  const { url, width, height, fps, duration, onProgress } = options
  const totalFrames = Math.round(fps * duration)
  const intervalMs = 1000 / fps

  const framesDir = path.join(os.tmpdir(), `react-to-mp4-${Date.now()}`)
  fs.mkdirSync(framesDir, { recursive: true })

  const win = new BrowserWindow({
    width,
    height,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      offscreen: false,
    },
  })

  try {
    await loadPage(win, url)
    // Allow animations to initialize
    await sleep(500)

    for (let i = 0; i < totalFrames; i++) {
      const start = Date.now()

      const image = await win.webContents.capturePage({
        x: 0,
        y: 0,
        width,
        height,
      })

      const framePath = path.join(framesDir, `frame-${String(i).padStart(6, '0')}.png`)
      fs.writeFileSync(framePath, image.toPNG())
      onProgress(i + 1, totalFrames)

      const elapsed = Date.now() - start
      const wait = intervalMs - elapsed
      if (wait > 0) await sleep(wait)
    }

    return { framesDir, frameCount: totalFrames }
  } catch (err) {
    // Clean up frames on error
    fs.rmSync(framesDir, { recursive: true, force: true })
    throw err
  } finally {
    win.destroy()
  }
}

function loadPage(win: BrowserWindow, url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Page load timeout (30s)')),
      30_000
    )
    win.webContents.once('did-finish-load', () => {
      clearTimeout(timeout)
      resolve()
    })
    win.webContents.once('did-fail-load', (_e, _code, desc) => {
      clearTimeout(timeout)
      reject(new Error(`Page load failed: ${desc}`))
    })
    win.loadURL(url)
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
