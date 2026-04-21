import React from 'react'
import { ConversionJob } from '../../../main/types'

const basename = (p: string): string => p.replace(/\\/g, '/').split('/').pop() ?? p

const STATUS_COLORS: Record<ConversionJob['status'], string> = {
  pending: 'text-gray-400',
  in_progress: 'text-accent',
  completed: 'text-green-400',
  failed: 'text-red-400',
}

const STATUS_LABELS: Record<ConversionJob['status'], string> = {
  pending: 'En espera',
  in_progress: 'Procesando',
  completed: 'Completado',
  failed: 'Error',
}

interface Props {
  job: ConversionJob
}

export function JobItem({ job }: Props): React.ReactElement {
  return (
    <div className="bg-gray-800 rounded-lg px-4 py-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white truncate">{basename(job.inputPath)}</p>
        <p className="text-xs text-gray-500 truncate">{basename(job.outputPath)}</p>
        {job.status === 'in_progress' && (
          <div className="mt-1 w-full bg-gray-700 rounded-full h-1 overflow-hidden">
            <div
              className="h-1 rounded-full bg-accent transition-all duration-200"
              style={{ width: `${job.progress}%` }}
            />
          </div>
        )}
        {job.status === 'failed' && job.error && (
          <p className="text-xs text-red-400 mt-1 truncate">{job.error}</p>
        )}
      </div>
      <span className={`text-xs font-medium shrink-0 ${STATUS_COLORS[job.status]}`}>
        {STATUS_LABELS[job.status]}
      </span>
    </div>
  )
}
