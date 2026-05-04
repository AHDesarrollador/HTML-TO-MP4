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
