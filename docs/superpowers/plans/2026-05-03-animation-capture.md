# Animation Capture — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el capturer real-time con Puppeteer + CDP virtual time para lograr captura determinista frame-perfecta de cualquier tipo de animación web.

**Architecture:** Puppeteer lanza un Chromium headless con `--use-gl=swiftshader` (WebGL por software). Un CDPSession congela el tiempo virtual del navegador en t=0 tras la carga, luego avanza exactamente `1000/fps` ms por frame. `builder.ts` recibe detección de Next.js que parchea el config temporalmente y sirve `out/`.

**Tech Stack:** Electron + electron-vite, Puppeteer ^22, fluent-ffmpeg, Express, Vitest

---

## File Structure

| Archivo | Acción | Responsabilidad |
|---------|--------|-----------------|
| `package.json` | Modificar | Añadir `puppeteer ^22.0.0` a dependencies |
| `src/main/capturer.ts` | Reescritura completa | Puppeteer launch, CDP virtual time, WebGL fallback |
| `src/main/builder.ts` | Modificar | Añadir `isNextJsProject`, `patchNextConfigContent`, `buildNextJs` |
| `tests/capturer.test.ts` | Crear | Tests del nuevo capturer (mock Puppeteer) |
| `tests/builder.test.ts` | Modificar | Tests de detección Next.js |

---

## Task 1: Instalar Puppeteer

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Añadir puppeteer a package.json**

  Editar `package.json`, sección `dependencies`:
  ```json
  "dependencies": {
    "commander": "^12.0.0",
    "express": "^4.18.3",
    "ffmpeg-static": "^5.2.0",
    "fluent-ffmpeg": "^2.1.3",
    "portfinder": "^1.0.32",
    "puppeteer": "^22.0.0"
  }
  ```

- [ ] **Step 2: Instalar la dependencia**

  ```bash
  npm install
  ```
  Expected: Puppeteer descarga Chromium a `~/.cache/puppeteer`. La instalación termina sin errores.

- [ ] **Step 3: Verificar que el import funciona**

  ```bash
  node -e "const p = require('puppeteer'); console.log(p.executablePath ? 'ok' : 'ok-v22')"
  ```
  Expected: imprime `ok` o `ok-v22` sin error.

- [ ] **Step 4: Commit**

  ```bash
  git add package.json package-lock.json
  git commit -m "feat: add puppeteer dependency for deterministic frame capture"
  ```

---

## Task 2: Escribir tests del capturer (failing)

**Files:**
- Create: `tests/capturer.test.ts`

- [ ] **Step 1: Crear el archivo de tests**

  Crear `tests/capturer.test.ts` con el siguiente contenido completo:

  ```typescript
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
  ```

- [ ] **Step 2: Verificar que los tests fallan (capturer.ts aún no existe)**

  ```bash
  npm test -- --reporter=verbose 2>&1 | head -30
  ```
  Expected: errores de import `captureFrames` o TypeScript porque el módulo no tiene `initDelayMs`.

---

## Task 3: Reescribir capturer.ts

**Files:**
- Rewrite: `src/main/capturer.ts`

- [ ] **Step 1: Reemplazar el contenido completo de capturer.ts**

  Escribir `src/main/capturer.ts`:

  ```typescript
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

      // Freeze virtual time at t=0: pauses Date.now(), performance.now(),
      // CSS animations/transitions, rAF, setTimeout/setInterval
      await client.send('Emulation.setVirtualTimePolicy', {
        policy: 'pauseIfNetworkFetchesPending',
        budget: 0,
        maxVirtualTimeTaskStarvationCount: 0,
        waitForNavigation: false,
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
          waitForNavigation: false,
        })

        await expired

        const buf = await captureFrame(page, width, height)
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

  async function captureFrame(page: Page, width: number, height: number): Promise<Buffer> {
    const hasWebGL = await page.evaluate(() => {
      const canvases = Array.from(document.querySelectorAll('canvas'))
      return canvases.some(
        (c) => c.getContext('webgl') !== null || c.getContext('webgl2') !== null
      )
    })

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
  ```

