import { useState, useEffect, useCallback } from 'react'
import { ConversionJob, ConversionOptions, DEFAULT_OPTIONS } from '../../../main/types'
import { ipc } from '../ipc'

export function useBatchQueue(defaultOutputPath?: string) {
  const [jobs, setJobs] = useState<ConversionJob[]>([])
  const [options, setOptions] = useState<ConversionOptions>({ ...DEFAULT_OPTIONS, fps: 24 })
  const [running, setRunning] = useState(false)

  useEffect(() => {
    const unsub = ipc.onBatchUpdated((updated) => {
      setJobs(updated)
      const anyRunning = updated.some((j) => j.status === 'in_progress')
      const anyPending = updated.some((j) => j.status === 'pending')
      setRunning(anyRunning || anyPending)
    })
    return unsub
  }, [])

  const addJob = useCallback(async () => {
    const inputPath = await ipc.selectFolder()
    if (!inputPath) return
    // Use the shared output path from ConfigPanel if already set, else ask
    const outputPath = defaultOutputPath || await ipc.selectFolder()
    if (!outputPath) return
    await ipc.batchAdd(inputPath, outputPath, options)
  }, [options, defaultOutputPath])

  const start = useCallback(() => {
    ipc.batchStart()
    setRunning(true)
  }, [])

  const stop = useCallback(() => {
    ipc.batchStop()
    setRunning(false)
  }, [])

  const clear = useCallback(() => {
    ipc.batchClear()
  }, [])

  return { jobs, options, setOptions, running, addJob, start, stop, clear }
}
