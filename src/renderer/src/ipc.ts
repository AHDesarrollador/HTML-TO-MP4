import type { ConversionOptions, ConversionJob, ProgressData } from '../../main/types'

const api = (window as any).api as {
  selectFolder: () => Promise<string | null>
  listFolder: (folderPath: string) => Promise<Array<{ name: string; isDir: boolean; size?: number }>>
  openUrl: (url: string) => Promise<void>
  openFolder: (folderPath: string) => Promise<void>
  convertStart: (i: string, o: string, opts: ConversionOptions) => Promise<void>
  convertCancel: () => void
  onConvertProgress: (cb: (d: ProgressData) => void) => () => void
  onConvertDone: (cb: (error?: string) => void) => () => void
  batchAdd: (i: string, o: string, opts: ConversionOptions) => Promise<ConversionJob>
  batchStart: () => void
  batchStop: () => void
  batchClear: () => void
  onBatchUpdated: (cb: (jobs: ConversionJob[]) => void) => () => void
}

export const ipc = api
