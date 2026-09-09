import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TextAnimator } from '@/components/Console/TextAnimator.ts'
import { fakeClock } from '@test/helpers/fakeClock.ts'

/*
 * Tests for the typewriter animation.
 *
 * The model: `startAnimation(cursor)` claims every line from `cursor.line`
 * onward (`cursor.offset` characters into the first of them) and reveals them
 * at ANIMATION_SPEED = 20 characters per second — so one character per 50ms.
 * Everything *before* the cursor is already on screen and is never re-animated;
 * `submit()` points the cursor just past the shell's `> raw` echo line for
 * exactly that reason.
 *
 * `revealed` and `animationLength` are private, so every assertion goes through
 * `animatedLines`, which is what the view renders. Reveal counts are asserted by
 * moving the clock directly (`reveal()` below) rather than by pumping frames:
 * the frame loop is a separate concern, tested under "the frame loop".
 *
 * Note `animatedLines` returns whole lines plus a partial last line — the
 * animation is character-wise, not line-wise, so a mid-line frame renders a
 * truncated final line.
 */

const clock = { current: fakeClock() }

beforeEach(() => {
  clock.current = fakeClock()
})

afterEach(() => {
  clock.current.restore()
})

const makeAnimator = (lines: string[]) => new TextAnimator(() => lines)

/** Moves the clock to the instant exactly `chars` characters have been revealed. */
const reveal = (animator: TextAnimator, chars: number) => {
  animator.now = animator.animationStart! + chars * 50
}

describe('animatedLines', () => {
  describe('reveal math', () => {
    // 'ab' and 'cd' are animated; '> cmd' is the already-visible echo line.
    const lines = () => ['> cmd', 'ab', 'cd']
    const start = (ls: string[]) => {
      const animator = makeAnimator(ls)
      animator.startAnimation({ line: 1, offset: 0 })
      return animator
    }

    it('reveals nothing of the animated region on the first frame', () => {
      const animator = start(lines())
      reveal(animator, 0)
      // The claimed line is present but empty — the view renders a blank line
      // that fills in character by character, rather than the line popping in.
      expect(animator.animatedLines).toEqual(['> cmd', ''])
    })

    it('reveals a partial first line', () => {
      const animator = start(lines())
      reveal(animator, 1)
      expect(animator.animatedLines).toEqual(['> cmd', 'a'])
    })

    it('reveals exactly the first line on its boundary', () => {
      const animator = start(lines())
      reveal(animator, 2)
      expect(animator.animatedLines).toEqual(['> cmd', 'ab'])
    })

    it('crosses into the next line', () => {
      const animator = start(lines())
      reveal(animator, 3)
      expect(animator.animatedLines).toEqual(['> cmd', 'ab', 'c'])
    })

    it('reveals everything once the last character lands', () => {
      const animator = start(lines())
      reveal(animator, 4)
      expect(animator.animatedLines).toEqual(['> cmd', 'ab', 'cd'])
    })

    it('stays at the full text when the clock overshoots', () => {
      const animator = start(lines())
      reveal(animator, 99)
      expect(animator.animatedLines).toEqual(['> cmd', 'ab', 'cd'])
    })

    it('carries a blank line through without consuming a character', () => {
      const animator = start(['> c', '', 'xy'])
      reveal(animator, 1)
      expect(animator.animatedLines).toEqual(['> c', '', 'x'])
    })

    it('reveals a character per 50ms, rounding down mid-character', () => {
      const animator = start(lines())
      animator.now = animator.animationStart! + 49
      expect(animator.animatedLines).toEqual(['> cmd', ''])
      animator.now = animator.animationStart! + 50
      expect(animator.animatedLines).toEqual(['> cmd', 'a'])
    })
  })

  describe('pass-through guards', () => {
    it('returns every line when no animation is running', () => {
      const animator = makeAnimator(['a', 'b'])
      expect(animator.animatedLines).toEqual(['a', 'b'])
    })

    it('returns every line when the cursor points past the end', () => {
      // A stale cursor — the scrollback was replaced under a running animation.
      const animator = makeAnimator(['a'])
      animator.startAnimation({ line: 5, offset: 0 })
      expect(animator.animatedLines).toEqual(['a'])
    })

    it('returns every line when there are none to animate', () => {
      const animator = makeAnimator([])
      animator.startAnimation({ line: 0, offset: 0 })
      expect(animator.animatedLines).toEqual([])
    })

    it('returns every line when the cursor sits exactly one past the end', () => {
      // Nothing was written — the loop body never runs. This is the shape
      // `submit()` produces for a command with no output.
      const animator = makeAnimator(['> cmd'])
      animator.startAnimation({ line: 1, offset: 0 })
      reveal(animator, 0)
      expect(animator.animatedLines).toEqual(['> cmd'])
    })
  })

  describe('a cursor offset mid-line', () => {
    /*
     * `submit()` only ever passes `offset: 0`, so nothing below is reachable
     * from the app today. These pin the current behaviour because it looks like
     * a defect rather than intent: the offset is honoured when *counting* how
     * much is left to reveal (`sub` is the line sliced from `offset`), but the
     * rendered truncation always slices the line from index 0. The two halves
     * disagree, so the characters before the offset — which are by definition
     * already on screen — get re-hidden and then retyped.
     */

    it('re-hides the characters before the offset', () => {
      const animator = makeAnimator(['> c', 'abc'])
      animator.startAnimation({ line: 1, offset: 1 })
      reveal(animator, 0)
      // 'a' was already visible; the animation blanks it and starts over.
      expect(animator.animatedLines).toEqual(['> c', ''])
    })

    it('retypes from the start of the line, not from the offset', () => {
      const animator = makeAnimator(['> c', 'abc'])
      animator.startAnimation({ line: 1, offset: 1 })
      reveal(animator, 1)
      // One character revealed renders 'a' — the character the offset said was
      // already shown — rather than resuming at 'b'.
      expect(animator.animatedLines).toEqual(['> c', 'a'])
    })

    it('skips a line shorter than the offset entirely', () => {
      const animator = makeAnimator(['> c', '', 'abc'])
      animator.startAnimation({ line: 1, offset: 1 })
      reveal(animator, 1)
      expect(animator.animatedLines).toEqual(['> c', '', 'a'])
    })
  })
})

