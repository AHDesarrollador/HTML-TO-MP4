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

  // No package.json — serve static files directly
  if (!fs.existsSync(pkgPath)) {
    if (!fs.existsSync(path.join(projectPath, 'index.html'))) {
      throw new Error(`No index.html or package.json found in ${projectPath}`)
    }
    onProgress('Serving static files...')
    return serveDir(projectPath)
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
  const hasBuildScript = !!(pkg.scripts && pkg.scripts.build)

  // Has package.json but no build script — serve existing dist/ or project root
  if (!hasBuildScript) {
    const distPath = path.join(projectPath, 'dist')
    const servePath = fs.existsSync(distPath) ? distPath : projectPath
    onProgress('Serving static files...')
    return serveDir(servePath)
  }

  // Has build script — install, build, then serve dist/
  onProgress('Running npm install...')
  await runCommand('npm', ['install'], projectPath)

  onProgress('Running npm run build...')
  try {
    await runCommand('npm', ['run', 'build'], projectPath)
  } catch (buildErr) {
    // npm run build failed — if vite is available, retry with vite build directly
    // (skips tsc type errors, which are irrelevant for rendering)
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
