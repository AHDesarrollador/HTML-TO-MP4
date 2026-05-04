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

  it('restores original next.config.js even when build throws', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-next-'))
    const pkg = { dependencies: { next: '^14.0.0' }, scripts: { build: 'next build' } }
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify(pkg))
    const originalConfig = "module.exports = { reactStrictMode: true }\n"
    fs.writeFileSync(path.join(tmpDir, 'next.config.js'), originalConfig)
    // No out/ created — build "succeeds" but out/ won't exist → throws
    mockSpawnSuccess()
    await expect(buildAndServe(tmpDir, vi.fn())).rejects.toThrow('out/')
    expect(fs.readFileSync(path.join(tmpDir, 'next.config.js'), 'utf-8')).toBe(originalConfig)
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
