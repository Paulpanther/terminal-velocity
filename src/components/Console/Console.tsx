import { ConsoleViewModel } from '@/components/Console/ConsoleViewModel.ts'
import { useViewModel } from '@/hooks/useViewModel.ts'
import * as React from 'react'
import { observer } from 'mobx-react-lite'
import styles from './Console.module.scss'
import type { Completion } from '@/game/shell/ShellParser.ts'

// The plain-text prefix shown before the input. It is the single source of
// truth for BOTH the rendered prefix (below) and the textarea's text-indent —
// keeping them derived from the same string is what keeps the caret aligned.
// Return '' for no prefix.
function inputPrefix(vm: ConsoleViewModel): string {
  return `${vm.currentPath} > `
}

const Highlight = observer(({ vm }: { vm: ConsoleViewModel }) => {
  const prefix = inputPrefix(vm)
  const inlineCompletion = vm.completions.find((c) => c.complete)
  return (
    <>
      {prefix && <span className={styles.prefix}>{prefix}</span>}
      {vm.input}
      {inlineCompletion && (
        <span className={styles.inlineCompletion}>
          {inlineCompletion.complete}
        </span>
      )}
    </>
  )
})

const FlagCompletion = observer(
  ({ completion }: { completion: Completion }) => (
    <>
      <span className={styles.completionName}>--{completion.name}</span>
      <span className={styles.completionDescription}>
        {completion.description}
      </span>
    </>
  ),
)

const CommandCompletion = observer(
  ({ completion }: { completion: Completion }) => (
    <>
      <span className={styles.completionName}>{completion.name}</span>
      <span className={styles.completionDescription}>
        {completion.description}
      </span>
    </>
  ),
)

// const ParamCompletion = observer(
//   ({ completion }: { completion: Completion }) => (
//     <>
//       <span className={styles.completionName}>&lt;{completion.name}&gt;</span>
//       <span className={styles.completionDescription}>
//         {completion.description}
//       </span>
//     </>
//   ),
// )

export const Console = observer(() => {
  const vm = useViewModel(ConsoleViewModel)

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter submits; Shift+Enter inserts a newline.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void vm.submit()
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      vm.complete()
    }
  }

  return (
    <div className={styles.console}>
      <div className={styles.output}>
        {vm.animator.animatedLines.map((l, i) => (
          <span key={i}>{l}</span>
        ))}
      </div>
      <div className={styles.input}>
        <div className={styles.overlay} aria-hidden>
          <Highlight vm={vm} />
          {'\n'}
        </div>
        <textarea
          className={styles.textarea}
          // Indent the first line by the prefix width so the (transparent)
          // caret and typed glyphs line up with the visible input in the
          // overlay. `ch` == one monospace cell, so length === width.
          style={{ textIndent: `${inputPrefix(vm).length}ch` }}
          value={vm.input}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          rows={1}
          onChange={(e) => vm.onInputChange(e.currentTarget.value)}
          onKeyDown={onKeyDown}
        />
      </div>
      <div className={styles.completions}>
        {vm.completions.map((c, i) => {
          if (c.command) {
            return <CommandCompletion completion={c} key={i} />
          }
          if (c.flag) {
            return <FlagCompletion completion={c} key={i} />
          }
          // don't show param completions here
          return <></>
        })}
      </div>
    </div>
  )
})
