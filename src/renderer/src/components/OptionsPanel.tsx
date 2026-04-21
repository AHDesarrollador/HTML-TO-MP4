import React from 'react'
import { ConversionOptions, DEFAULT_OPTIONS } from '../../../main/types'

interface Props {
  value: ConversionOptions
  onChange: (opts: ConversionOptions) => void
}

const PRESETS = [
  { label: '1080p 30fps', width: 1920, height: 1080, fps: 30 },
  { label: '720p 30fps', width: 1280, height: 720, fps: 30 },
  { label: '4K 24fps', width: 3840, height: 2160, fps: 24 },
]

const FPS_OPTIONS = [24, 30, 60]

export function OptionsPanel({ value, onChange }: Props): React.ReactElement {
  const set = (patch: Partial<ConversionOptions>) => onChange({ ...value, ...patch })

  return (
    <div className="bg-gray-900 rounded-lg p-4 space-y-4">
      <p className="text-xs text-gray-400 uppercase tracking-widest">Opciones de exportación</p>

      <div>
        <label className="text-xs text-gray-400 block mb-1">Duración (segundos)</label>
        <input
          type="number"
          min={1}
          max={300}
          value={value.duration}
          onChange={(e) => set({ duration: Number(e.target.value) })}
          className="w-full bg-gray-800 rounded px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-gray-400 block mb-1">Ancho (px)</label>
          <input
            type="number"
            min={1}
            value={value.width}
            onChange={(e) => set({ width: Number(e.target.value) })}
            className="w-full bg-gray-800 rounded px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">Alto (px)</label>
          <input
            type="number"
            min={1}
            value={value.height}
            onChange={(e) => set({ height: Number(e.target.value) })}
            className="w-full bg-gray-800 rounded px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
      </div>

      <div>
        <label className="text-xs text-gray-400 block mb-1">FPS</label>
        <div className="flex gap-2">
          {FPS_OPTIONS.map((f) => (
            <button
              key={f}
              onClick={() => set({ fps: f })}
              className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                value.fps === f
                  ? 'bg-accent text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-xs text-gray-400 block mb-1">Nombre del archivo</label>
        <input
          type="text"
          value={value.outputName}
          onChange={(e) => set({ outputName: e.target.value })}
          className="w-full bg-gray-800 rounded px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>

      <div>
        <p className="text-xs text-gray-500 mb-2">Presets rápidos</p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => set({ width: p.width, height: p.height, fps: p.fps })}
              className="text-xs px-3 py-1 rounded bg-gray-800 text-gray-400 hover:bg-gray-700 transition-colors"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
