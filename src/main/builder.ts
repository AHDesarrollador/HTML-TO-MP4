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
  if (!fs.existsSync(path.join(projectPath, 'package.json'))) {
    throw new Error(`No package.json found in ${projectPath}`)
  }

  onProgress('Running npm install...')
  await runCommand('npm', ['install'], projectPath)

  onProgress('Running npm run build...')
  await runCommand('npm', ['run', 'build'], projectPath)

  const distPath = path.join(projectPath, 'dist')
  if (!fs.existsSync(distPath)) {
    throw new Error(`Build completed but no dist/ folder found in ${projectPath}`)
  }

  const port = await portfinder.getPortPromise({ port: 40000 })
  const app = express()
  app.use(express.static(distPath))
  // SPA fallback
  app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')))

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
    let stderr = ''
    proc.stderr?.on('data', (d: Buffer) => (stderr += d.toString()))
    proc.on('close', (code: number) => {
      if (code !== 0) reject(new Error(`${cmd} ${args.join(' ')} failed:\n${stderr}`))
      else resolve()
    })
  })
}