describe('the frame loop', () => {
  it('does not run before an animation starts', () => {
    makeAnimator(['a'])
    expect(clock.current.pendingFrames).toBe(0)
  })

  it('runs while an animation is in flight and stops when it catches up', () => {
    const animator = makeAnimator(['> cmd', 'ab'])
    animator.startAnimation({ line: 1, offset: 0 })
    expect(clock.current.pendingFrames).toBe(1)

    clock.current.runToEnd()

    expect(clock.current.pendingFrames).toBe(0)
    expect(animator.animationCursor).toBeUndefined()
    expect(animator.animationStart).toBeUndefined()
    expect(animator.animatedLines).toEqual(['> cmd', 'ab'])
  })

  it('keeps exactly one frame in flight', () => {
    const animator = makeAnimator(['> cmd', 'a long line of output'])
    animator.startAnimation({ line: 1, offset: 0 })
    clock.current.advance(100)
    expect(clock.current.pendingFrames).toBe(1)
  })

  it('terminates immediately when there is nothing to reveal', () => {
    const animator = makeAnimator(['> cmd'])
    animator.startAnimation({ line: 1, offset: 0 })
    clock.current.flush()
    expect(clock.current.pendingFrames).toBe(0)
  })

  describe('init / dispose', () => {
    it('cancels the pending frame on dispose', () => {
      const animator = makeAnimator(['> cmd', 'ab'])
      animator.startAnimation({ line: 1, offset: 0 })

      animator.dispose()

      expect(clock.current.pendingFrames).toBe(0)
      // The animation is only paused, not finished — the state survives.
      expect(animator.animationCursor).toBeDefined()
    })

    it('is safe to dispose twice', () => {
      const animator = makeAnimator(['> cmd', 'ab'])
      animator.startAnimation({ line: 1, offset: 0 })
      animator.dispose()
      expect(() => animator.dispose()).not.toThrow()
    })

    it('picks a mid-flight animation back up on init', () => {
      // The view unmounted and remounted — StrictMode does this on every mount.
      const animator = makeAnimator(['> cmd', 'ab'])
      animator.startAnimation({ line: 1, offset: 0 })
      animator.dispose()

      animator.init()

      expect(clock.current.pendingFrames).toBe(1)
      clock.current.runToEnd()
      expect(animator.animatedLines).toEqual(['> cmd', 'ab'])
    })

    it('does not start a loop on init when no animation is running', () => {
      const animator = makeAnimator(['a'])
      animator.init()
      expect(clock.current.pendingFrames).toBe(0)
    })
  })
})
