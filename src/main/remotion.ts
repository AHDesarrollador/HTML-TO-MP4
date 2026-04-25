// src/main/remotion.ts
import { spawn } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

export function isRemotionProject(projectPath: string): boolean {
  const pkgPath = path.join(projectPath, 'package.json')
  if (!fs.existsSync(pkgPath)) return false
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    return Object.keys(deps).some((k) => k === 'remotion' || k.startsWith('@remotion/'))
  } catch {
    return false
  }
}

export async function installDeps(
  projectPath: string,
  onProgress: (msg: string) => void
): Promise<void> {
  onProgress('Running npm install...')
  await runCommand('npm', ['install'], projectPath)
}

/** Returns [compositionId, entryPoint | null] */
export async function listRemotionCompositions(
  projectPath: string
): Promise<{ id: string; entryPoint: string | null }[]> {
  const pkg = readPkg(projectPath)
  const scripts: Record<string, string> = pkg.scripts || {}

  // Strategy 1: find "remotion render <compositionId>" in any script
  const compFromScript = findCompositionInScripts(scripts)
  if (compFromScript) {
    const entry = findEntryPoint(scripts, projectPath)
    return [{ id: compFromScript, entryPoint: entry }]
  }

  // Strategy 2: find entry point, then run `npx remotion compositions <entry>`
  const entry = findEntryPoint(scripts, projectPath)
  const errors: string[] = []

  for (const e of entry ? [entry, null] : [null]) {
    try {
      const ids = await queryCompositions(projectPath, e)
      if (ids.length > 0) return ids.map((id) => ({ id, entryPoint: e }))
    } catch (err) {
      errors.push(String(err))
    }
  }

  throw new Error(
    `No se pudieron listar las composiciones de Remotion.\n` +
      `Errores encontrados:\n${errors.join('\n\n')}\n\n` +
      `Asegúrate de que el proyecto tiene un remotion.config.ts o que los scripts llaman a "remotion studio <entry>" o "remotion render <compositionId>".`
  )
}

export async function renderRemotionToMp4(
  projectPath: string,
  compositionId: string,
  entryPoint: string | null,
  outputMp4: string,
  onProgress: (msg: string, pct: number) => void
): Promise<void> {
  onProgress(`Renderizando "${compositionId}"...`, 0)

  // Build args: npx remotion render [entry] <compositionId> <output> --overwrite
  const args = ['remotion', 'render']
  if (entryPoint) args.push(entryPoint)
  args.push(compositionId, outputMp4, '--overwrite')

  await new Promise<void>((resolve, reject) => {
    const proc = spawn('npx', args, { cwd: projectPath, shell: true })
    let lastOutput = ''

    const handleData = (data: Buffer) => {
      const text = data.toString()
      lastOutput += text

      // Remotion prints lines like "Rendering frames (45/150)" or "45%"
      const pctMatch = text.match(/(\d+)%/)
      if (pctMatch) {
        const pct = Math.min(99, parseInt(pctMatch[1], 10))
        onProgress(`Renderizando... ${pct}%`, pct)
        return
      }
      const frameMatch = text.match(/\((\d+)\/(\d+)\)/)
      if (frameMatch) {
        const pct = Math.round((parseInt(frameMatch[1]) / parseInt(frameMatch[2])) * 100)
        onProgress(`Frame ${frameMatch[1]}/${frameMatch[2]}`, pct)
      }
    }

    proc.stdout?.on('data', handleData)
    proc.stderr?.on('data', handleData)
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`npx remotion render falló (código ${code}):\n${lastOutput}`))
      } else {
        resolve()
      }
    })
  })
}

// ── helpers ──────────────────────────────────────────────────────────────────

function readPkg(projectPath: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(projectPath, 'package.json'), 'utf-8'))
}

/** Extract composition ID from scripts like "remotion render MyComp out.mp4"
 *  or "remotion render src/index.ts MyComp out.mp4" (entry point first) */
function findCompositionInScripts(scripts: Record<string, string>): string | null {
  for (const script of Object.values(scripts)) {
    const m = script.match(/remotion\s+render\s+(.+)/)
    if (!m) continue
    for (const token of m[1].trim().split(/\s+/)) {
      // Skip flags, file paths (contain / or .) and output files
      if (token.startsWith('-') || token.includes('/') || token.includes('.')) continue
      // A pure identifier → composition ID
      if (/^[A-Za-z_][A-Za-z0-9_-]*$/.test(token)) return token
    }
  }
  return null
}

/** Find entry .ts/.tsx file from scripts or common locations */
function findEntryPoint(scripts: Record<string, string>, projectPath: string): string | null {
  for (const script of Object.values(scripts)) {
    // e.g. "remotion studio src/index.ts" or "remotion preview src/Root.tsx"
    const m = script.match(
      /remotion\s+(?:studio|preview|compositions|render)\s+["']?([^\s"']+\.(?:ts|tsx|js|jsx))["']?/
    )
    if (m && fs.existsSync(path.join(projectPath, m[1]))) return m[1]
  }
  // Fallback: common Remotion entry points
  for (const candidate of [
    'src/index.ts',
    'src/index.tsx',
    'src/Root.tsx',
    'remotion/index.ts',
    'remotion/index.tsx',
  ]) {
    if (fs.existsSync(path.join(projectPath, candidate))) return candidate
  }
  return null
}

async function queryCompositions(
  projectPath: string,
  entryPoint: string | null
): Promise<string[]> {
  const baseArgs = entryPoint
    ? ['remotion', 'compositions', entryPoint]
    : ['remotion', 'compositions']

  // Try --json flag (Remotion ≥4.0.18)
  try {
    const out = await capture('npx', [...baseArgs, '--json'], projectPath)
    const start = out.indexOf('[')
    if (start !== -1) {
      const parsed = JSON.parse(out.slice(start))
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((c: { id: string }) => c.id)
      }
    }
  } catch {
    // --json not supported or failed; fall through
  }

  // Try plain text output
  const out = await capture('npx', baseArgs, projectPath)
  return parseCompositionIds(out)
}

function parseCompositionIds(output: string): string[] {
  const ids: string[] = []
  const SKIP = new Set(['Found', 'No', 'compositions', 'Composition', 'info', 'warn'])

  for (const line of output.split('\n')) {
    // Table row: │ MyComp │ ...  OR  - MyComp (1920x...)
    const m =
      line.match(/[│|]\s+([A-Za-z_][A-Za-z0-9_-]*)\s+[│|]/) ||
      line.match(/^\s*[-•]\s+([A-Za-z_][A-Za-z0-9_-]*)\s*[\(\s]/)
    if (m && !SKIP.has(m[1])) ids.push(m[1])
  }
  return [...new Set(ids)]
}

function runCommand(cmd: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { cwd, shell: true })
    let out = ''
    proc.stdout?.on('data', (d: Buffer) => (out += d))
    proc.stderr?.on('data', (d: Buffer) => (out += d))
    proc.on('close', (code) => {
      if (code !== 0) reject(new Error(`${cmd} ${args.join(' ')} failed:\n${out}`))
      else resolve()
    })
  })
}

function capture(cmd: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { cwd, shell: true })
    let out = ''
    proc.stdout?.on('data', (d: Buffer) => (out += d))
    proc.stderr?.on('data', (d: Buffer) => (out += d))
    proc.on('close', (code) => {
      if (code !== 0) reject(new Error(`${cmd} ${args.join(' ')} failed:\n${out}`))
      else resolve(out)
    })
  })
}
