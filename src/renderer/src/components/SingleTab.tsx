import React from 'react'
import { OptionsPanel } from './OptionsPanel'
import { ProgressBar } from './ProgressBar'
import { useConversion } from '../hooks/useConversion'

export function SingleTab(): React.ReactElement {
  const {
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
  } = useConversion()

  const running = status === 'running'
  const canStart = !!inputPath && !!outputPath && !running

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="space-y-2">
        <label className="text-xs text-gray-400 uppercase tracking-widest block">
          Proyecto React (carpeta)
        </label>
        <div className="flex gap-2">
          <input
            readOnly
            value={inputPath}
            placeholder="Seleccionar carpeta..."
            className="flex-1 bg-gray-800 rounded px-3 py-2 text-sm text-white focus:outline-none truncate"
          />
          <button
            onClick={pickInput}
            disabled={running}
            className="px-4 py-2 rounded bg-gray-700 text-sm text-white hover:bg-gray-600 disabled:opacity-50 transition-colors"
          >
            Explorar
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs text-gray-400 uppercase tracking-widest block">
          Carpeta de salida
        </label>
        <div className="flex gap-2">
          <input
            readOnly
            value={outputPath}
            placeholder="Seleccionar carpeta..."
            className="flex-1 bg-gray-800 rounded px-3 py-2 text-sm text-white focus:outline-none truncate"
          />
          <button
            onClick={pickOutput}
            disabled={running}
            className="px-4 py-2 rounded bg-gray-700 text-sm text-white hover:bg-gray-600 disabled:opacity-50 transition-colors"
          >
            Explorar
          </button>
        </div>
      </div>

      <OptionsPanel value={options} onChange={setOptions} />

      {running && (
        <ProgressBar data={progress} visible={true} />
      )}

      {status === 'done' && (
        <div className="flex items-center justify-between bg-green-900/40 border border-green-700 rounded px-4 py-3 text-sm text-green-300">
          <span>Video exportado correctamente.</span>
          <button onClick={reset} className="text-xs underline hover:text-green-200">
            Nuevo
          </button>
        </div>
      )}

      {status === 'error' && (
        <div className="flex items-center justify-between bg-red-900/40 border border-red-700 rounded px-4 py-3 text-sm text-red-300">
          <span className="truncate">{errorMsg || 'Error desconocido'}</span>
          <button onClick={reset} className="text-xs underline hover:text-red-200 ml-2 shrink-0">
            Reintentar
          </button>
        </div>
      )}

      <div className="mt-auto flex gap-3">
        {running ? (
          <button
            onClick={cancel}
            className="flex-1 py-3 rounded bg-red-700 text-white font-semibold hover:bg-red-600 transition-colors"
          >
            Cancelar
          </button>
        ) : (
          <button
            onClick={start}
            disabled={!canStart}
            className="flex-1 py-3 rounded bg-accent text-white font-semibold hover:bg-accent-hover disabled:opacity-40 transition-colors"
          >
            Convertir a MP4
          </button>
        )}
      </div>
    </div>
  )
}
