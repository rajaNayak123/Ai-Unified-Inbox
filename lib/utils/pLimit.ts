/**
 * Minimal concurrency limiter — limits how many async tasks run in parallel.
 * Extracted from lib/kafka/worker.ts and lib/slack.ts to avoid duplication.
 *
 * @param concurrency Maximum number of tasks running simultaneously
 * @returns A wrapped call function that respects the concurrency limit
 */
export function pLimit(concurrency: number) {
  const queue: Array<() => void> = []
  let activeCount = 0

  const next = () => {
    activeCount--
    if (queue.length > 0) {
      queue.shift()!()
    }
  }

  return <T>(fn: () => Promise<T>): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      const run = async () => {
        activeCount++
        try {
          resolve(await fn())
        } catch (err) {
          reject(err)
        } finally {
          next()
        }
      }

      if (activeCount < concurrency) {
        run()
      } else {
        queue.push(run)
      }
    })
  }
}