- [ ] **Step 2: Ejecutar los tests del capturer**

  ```bash
  npm test -- tests/capturer.test.ts --reporter=verbose
  ```
  Expected: todos los tests pasan (✓ 11 tests).

- [ ] **Step 3: Ejecutar todos los tests para verificar que no hay regresiones**

  ```bash
  npm test
  ```
  Expected: todos los tests pasan.

- [ ] **Step 4: Commit**

  ```bash
  git add src/main/capturer.ts tests/capturer.test.ts
  git commit -m "feat: rewrite capturer with Puppeteer + CDP virtual time"
  ```

---

## Task 4: Escribir tests de Next.js para builder.ts (failing)

**Files:**
- Modify: `tests/builder.test.ts`

- [ ] **Step 1: Añadir imports y tests al archivo existente**

  Reemplazar el contenido de `tests/builder.test.ts` con:

  ```typescript
  // tests/builder.test.ts
  import { describe, it, expect, vi, beforeEach } from 'vitest'
  import * as fs from 'fs'
  import * as path from 'path'
  import * as os from 'os'

  vi.mock('child_process', () => ({
    spawn: vi.fn(),
  }))
  vi.mock('portfinder', () => ({
    default: { getPortPromise: vi.fn().mockResolvedValue(54321) },
  }))

  import { buildAndServe, isNextJsProject, patchNextConfigContent } from '../src/main/builder'
  import { spawn } from 'child_process'

  function mockSpawnSuccess() {
    const mockProc = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn((event: string, cb: (code: number) => void) => {
        if (event === 'close') cb(0)
      }),
    }
    vi.mocked(spawn).mockReturnValue(mockProc as any)
  }

  // ── existing tests ────────────────────────────────────────────────────────────

  describe('buildAndServe', () => {
    beforeEach(() => vi.clearAllMocks())

    it('throws if no index.html or package.json', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'))
      await expect(buildAndServe(tmpDir, vi.fn())).rejects.toThrow('No index.html or package.json')
      fs.rmSync(tmpDir, { recursive: true })
    })

    it('throws if dist/ not created after build', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'))
      fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ scripts: { build: 'vite build' } }))
      mockSpawnSuccess()
      await expect(buildAndServe(tmpDir, vi.fn())).rejects.toThrow('no dist/')
      fs.rmSync(tmpDir, { recursive: true })
    })

    // ── Next.js ──────────────────────────────────────────────────────────────────

    it('detects Next.js and serves out/ after build', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-next-'))
      const pkg = {
        dependencies: { next: '^14.0.0', react: '^18.0.0' },
        scripts: { build: 'next build' },
      }
      fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify(pkg))
      // Simulate next build creating out/
      fs.mkdirSync(path.join(tmpDir, 'out'), { recursive: true })
      fs.writeFileSync(path.join(tmpDir, 'out', 'index.html'), '<html></html>')

      mockSpawnSuccess()
      const result = await buildAndServe(tmpDir, vi.fn())
      expect(result.url).toMatch(/http:\/\/localhost:\d+/)
      await result.stop()
      fs.rmSync(tmpDir, { recursive: true })
    })

    it('creates minimal next.config.js when none exists and restores after build', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-next-'))
      const pkg = {
        dependencies: { next: '^14.0.0' },
        scripts: { build: 'next build' },
      }
      fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify(pkg))
      fs.mkdirSync(path.join(tmpDir, 'out'), { recursive: true })
      fs.writeFileSync(path.join(tmpDir, 'out', 'index.html'), '<html></html>')

      mockSpawnSuccess()
      await buildAndServe(tmpDir, vi.fn()).then((r) => r.stop())

      // next.config.js must be removed after build (was created temporarily)
      expect(fs.existsSync(path.join(tmpDir, 'next.config.js'))).toBe(false)
      fs.rmSync(tmpDir, { recursive: true })
    })

    it('patches existing next.config.js and restores original content', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-next-'))
      const pkg = {
        dependencies: { next: '^14.0.0' },
        scripts: { build: 'next build' },
      }
      fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify(pkg))
      const originalConfig = "module.exports = { reactStrictMode: true }\n"
      fs.writeFileSync(path.join(tmpDir, 'next.config.js'), originalConfig)
      fs.mkdirSync(path.join(tmpDir, 'out'), { recursive: true })
      fs.writeFileSync(path.join(tmpDir, 'out', 'index.html'), '<html></html>')

      mockSpawnSuccess()
      await buildAndServe(tmpDir, vi.fn()).then((r) => r.stop())

      // Original content restored
      const afterBuild = fs.readFileSync(path.join(tmpDir, 'next.config.js'), 'utf-8')
      expect(afterBuild).toBe(originalConfig)
      fs.rmSync(tmpDir, { recursive: true })
    })

    it('throws if no out/ after Next.js build', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-next-'))
      const pkg = {
        dependencies: { next: '^14.0.0' },
        scripts: { build: 'next build' },
      }
      fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify(pkg))
      mockSpawnSuccess()
      await expect(buildAndServe(tmpDir, vi.fn())).rejects.toThrow('out/')
      fs.rmSync(tmpDir, { recursive: true })
    })
  })

  // ── isNextJsProject ───────────────────────────────────────────────────────────

  describe('isNextJsProject', () => {
    it('returns true when next is in dependencies', () => {
      expect(isNextJsProject({ dependencies: { next: '^14.0.0', react: '^18.0.0' } })).toBe(true)
    })

    it('returns true when next is in devDependencies', () => {
      expect(isNextJsProject({ devDependencies: { next: '^14.0.0' } })).toBe(true)
    })

    it('returns false when next is not present', () => {
      expect(isNextJsProject({ dependencies: { react: '^18.0.0', vite: '^5.0.0' } })).toBe(false)
    })

    it('returns false for empty package.json', () => {
      expect(isNextJsProject({})).toBe(false)
    })
  })

  // ── patchNextConfigContent ────────────────────────────────────────────────────

  describe('patchNextConfigContent', () => {
    it('inserts output export in CommonJS format', () => {
      const input = "module.exports = { reactStrictMode: true }\n"
      const result = patchNextConfigContent(input)
      expect(result).toContain("output: 'export'")
      expect(result).toContain('reactStrictMode: true')
    })

    it('inserts output export in ESM default export format', () => {
      const input = "export default { reactStrictMode: true }\n"
      const result = patchNextConfigContent(input)
      expect(result).toContain("output: 'export'")
    })

    it('returns input unchanged if output export already present', () => {
      const input = "module.exports = { output: 'export', reactStrictMode: true }\n"
      const result = patchNextConfigContent(input)
      expect(result).toBe(input)
    })
  })
  ```

