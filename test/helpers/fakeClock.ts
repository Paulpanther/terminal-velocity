import { Settings } from 'luxon'
import { vi } from 'vitest'

/**
 * Deterministic stand-ins for the two impurities the animation depends on:
 * luxon's clock and `requestAnimationFrame`.
 *
 * Why not `vi.useFakeTimers()`: sinon only wraps a `requestAnimationFrame` that
 * already exists on `globalThis`, and the test environment is `node`, which has
 * none. A hand-rolled queue is also easier to assert against — `pendingFrames`
 * makes "the animation loop actually stopped" a first-class check.
 *
 * `Settings.now` is luxon's supported hook and is narrower than faking timers:
 * it leaves `setTimeout` alone, which matters because `persist()` writes on an
 * `autorun(…, { delay: 250 })`.
 */
export function fakeClock(start = 1_700_000_000_000) {
  let now = start
  let nextId = 1
  const frames = new Map<number, FrameRequestCallback>()

  Settings.now = () => now
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = nextId++
    frames.set(id, cb)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => void frames.delete(id))

  return {
    get now() {
      return now
    },
    get pendingFrames() {
      return frames.size
    },

    /** Runs every *currently* pending callback once. */
    flush() {
      // Snapshot and clear before running: `tick` re-schedules synchronously,
      // so iterating the live map would spin forever.
      const pending = [...frames.values()]
      frames.clear()
      for (const cb of pending) cb(now)
    },

    /** Advances the clock in display-refresh-sized steps, firing a frame per step. */
    advance(ms: number, step = 16) {
      for (let done = 0; done < ms; done += step) {
        now += Math.min(step, ms - done)
        this.flush()
      }
    },

    /** Moves the clock without firing a frame — for asserting reveal math directly. */
    set(ms: number) {
      now = ms
    },

    /** Pumps frames until the animation stops, failing loudly rather than hanging. */
    runToEnd(step = 16, maxFrames = 10_000) {
      for (let i = 0; i < maxFrames; i++) {
        if (frames.size === 0) return
        now += step
        this.flush()
      }
      throw new Error(`animation still running after ${maxFrames} frames`)
    },

    restore() {
      Settings.now = () => Date.now()
      vi.unstubAllGlobals()
      frames.clear()
    },
  }
}
