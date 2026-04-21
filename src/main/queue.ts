// src/main/queue.ts
import { EventEmitter } from 'events'
import { ConversionJob, ConversionOptions } from './types'
import { randomUUID } from 'crypto'

export class ConversionQueue extends EventEmitter {
  private jobs: ConversionJob[] = []
  private running = false

  addJob(inputPath: string, outputPath: string, options: ConversionOptions): ConversionJob {
    const job: ConversionJob = {
      id: randomUUID(),
      inputPath,
      outputPath,
      options,
      status: 'pending',
      progress: 0,
    }
    this.jobs.push(job)
    this.emit('job-updated', job)
    return job
  }

  getJobs(): ConversionJob[] {
    return [...this.jobs]
  }

  clearCompleted(): void {
    this.jobs = this.jobs.filter((j) => j.status !== 'completed')
    this.emit('job-updated', null)
  }

  async start(
    runJob: (job: ConversionJob, onProgress: (p: number) => void) => Promise<void>
  ): Promise<void> {
    if (this.running) return
    this.running = true

    try {
      while (this.running) {
        const next = this.jobs.find((j) => j.status === 'pending')
        if (!next) break

        next.status = 'in_progress'
        this.emit('job-updated', { ...next })

        try {
          await runJob(next, (progress) => {
            next.progress = progress
            this.emit('job-updated', { ...next })
          })
          next.status = 'completed'
          next.progress = 100
        } catch (err) {
          next.status = 'failed'
          next.error = err instanceof Error ? err.message : String(err)
        }

        this.emit('job-updated', { ...next })
      }
    } finally {
      this.running = false
      this.emit('queue-idle')
    }
  }

  stop(): void {
    this.running = false
  }
}