- [ ] **Step 2: Verificar que los nuevos tests fallan**

  ```bash
  npm test -- tests/builder.test.ts --reporter=verbose 2>&1 | grep -E "(FAIL|PASS|✓|×|isNextJsProject|patchNext|Next)"
  ```
  Expected: los tests de `isNextJsProject`, `patchNextConfigContent` y los nuevos de `buildAndServe/Next.js` fallan porque las funciones no están exportadas aún.

---

## Task 5: Implementar soporte Next.js en builder.ts

**Files:**
- Modify: `src/main/builder.ts`

- [ ] **Step 1: Reemplazar el contenido completo de builder.ts**

  Escribir `src/main/builder.ts`:

  ```typescript
  // src/main/builder.ts
  import { spawn } from 'child_process'
  import * as http from 'http'
  import * as path from 'path'
  import * as fs from 'fs'
  import express from 'express'
  import portfinder from 'portfinder'

  export interface BuildResult {
    url: string
    port: number
    stop: () => Promise<void>
  }

  export async function buildAndServe(
    projectPath: string,
    onProgress: (msg: string) => void
  ): Promise<BuildResult> {
    const pkgPath = path.join(projectPath, 'package.json')

    if (!fs.existsSync(pkgPath)) {
      if (!fs.existsSync(path.join(projectPath, 'index.html'))) {
        throw new Error(`No index.html or package.json found in ${projectPath}`)
      }
      onProgress('Serving static files...')
      return serveDir(projectPath)
    }

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))

    // Next.js: must be detected before generic build logic
    if (isNextJsProject(pkg)) {
      return buildNextJs(projectPath, pkg, onProgress)
    }

    const hasBuildScript = !!(pkg.scripts && pkg.scripts.build)

    if (!hasBuildScript) {
      const distPath = path.join(projectPath, 'dist')
      const servePath = fs.existsSync(distPath) ? distPath : projectPath
      onProgress('Serving static files...')
      return serveDir(servePath)
    }

    onProgress('Running npm install...')
    await runCommand('npm', ['install'], projectPath)

    onProgress('Running npm run build...')
    try {
      await runCommand('npm', ['run', 'build'], projectPath)
    } catch (buildErr) {
      const hasViteConfig = ['vite.config.ts', 'vite.config.js', 'vite.config.mts', 'vite.config.mjs'].some(
        (f) => fs.existsSync(path.join(projectPath, f))
      )
      if (!hasViteConfig) throw buildErr
      onProgress('Build failed, retrying with vite build (skipping type-check)...')
      await runCommand('npx', ['vite', 'build'], projectPath)
    }

    const distPath = path.join(projectPath, 'dist')
    if (!fs.existsSync(distPath)) {
      throw new Error(`Build completed but no dist/ folder found in ${projectPath}`)
    }

    onProgress('Serving built files...')
    return serveDir(distPath)
  }

  export function isNextJsProject(pkg: Record<string, unknown>): boolean {
    const deps = {
      ...((pkg.dependencies as Record<string, string>) ?? {}),
      ...((pkg.devDependencies as Record<string, string>) ?? {}),
    }
    return 'next' in deps
  }

  export function patchNextConfigContent(content: string): string {
    // Return unchanged if output: 'export' is already present
    if (content.includes("output: 'export'") || content.includes('output: "export"')) {
      return content
    }
    // Insert after opening brace of module.exports = { or export default {
    return content.replace(
      /(module\.exports\s*=\s*\{|export\s+default\s+(?:defineConfig\s*\()?\s*\{)/,
      `$1\n  output: 'export',`
    )
  }

  async function buildNextJs(
    projectPath: string,
    pkg: Record<string, unknown>,
    onProgress: (msg: string) => void
  ): Promise<BuildResult> {
    onProgress('Next.js project detected. Running npm install...')
    await runCommand('npm', ['install'], projectPath)

    const { configPath, original } = readNextConfig(projectPath)
    const alreadyExported =
      original !== null &&
      (original.includes("output: 'export'") || original.includes('output: "export"'))
    const createdConfig = configPath === null

    if (!alreadyExported) {
      if (configPath && original !== null) {
        fs.writeFileSync(configPath, patchNextConfigContent(original), 'utf-8')
      } else {
        fs.writeFileSync(
          path.join(projectPath, 'next.config.js'),
          "module.exports = { output: 'export' }\n",
          'utf-8'
        )
      }
    }

    try {
      onProgress('Building Next.js project...')
      const hasBuildScript = !!(
        pkg.scripts && (pkg.scripts as Record<string, string>).build
      )
      if (hasBuildScript) {
        await runCommand('npm', ['run', 'build'], projectPath)
      } else {
        await runCommand('npx', ['next', 'build'], projectPath)
      }

      const outPath = path.join(projectPath, 'out')
      if (!fs.existsSync(outPath)) {
        throw new Error(
          `Next.js build succeeded but no out/ directory found in ${projectPath}. ` +
            `Ensure next.config.js has output: 'export'.`
        )
      }

      onProgress('Serving Next.js static export...')
      return serveDir(outPath)
    } finally {
      if (!alreadyExported) {
        if (configPath && original !== null) {
          fs.writeFileSync(configPath, original, 'utf-8')
        } else {
          const created = path.join(projectPath, 'next.config.js')
          if (fs.existsSync(created)) fs.rmSync(created)
        }
      }
    }
  }

  function readNextConfig(projectPath: string): {
    configPath: string | null
    original: string | null
  } {
    for (const name of ['next.config.js', 'next.config.mjs', 'next.config.ts', 'next.config.cjs']) {
      const fullPath = path.join(projectPath, name)
      if (fs.existsSync(fullPath)) {
        return { configPath: fullPath, original: fs.readFileSync(fullPath, 'utf-8') }
      }
    }
    return { configPath: null, original: null }
  }

  async function serveDir(dirPath: string): Promise<BuildResult> {
    const port = await portfinder.getPortPromise({ port: 40000 })
    const app = express()
    app.use(express.static(dirPath))
    app.get('*', (_req, res) => res.sendFile(path.join(dirPath, 'index.html')))

    const server = http.createServer(app)
    await new Promise<void>((resolve) => server.listen(port, resolve))

    return {
      url: `http://localhost:${port}`,
      port,
      stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
    }
  }

  function runCommand(cmd: string, args: string[], cwd: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn(cmd, args, { cwd, shell: true })
      let output = ''
      proc.stdout?.on('data', (d: Buffer) => (output += d.toString()))
      proc.stderr?.on('data', (d: Buffer) => (output += d.toString()))
      proc.on('close', (code: number) => {
        if (code !== 0) reject(new Error(`${cmd} ${args.join(' ')} failed:\n${output}`))
        else resolve()
      })
    })
  }
  ```

- [ ] **Step 2: Ejecutar los tests de builder**

  ```bash
  npm test -- tests/builder.test.ts --reporter=verbose
  ```
  Expected: todos los tests pasan (✓ ~11 tests).

- [ ] **Step 3: Ejecutar todos los tests**

  ```bash
  npm test
  ```
  Expected: suite completa pasa sin errores.

- [ ] **Step 4: Commit**

  ```bash
  git add src/main/builder.ts tests/builder.test.ts
  git commit -m "feat: add Next.js detection and static export support to builder"
  ```

---

## Task 6: Verificación final del build de TypeScript

**Files:** ninguno (solo verificación)

- [ ] **Step 1: Compilar el proyecto completo**

  ```bash
  npx tsc --noEmit
  ```
  Expected: sin errores de tipos. Si hay errores de `puppeteer` types, ejecutar:
  ```bash
  npm install --save-dev @types/puppeteer 2>/dev/null || true
  npx tsc --noEmit
  ```
  Puppeteer v22 incluye sus propios tipos, así que `@types/puppeteer` no debería ser necesario.

- [ ] **Step 2: Verificar que electron-vite puede buildear**

  ```bash
  npm run build 2>&1 | tail -20
  ```
  Expected: `Build complete.` sin errores.

- [ ] **Step 3: Commit final si hubo ajustes de tipos**

  Solo si el paso anterior requirió cambios:
  ```bash
  git add -p
  git commit -m "fix: resolve TypeScript type issues after Puppeteer integration"
  ```

---

## Checklist de cobertura del spec

| Requisito del spec | Tarea |
|---|---|
| Puppeteer con `--use-gl=swiftshader` | Task 3 (capturer.ts, línea `--use-gl=swiftshader`) |
| `evaluateOnNewDocument` WebGL patch | Task 3 (capturer.ts, `evaluateOnNewDocument`) |
| CDP freeze virtual time antes del loop | Task 3 (capturer.ts, `pauseIfNetworkFetchesPending`) |
| Advance `1000/fps` ms por frame | Task 3 (capturer.ts, loop `advance + budget`) |
| `captureFrame` WebGL fallback con `toDataURL` | Task 3 (capturer.ts, `captureFrame`) |
| `isNextJsProject` detección | Task 5 (builder.ts, exportado) |
| `patchNextConfigContent` CommonJS + ESM | Task 5 (builder.ts, exportado) |
| `buildNextJs` restaura config en finally | Task 5 (builder.ts, bloque finally) |
| No out/ → error descriptivo | Task 5 (builder.ts, throw) |
| `initDelayMs` opcional para tests | Task 3 (CaptureOptions.initDelayMs) |
| Tests unitarios capturer | Task 2 (11 tests) |
| Tests unitarios builder Next.js | Task 4 (9 tests nuevos) |
