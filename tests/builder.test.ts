// tests/builder.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

// Mock Node modules BEFORE importing builder
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}))
vi.mock('portfinder', () => ({
  default: { getPortPromise: vi.fn().mockResolvedValue(54321) },
}))

import { buildAndServe } from '../src/main/builder'
import { spawn } from 'child_process'

function mockSpawnSuccess() {
  const mockProc = {
    stderr: { on: vi.fn() },
    on: vi.fn((event, cb) => { if (event === 'close') cb(0) }),
  }
  vi.mocked(spawn).mockReturnValue(mockProc as any)
}

describe('buildAndServe', () => {
  beforeEach(() => vi.clearAllMocks())

  it('throws if package.json is missing', async () => {
    const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'test-'))
    await expect(buildAndServe(tmpDir, vi.fn())).rejects.toThrow('No package.json')
    fs.rmSync(tmpDir, { recursive: true })
  })

  it('throws if dist/ not created after build', async () => {
    const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'test-'))
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{}')
    mockSpawnSuccess()
    await expect(buildAndServe(tmpDir, vi.fn())).rejects.toThrow('no dist/')
    fs.rmSync(tmpDir, { recursive: true })
  })
})
