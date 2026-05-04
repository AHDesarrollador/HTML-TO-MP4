// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron'
import type { ConversionOptions, ConversionJob, ProgressData } from '../main/types'

contextBridge.exposeInMainWorld('api', {
  // Diálogos
  selectFolder: (): Promise<string | null> =>
    ipcRenderer.invoke('dialog:selectFolder'),

  listFolder: (folderPath: string): Promise<Array<{ name: string; isDir: boolean; size?: number }>> =>
    ipcRenderer.invoke('folder:list', folderPath),

  openUrl: (url: string): Promise<void> =>
    ipcRenderer.invoke('shell:openUrl', url),

  openFolder: (folderPath: string): Promise<void> =>
    ipcRenderer.invoke('shell:openFolder', folderPath),

  // Conversión single
  convertStart: (
    inputPath: string,
    outputPath: string,
    options: ConversionOptions
  ): Promise<void> =>
    ipcRenderer.invoke('convert:start', inputPath, outputPath, options),

  convertCancel: (): void => ipcRenderer.send('convert:cancel'),

  onConvertProgress: (cb: (data: ProgressData) => void): (() => void) => {
    const listener = (_: Electron.IpcRendererEvent, data: ProgressData) => cb(data)
    ipcRenderer.on('convert:progress', listener)
    return () => ipcRenderer.removeListener('convert:progress', listener)
  },

  onConvertDone: (cb: (error?: string) => void): (() => void) => {
    const listener = (_: Electron.IpcRendererEvent, error?: string) => cb(error)
    ipcRenderer.on('convert:done', listener)
    return () => ipcRenderer.removeListener('convert:done', listener)
  },

  // Batch
  batchAdd: (
    inputPath: string,
    outputPath: string,
    options: ConversionOptions
  ): Promise<ConversionJob> =>
    ipcRenderer.invoke('batch:add', inputPath, outputPath, options),

  batchStart: (): void => ipcRenderer.send('batch:start'),
  batchStop: (): void => ipcRenderer.send('batch:stop'),
  batchClear: (): void => ipcRenderer.send('batch:clear'),

  onBatchUpdated: (cb: (jobs: ConversionJob[]) => void): (() => void) => {
    const listener = (_: Electron.IpcRendererEvent, jobs: ConversionJob[]) => cb(jobs)
    ipcRenderer.on('batch:updated', listener)
    return () => ipcRenderer.removeListener('batch:updated', listener)
  },
})
