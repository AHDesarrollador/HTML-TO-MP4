// src/main/ipc.ts
import { ipcMain, dialog, BrowserWindow } from 'electron'
import * as path from 'path'
import { ConversionJob, ConversionOptions } from './types'
import { buildAndServe, BuildResult } from './builder'
import { captureFrames } from './capturer'
import { encodeToMp4 } from './encoder'
import { ConversionQueue } from './queue'
import {
  isRemotionProject,
  installDeps,
  listRemotionCompositions,
  renderRemotionToMp4,
} from './remotion'

const queue = new ConversionQueue()
let currentBuildResult: BuildResult | null = null
let cancelRequested = false

async function runConversion(
  job: ConversionJob,
  onProgress: (p: number) => void,
  win: BrowserWindow
): Promise<void> {
  cancelRequested = false

  const sendProgress = (phase: string, message: string, percent: number) => {
    win.webContents.send('convert:progress', { phase, message, percent })
  }

  // Remotion projects: render directly via Remotion CLI (skips capture & encode)
  if (isRemotionProject(job.inputPath)) {
    sendProgress('building', 'Proyecto Remotion detectado. Instalando dependencias...', 0)
    await installDeps(job.inputPath, (msg) => sendProgress('building', msg, 5))
    onProgress(10)

    if (cancelRequested) throw new Error('Cancelled')

    sendProgress('building', 'Listando composiciones...', 10)
    const compositions = await listRemotionCompositions(job.inputPath)
    if (compositions.length === 0) {
      throw new Error('No se encontraron composiciones en el proyecto Remotion.')
    }

    const { id: compositionId, entryPoint } = compositions[0]
    const outputMp4 = path.join(job.outputPath, job.options.outputName)

    sendProgress('rendering', `Composición: "${compositionId}". Iniciando render...`, 15)
    onProgress(15)

    await renderRemotionToMp4(
      job.inputPath,
      compositionId,
      entryPoint,
      outputMp4,
      (msg, pct) => {
        const total = 15 + Math.round(pct * 0.85)
        onProgress(total)
        sendProgress('rendering', msg, total)
      }
    )

    onProgress(100)
    return
  }

  // Standard path: build → serve → capture → encode
  sendProgress('building', 'Running npm install & build...', 0)
  const buildResult = await buildAndServe(job.inputPath, (msg) => {
    sendProgress('building', msg, 10)
  })
  currentBuildResult = buildResult
  onProgress(30)

  try {
    if (cancelRequested) throw new Error('Cancelled')

    sendProgress('capturing', 'Capturing frames...', 30)
    const { framesDir } = await captureFrames({
      url: buildResult.url,
      width: job.options.width,
      height: job.options.height,
      fps: job.options.fps,
      duration: job.options.duration,
      onProgress: (frame, total) => {
        const pct = 30 + Math.round((frame / total) * 40)
        onProgress(pct)
        sendProgress('capturing', `Capturing frame ${frame}/${total}`, pct)
      },
    })

    if (cancelRequested) throw new Error('Cancelled')

    sendProgress('encoding', 'Encoding MP4...', 70)
    const outputPath = path.join(job.outputPath, job.options.outputName)
    await encodeToMp4({
      framesDir,
      outputPath,
      fps: job.options.fps,
      width: job.options.width,
      height: job.options.height,
      onProgress: (pct) => {
        const total = 70 + Math.round(pct * 0.3)
        onProgress(total)
        sendProgress('encoding', `Encoding... ${pct}%`, total)
      },
    })
    onProgress(100)
  } finally {
    await buildResult.stop()
    currentBuildResult = null
  }
}

export function registerIpcHandlers(win: BrowserWindow): void {
  // Dialogs
  ipcMain.handle('dialog:selectFolder', async () => {
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
    })
    return result.canceled ? null : result.filePaths[0]
  })

  // Single conversion
  ipcMain.handle(
    'convert:start',
    async (_event, inputPath: string, outputPath: string, options: ConversionOptions) => {
      const job: ConversionJob = {
        id: 'single',
        inputPath,
        outputPath,
        options,
        status: 'in_progress',
        progress: 0,
      }
      try {
        await runConversion(job, (p) => { job.progress = p }, win)
        win.webContents.send('convert:done')
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[convert:start] error:', msg)
        win.webContents.send('convert:done', msg)
      }
    }
  )

  ipcMain.on('convert:cancel', () => {
    cancelRequested = true
    currentBuildResult?.stop()
  })

  // Batch
  ipcMain.handle(
    'batch:add',
    (_event, inputPath: string, outputPath: string, options: ConversionOptions) => {
      const job = queue.addJob(inputPath, outputPath, options)
      win.webContents.send('batch:updated', queue.getJobs())
      return job
    }
  )

  ipcMain.on('batch:start', () => {
    queue.start((job, onProgress) => runConversion(job, onProgress, win))
    queue.on('job-updated', () => win.webContents.send('batch:updated', queue.getJobs()))
  })

  ipcMain.on('batch:stop', () => queue.stop())

  ipcMain.on('batch:clear', () => {
    queue.clearCompleted()
    win.webContents.send('batch:updated', queue.getJobs())
  })
}
