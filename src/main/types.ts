// src/main/types.ts

export interface ConversionOptions {
  width: number        // px, default: 1920
  height: number       // px, default: 1080
  fps: number          // default: 30
  duration: number     // segundos, default: 5
  outputName: string   // default: "output.mp4"
}

export interface ConversionJob {
  id: string
  inputPath: string    // carpeta raíz del proyecto React
  outputPath: string   // carpeta de destino del MP4
  options: ConversionOptions
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  progress: number     // 0-100
  error?: string
}

export interface ProgressData {
  phase: 'building' | 'capturing' | 'encoding'
  message: string
  percent: number
}

export const DEFAULT_OPTIONS: ConversionOptions = {
  width: 1920,
  height: 1080,
  fps: 30,
  duration: 5,
  outputName: 'output.mp4',
}
