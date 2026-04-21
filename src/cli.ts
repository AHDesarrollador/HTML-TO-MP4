import { program } from 'commander'
import * as path from 'path'
import * as fs from 'fs'
import { buildAndServe } from './main/builder'
import { encodeToMp4 } from './main/encoder'
import { DEFAULT_OPTIONS, ConversionOptions, ConversionJob } from './main/types'

async function captureWithPuppeteer(
  url: string,
  framesDir: string,
  options: ConversionOptions
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const puppeteer = require('puppeteer')
  const browser = await puppeteer.launch({
    headless: true,
    args: [`--window-size=${options.width},${options.height}`],
  })
  const page = await browser.newPage()
  await page.setViewport({ width: options.width, height: options.height })
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 })
  await new Promise((r) => setTimeout(r, 500))

  const total = options.fps * options.duration
  for (let i = 0; i < total; i++) {
    const num = String(i).padStart(6, '0')
    await page.screenshot({ path: path.join(framesDir, `frame-${num}.png`) })
  }
  await browser.close()
}

async function convertSingle(
  input: string,
  output: string,
  opts: ConversionOptions
): Promise<void> {
  console.log(`[build] ${input}`)
  const { url, stop } = await buildAndServe(input, (p) => {
    console.log(`  ${p.phase}: ${p.message}`)
  })

  const os = require('os')
  const framesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'r2mp4-'))

  try {
    console.log(`[capture] ${url} → ${framesDir}`)
    await captureWithPuppeteer(url, framesDir, opts)

    const outputFile = path.join(output, opts.outputName)
    console.log(`[encode] → ${outputFile}`)
    await encodeToMp4({ url, framesDir, outputPath: outputFile, options: opts })
    console.log(`[done] ${outputFile}`)
  } finally {
    stop()
  }
}

program
  .name('r2mp4')
  .description('Convert React projects to MP4')
  .version('1.0.0')

program
  .command('convert')
  .description('Convert a single React project to MP4')
  .requiredOption('-i, --input <path>', 'Path to React project folder')
  .requiredOption('-o, --output <path>', 'Output folder')
  .option('-w, --width <n>', 'Width in px', String(DEFAULT_OPTIONS.width))
  .option('-h, --height <n>', 'Height in px', String(DEFAULT_OPTIONS.height))
  .option('-f, --fps <n>', 'Frames per second', String(DEFAULT_OPTIONS.fps))
  .option('-d, --duration <n>', 'Duration in seconds', String(DEFAULT_OPTIONS.duration))
  .option('-n, --name <filename>', 'Output filename', DEFAULT_OPTIONS.outputName)
  .action(async (opts) => {
    const options: ConversionOptions = {
      width: Number(opts.width),
      height: Number(opts.height),
      fps: Number(opts.fps),
      duration: Number(opts.duration),
      outputName: opts.name,
    }
    await convertSingle(path.resolve(opts.input), path.resolve(opts.output), options)
  })

program
  .command('batch')
  .description('Process a JSON batch file')
  .requiredOption('-b, --batch <path>', 'Path to JSON batch file')
  .action(async (opts) => {
    const batchPath = path.resolve(opts.batch)
    const jobs: ConversionJob[] = JSON.parse(fs.readFileSync(batchPath, 'utf-8'))
    for (const job of jobs) {
      console.log(`\n=== [${job.id}] ${job.inputPath} ===`)
      try {
        await convertSingle(job.inputPath, job.outputPath, job.options)
      } catch (err) {
        console.error(`[error] ${(err as Error).message}`)
      }
    }
  })

program.parseAsync(process.argv).catch((err) => {
  console.error(err.message)
  process.exit(1)
})
