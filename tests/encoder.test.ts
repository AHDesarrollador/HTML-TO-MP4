import { describe, it, expect, vi } from 'vitest'

const {
  mockRun,
  mockOn,
  mockOutput,
  mockFps,
  mockVideoCodec,
  mockOutputOptions,
  mockInputFPS,
  mockInput,
} = vi.hoisted(() => {
  const mockRun = vi.fn()
  const mockOn = vi.fn().mockImplementation(function (this: any, _event: string, _cb: Function) {
    return this
  })
  const mockOutput = vi.fn().mockImplementation(function (this: any) { return this })
  const mockFps = vi.fn().mockImplementation(function (this: any) { return this })
  const mockVideoCodec = vi.fn().mockImplementation(function (this: any) { return this })
  const mockOutputOptions = vi.fn().mockImplementation(function (this: any) { return this })
  const mockInputFPS = vi.fn().mockImplementation(function (this: any) { return this })
  const mockInput = vi.fn().mockImplementation(function (this: any) { return this })
  return { mockRun, mockOn, mockOutput, mockFps, mockVideoCodec, mockOutputOptions, mockInputFPS, mockInput }
})

vi.mock('fluent-ffmpeg', () => {
  const chain = {
    input: mockInput,
    inputFPS: mockInputFPS,
    videoCodec: mockVideoCodec,
    outputOptions: mockOutputOptions,
    fps: mockFps,
    output: mockOutput,
    on: mockOn,
    run: mockRun,
  }
  Object.values(chain).forEach((fn) => {
    if (typeof fn === 'function') {
      vi.mocked(fn).mockReturnValue(chain)
    }
  })
  const ffmpegFactory = vi.fn(() => chain) as any
  ffmpegFactory.setFfmpegPath = vi.fn()
  return { default: ffmpegFactory }
})

vi.mock('ffmpeg-static', () => ({ default: '/usr/bin/ffmpeg' }))

import { encodeToMp4 } from '../src/main/encoder'

describe('encodeToMp4', () => {
  it('calls ffmpeg with correct params and resolves on end', async () => {
    // Simulate ffmpeg 'end' event
    mockOn.mockImplementation(function (this: any, event: string, cb: Function) {
      if (event === 'end') setTimeout(() => cb(), 0)
      return this
    })

    await expect(
      encodeToMp4({
        framesDir: '/tmp/frames',
        outputPath: '/tmp/out.mp4',
        fps: 30,
        width: 1920,
        height: 1080,
        onProgress: vi.fn(),
      })
    ).resolves.toBeUndefined()

    expect(mockVideoCodec).toHaveBeenCalledWith('libx264')
    expect(mockInputFPS).toHaveBeenCalledWith(30)
  })

  it('rejects when ffmpeg emits error', async () => {
    mockOn.mockImplementation(function (this: any, event: string, cb: Function) {
      if (event === 'error') setTimeout(() => cb(new Error('ffmpeg crashed')), 0)
      return this
    })

    await expect(
      encodeToMp4({
        framesDir: '/tmp/frames',
        outputPath: '/tmp/out.mp4',
        fps: 30,
        width: 1920,
        height: 1080,
        onProgress: vi.fn(),
      })
    ).rejects.toThrow('ffmpeg crashed')
  })
})
