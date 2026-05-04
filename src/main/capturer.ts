// src/main/capturer.ts
import puppeteer from 'puppeteer'
import type { Page, CDPSession } from 'puppeteer'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'

export interface CaptureOptions {
  url: string
  width: number
  height: number
  fps: number
  duration: number
  initDelayMs?: number   // ms to wait after page load before freezing time (default: 500)
  onProgress: (frame: number, total: number) => void
}

export interface CaptureResult {
  framesDir: string
  frameCount: number
}

export async function captureFrames(options: CaptureOptions): Promise<CaptureResult> {
  const { url, width, height, fps, duration, onProgress, initDelayMs = 500 } = options
  const totalFrames = Math.round(fps * duration)
  const frameInterval = 1000 / fps

  const framesDir = path.join(os.tmpdir(), `html-to-mp4-${Date.now()}`)
  fs.mkdirSync(framesDir, { recursive: true })

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      `--window-size=${width},${height}`,
      '--use-gl=swiftshader',
      '--enable-webgl',
      '--disable-web-security',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--allow-file-access-from-files',
    ],
  })

  try {
    const page = await browser.newPage()
    await page.setViewport({ width, height })

    // Patch WebGL before page load: force preserveDrawingBuffer=true so
    // canvas.toDataURL() works after each rAF (Three.js clears buffer by default)
    await page.evaluateOnNewDocument(() => {
      const orig = HTMLCanvasElement.prototype.getContext
      ;(HTMLCanvasElement.prototype as any).getContext = function (
        type: string,
        attrs?: any
      ) {
        if (type === 'webgl' || type === 'webgl2') {
          attrs = { ...(attrs ?? {}), preserveDrawingBuffer: true }
        }
        return orig.call(this, type, attrs)
      }
    })

    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30_000 })
    await sleep(initDelayMs)

    const client: CDPSession = await page.createCDPSession()

    // Detect WebGL once — presence does not change between frames
    const hasWebGL = await page.evaluate(() => {
      const canvases = Array.from(document.querySelectorAll('canvas'))
      return canvases.some(
        (c) => c.getContext('webgl') !== null || c.getContext('webgl2') !== null
      )
    })

    // Freeze virtual time at t=0: pauses Date.now(), performance.now(),
    // CSS animations/transitions, rAF, setTimeout/setInterval
    await client.send('Emulation.setVirtualTimePolicy', {
      policy: 'pauseIfNetworkFetchesPending',
      budget: 0,
      maxVirtualTimeTaskStarvationCount: 0,
    })

    for (let i = 0; i < totalFrames; i++) {
      // Register listener before sending command to avoid race condition
      const expired = new Promise<void>((resolve) => {
        client.once('Emulation.virtualTimeBudgetExpired', resolve)
      })

      await client.send('Emulation.setVirtualTimePolicy', {
        policy: 'advance',
        budget: frameInterval,
        maxVirtualTimeTaskStarvationCount: 0,
      })

      await expired

      const buf = await captureFrame(page, width, height, hasWebGL)
      const framePath = path.join(framesDir, `frame-${String(i).padStart(6, '0')}.png`)
      fs.writeFileSync(framePath, buf)
      onProgress(i + 1, totalFrames)
    }

    return { framesDir, frameCount: totalFrames }
  } catch (err) {
    fs.rmSync(framesDir, { recursive: true, force: true })
    throw err
  } finally {
    await browser.close()
  }
}

async function captureFrame(page: Page, width: number, height: number, hasWebGL: boolean): Promise<Buffer> {
  if (hasWebGL) {
    const dataUrl = await page.evaluate((w: number, h: number) => {
      const out = document.createElement('canvas')
      out.width = w
      out.height = h
      const ctx = out.getContext('2d')!
      for (const canvas of Array.from(document.querySelectorAll('canvas'))) {
        ctx.drawImage(canvas as HTMLCanvasElement, 0, 0, w, h)
      }
      return out.toDataURL('image/png')
    }, width, height)
    return Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64')
  }

  return Buffer.from(
    await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width, height } })
  )
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
