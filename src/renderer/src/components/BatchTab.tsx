import React from 'react'
import { JobItem } from './JobItem'
import { OptionsPanel } from './OptionsPanel'
import { useBatchQueue } from '../hooks/useBatchQueue'

export function BatchTab(): React.ReactElement {
  const { jobs, options, setOptions, running, addJob, start, stop, clear } = useBatchQueue()

  const hasJobs = jobs.length > 0
  const allDone = hasJobs && jobs.every((j) => j.status === 'completed' || j.status === 'failed')

  return (
    <div className="flex flex-col gap-4 h-full">
      <OptionsPanel value={options} onChange={setOptions} />

      <div className="flex gap-2">
        <button
          onClick={addJob}
          disabled={running}
          className="flex-1 py-2 rounded bg-gray-700 text-sm text-white hover:bg-gray-600 disabled:opacity-50 transition-colors"
        >
          + Agregar proyecto
        </button>
        {hasJobs && !running && (
          <button
            onClick={clear}
            className="px-4 py-2 rounded bg-gray-800 text-sm text-gray-400 hover:bg-gray-700 transition-colors"
          >
            Limpiar
          </button>
        )}
      </div>

      {hasJobs && (
        <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
          {jobs.map((job) => (
            <JobItem key={job.id} job={job} />
          ))}
        </div>
      )}

      {!hasJobs && (
        <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
          No hay proyectos en cola
        </div>
      )}

      <div className="mt-auto flex gap-3">
        {running ? (
          <button
            onClick={stop}
            className="flex-1 py-3 rounded bg-red-700 text-white font-semibold hover:bg-red-600 transition-colors"
          >
            Detener cola
          </button>
        ) : (
          <button
            onClick={start}
            disabled={!hasJobs || allDone}
            className="flex-1 py-3 rounded bg-accent text-white font-semibold hover:bg-accent-hover disabled:opacity-40 transition-colors"
          >
            Iniciar cola
          </button>
        )}
      </div>
    </div>
  )
}
