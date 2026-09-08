import { action, computed, observable } from 'mobx'
import type { Cursor } from '@/utils/cursor.ts'
import { DateTime } from 'luxon'
import { last } from 'lodash'

/** unit = letters per second */
const ANIMATION_SPEED = 20

export class TextAnimator {
  @observable accessor animationCursor: Cursor | undefined = undefined
  @observable accessor animationStart: number | undefined = undefined
  /** Observable clock. Only ticks while an animation is running. */
  @observable accessor now: number = 0

  private frame: number | undefined

  private lineGetter: () => string[]

  constructor(lineGetter: () => string[]) {
    this.lineGetter = lineGetter
  }

  public init() {
    // Pick an animation back up if the view unmounted mid-flight.
    this.schedule()
  }

  public dispose() {
    if (this.frame !== undefined) {
      cancelAnimationFrame(this.frame)
      this.frame = undefined
    }
  }

  @action
  public startAnimation(cursor: Cursor) {
    this.animationCursor = cursor
    this.animationStart = DateTime.now().toMillis()
    this.now = this.animationStart
    this.schedule()
  }

  private tick = () => {
    this.frame = undefined
    this.advance()
    this.schedule()
  }

  /** Runs the clock while — and only while — an animation is in flight. */
  private schedule() {
    if (this.animationCursor && this.frame === undefined) {
      this.frame = requestAnimationFrame(this.tick)
    }
  }

  /** Advances the observable clock, ending the animation once it caught up. */
  @action
  private advance() {
    this.now = DateTime.now().toMillis()
    if (this.revealed >= this.animationLength) {
      this.animationCursor = undefined
      this.animationStart = undefined
    }
  }

  /** Characters revealed since the animation started. */
  @computed
  private get revealed() {
    if (!this.animationStart) {
      return 0
    }
    return Math.floor(
      ((this.now - this.animationStart) / 1000) * ANIMATION_SPEED,
    )
  }

  /** Total characters the current animation has to reveal. */
  @computed
  private get animationLength() {
    const cursor = this.animationCursor
    if (!cursor) {
      return 0
    }
    return this.lines
      .slice(cursor.line)
      .reduce(
        (sum, line, i) =>
          sum +
          (i === 0 ? Math.max(0, line.length - cursor.offset) : line.length),
        0,
      )
  }

  @computed
  public get animatedLines() {
    if (
      !this.animationCursor ||
      !this.animationStart ||
      this.lines.length < this.animationCursor.line ||
      this.lines.length === 0
    ) {
      return this.lines
    }

    const additionalOffset = this.revealed

    let offsetSum = 0
    let lineIndex = this.animationCursor.line
    for (const line of this.lines.slice(this.animationCursor.line)) {
      if (line.length < this.animationCursor.offset) {
        lineIndex++
        continue
      }

      const sub =
        offsetSum === 0 ? line.substring(this.animationCursor.offset) : line
      if (offsetSum + sub.length >= additionalOffset) {
        const cappedLines = this.lines.slice(0, lineIndex + 1)
        cappedLines[cappedLines.length - 1] = last(cappedLines)!.substring(
          0,
          additionalOffset - offsetSum,
        )
        return cappedLines
      } else {
        lineIndex++
        offsetSum += sub.length
      }
    }

    return this.lines
  }

  @computed
  private get lines() {
    return this.lineGetter()
  }
}
