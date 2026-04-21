import { useState, useEffect, useCallback } from 'react'
import { ConversionOptions, ProgressData, DEFAULT_OPTIONS } from '../../../main/types'
import { ipc } from '../ipc'

type Status = 'idle' | 'running' | 'done' | 'error'

export function useConversion() {
  const [options, setOptions] = useState<ConversionOptions>(DEFAULT_OPTIONS)
  const [inputPath, setInputPath] = useState<string>('')
  const [outputPath, setOutputPath] = useState<string>('')
  const [status, setStatus] = useState<Status>('idle')
  const [progress, setProgress] = useState<ProgressData | null>(null)
  const [errorMsg, setErrorMsg] = useState<string>('')

  useEffect(() => {
    const unsubProgress = ipc.onConvertProgress((d) => setProgress(d))
    const unsubDone = ipc.onConvertDone((err) => {
      if (err) {
        setStatus('error')
        setErrorMsg(err)
      } else {
        setStatus('done')
      }
    })
    return () => {
      unsubProgress()
      unsubDone()
    }
  }, [])

  const pickInput = useCallback(async () => {
    const folder = await ipc.selectFolder()
    if (folder) setInputPath(folder)
  }, [])

  const pickOutput = useCallback(async () => {
    const folder = await ipc.selectFolder()
    if (folder) setOutputPath(folder)
  }, [])

  const start = useCallback(async () => {
    if (!inputPath || !outputPath) return
    setStatus('running')
    setProgress(null)
    setErrorMsg('')
    await ipc.convertStart(inputPath, outputPath, options)
  }, [inputPath, outputPath, options])

  const cancel = useCallback(() => {
    ipc.convertCancel()
    setStatus('idle')
    setProgress(null)
  }, [])

  const reset = useCallback(() => {
    setStatus('idle')
    setProgress(null)
    setErrorMsg('')
  }, [])

  return {
    options,
    setOptions,
    inputPath,
    outputPath,
    pickInput,
    pickOutput,
    status,
    progress,
    errorMsg,
    start,
    cancel,
    reset,
  }
}
