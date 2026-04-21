// tests/queue.test.ts
import { describe, it, expect, vi } from 'vitest'
import { ConversionQueue } from '../src/main/queue'
import { ConversionJob } from '../src/main/types'

const baseOptions = { width: 1920, height: 1080, fps: 30, duration: 5, outputName: 'out.mp4' }

describe('ConversionQueue', () => {
  it('addJob creates a pending job with unique id', () => {
    const q = new ConversionQueue()
    const j1 = q.addJob('/a', '/out', baseOptions)
    const j2 = q.addJob('/b', '/out', baseOptions)
    expect(j1.status).toBe('pending')
    expect(j1.id).not.toBe(j2.id)
    expect(q.getJobs()).toHaveLength(2)
  })

  it('start processes jobs sequentially and emits job-updated', async () => {
    const q = new ConversionQueue()
    const updates: string[] = []
    q.on('job-updated', (job: ConversionJob | null) => {
      if (job) updates.push(`${job.id}:${job.status}`)
    })

    const j1 = q.addJob('/a', '/out', baseOptions)
    const j2 = q.addJob('/b', '/out', baseOptions)

    const runJob = vi.fn().mockResolvedValue(undefined)
    await q.start(runJob)

    expect(runJob).toHaveBeenCalledTimes(2)
    expect(q.getJobs().every((j) => j.status === 'completed')).toBe(true)
    expect(updates).toContain(`${j1.id}:in_progress`)
    expect(updates).toContain(`${j1.id}:completed`)
    expect(updates).toContain(`${j2.id}:completed`)
  })

  it('marks job as failed on error and continues queue', async () => {
    const q = new ConversionQueue()
    q.addJob('/a', '/out', baseOptions)
    q.addJob('/b', '/out', baseOptions)

    let callCount = 0
    const runJob = vi.fn().mockImplementation(async () => {
      callCount++
      if (callCount === 1) throw new Error('build failed')
    })

    await q.start(runJob)
    const jobs = q.getJobs()
    expect(jobs[0].status).toBe('failed')
    expect(jobs[0].error).toBe('build failed')
    expect(jobs[1].status).toBe('completed')
  })

  it('clearCompleted removes completed jobs only', async () => {
    const q = new ConversionQueue()
    q.addJob('/a', '/out', baseOptions)
    q.addJob('/b', '/out', baseOptions)
    await q.start(vi.fn().mockResolvedValue(undefined))
    q.clearCompleted()
    expect(q.getJobs()).toHaveLength(0)
  })
})
