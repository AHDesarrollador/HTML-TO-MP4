import ffmpeg from 'fluent-ffmpeg'
import * as path from 'path'
import * as fs from 'fs'
import ffmpegPath from 'ffmpeg-static'

ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH ?? ffmpegPath!)

export interface EncodeOptions {
  framesDir: string
  outputPath: string
  fps: number
  width: number
  height: number
  onProgress: (percent: number) => void
}

export function encodeToMp4(options: EncodeOptions): Promise<void> {
  const { framesDir, outputPath, fps, width, height, onProgress } = options

  return new Promise((resolve, reject) => {
    const cleanup = () => fs.rmSync(framesDir, { recursive: true, force: true })

    ffmpeg()
      .input(path.join(framesDir, 'frame-%06d.png'))
      .inputFPS(fps)
      .videoCodec('libx264')
      .outputOptions([
        '-pix_fmt yuv420p',
        `-vf scale=${width}:${height}`,
        '-preset fast',
        '-crf 18',
      ])
      .fps(fps)
      .output(outputPath)
      .on('progress', (p: { percent?: number }) => onProgress(Math.round(p.percent ?? 0)))
      .on('end', () => { cleanup(); resolve() })
      .on('error', (err: Error) => { cleanup(); reject(err) })
      .run()
  })
}
