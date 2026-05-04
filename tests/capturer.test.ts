// tests/capturer.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fs from 'fs'

// ── Mock puppeteer BEFORE importing capturer ──────────────────────────────────
const mockSend = vi.fn().mockResolvedValue(undefined)
const mockOnce = vi.fn().mockImplementation((_event: string, cb: () => void) => {
  setTimeout(cb, 0)
})
const mockCdpSession = { send: mockSend, once: mockOnce }

const mockEvaluate = vi.fn().mockResolvedValue(false)
const mockScreenshot = vi.fn().mockResolvedValue(Buffer.alloc(8))
const mockPage = {
  setViewport: vi.fn().mockResolvedValue(undefined),
  evaluateOnNewDocument: vi.fn().mockResolvedValue(undefined),
  goto: vi.fn().mockResolvedValue(undefined),
  createCDPSession: vi.fn().mockResolvedValue(mockCdpSession),
  screenshot: mockScreenshot,
  evaluate: mockEvaluate,
}
const mockClose = vi.fn().mockResolvedValue(undefined)
const mockBrowser = {
  newPage: vi.fn().mockResolvedValue(mockPage),
  close: mockClose,
}
const mockLaunch = vi.fn().mockResolvedValue(mockBrowser)

vi.mock('puppeteer', () => ({ default: { launch: mockLaunch } }))

import { captureFrames } from '../src/main/capturer'

// ── Base options (fps=2, duration=1 → 2 frames) ───────────────────────────────
const BASE: Parameters<typeof captureFrames>[0] = {
  url: 'http://localhost:19999',
  width: 320,
  height: 240,
  fps: 2,
  duration: 1,
  initDelayMs: 0,
  onProgress: vi.fn(),
}

describe('captureFrames', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockOnce.mockImplementation((_event: string, cb: () => void) => setTimeout(cb, 0))
    mockEvaluate.mockResolvedValue(false)
    mockScreenshot.mockResolvedValue(Buffer.alloc(8))
    mockLaunch.mockResolvedValue(mockBrowser)
    mockBrowser.newPage.mockResolvedValue(mockPage)
    mockPage.createCDPSession.mockResolvedValue(mockCdpSession)
  })

  it('returns frameCount matching fps * duration', async () => {
    const result = await captureFrames(BASE)
    expect(result.frameCount).toBe(2)
    fs.rmSync(result.framesDir, { recursive: true, force: true })
  })

  it('writes PNG files to framesDir', async () => {
    const result = await captureFrames(BASE)
    const files = fs.readdirSync(result.framesDir).filter((f) => f.endsWith('.png'))
    expect(files).toHaveLength(2)
    expect(files[0]).toBe('frame-000000.png')
    expect(files[1]).toBe('frame-000001.png')
    fs.rmSync(result.framesDir, { recursive: true, force: true })
  })

  it('launches Puppeteer with --use-gl=swiftshader and --enable-webgl', async () => {
    await captureFrames(BASE)
    const args: string[] = mockLaunch.mock.calls[0][0].args
    expect(args).toContain('--use-gl=swiftshader')
    expect(args).toContain('--enable-webgl')
    expect(args).toContain('--no-sandbox')
  })

  it('calls evaluateOnNewDocument once (WebGL preserveDrawingBuffer patch)', async () => {
    await captureFrames(BASE)
    expect(mockPage.evaluateOnNewDocument).toHaveBeenCalledOnce()
  })

  it('freezes virtual time before the loop', async () => {
    await captureFrames(BASE)
    const pauseCall = mockSend.mock.calls.find(
      ([cmd, p]) =>
        cmd === 'Emulation.setVirtualTimePolicy' &&
        p?.policy === 'pauseIfNetworkFetchesPending'
    )
    expect(pauseCall).toBeDefined()
  })

  it('advances virtual time once per frame', async () => {
    await captureFrames({ ...BASE, fps: 3, duration: 1 })
    const advanceCalls = mockSend.mock.calls.filter(
      ([cmd, p]) => cmd === 'Emulation.setVirtualTimePolicy' && p?.policy === 'advance'
    )
    expect(advanceCalls).toHaveLength(3)
  })

  it('advance budget equals 1000/fps ms', async () => {
    await captureFrames({ ...BASE, fps: 4, duration: 1 })
    const advance = mockSend.mock.calls.find(
      ([cmd, p]) => cmd === 'Emulation.setVirtualTimePolicy' && p?.policy === 'advance'
    )
    expect(advance![1].budget).toBeCloseTo(250, 5) // 1000/4 = 250ms
  })

  it('calls onProgress for each frame', async () => {
    const onProgress = vi.fn()
    await captureFrames({ ...BASE, fps: 3, duration: 1, onProgress })
    expect(onProgress).toHaveBeenCalledTimes(3)
    expect(onProgress).toHaveBeenNthCalledWith(1, 1, 3)
    expect(onProgress).toHaveBeenNthCalledWith(3, 3, 3)
  })

  it('closes browser after successful capture', async () => {
    await captureFrames(BASE)
    expect(mockClose).toHaveBeenCalledOnce()
  })

  it('closes browser and removes framesDir on error', async () => {
    mockPage.goto.mockRejectedValueOnce(new Error('load failed'))
    await expect(captureFrames(BASE)).rejects.toThrow('load failed')
    expect(mockClose).toHaveBeenCalledOnce()
  })

  it('uses canvas.toDataURL path when WebGL canvas detected', async () => {
    // First evaluate call: hasWebGL → true
    // Second evaluate call: toDataURL → dataUrl
    mockEvaluate
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce('data:image/png;base64,aGVsbG8=')
    const result = await captureFrames({ ...BASE, fps: 1, duration: 1 })
    expect(mockScreenshot).not.toHaveBeenCalled()
    expect(result.frameCount).toBe(1)
    fs.rmSync(result.framesDir, { recursive: true, force: true })
  })

  it('falls back to page.screenshot when no WebGL canvas', async () => {
    mockEvaluate.mockResolvedValue(false)
    await captureFrames({ ...BASE, fps: 1, duration: 1 })
    expect(mockScreenshot).toHaveBeenCalledOnce()
  })
})
