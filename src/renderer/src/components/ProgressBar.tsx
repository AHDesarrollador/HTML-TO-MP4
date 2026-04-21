import React from 'react'
import { ProgressData } from '../../../main/types'

interface Props {
  data: ProgressData | null
  visible: boolean
}

const PHASE_LABELS: Record<ProgressData['phase'], string> = {
  building: 'Construyendo proyecto',
  capturing: 'Capturando frames',
  encoding: 'Codificando video',
}

export function ProgressBar({ data, visible }: Props): React.ReactElement | null {
  if (!visible) return null

  const percent = data?.percent ?? 0
  const phase = data ? PHASE_LABELS[data.phase] : 'Iniciando...'
  const message = data?.message ?? ''

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs text-gray-400">
        <span>{phase}</span>
        <span>{Math.round(percent)}%</span>
      </div>
      <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
        <div
          className="h-2 rounded-full bg-accent transition-all duration-200"
          style={{ width: `${percent}%` }}
        />
      </div>
      {message && <p className="text-xs text-gray-500 truncate">{message}</p>}
    </div>
  )
}
