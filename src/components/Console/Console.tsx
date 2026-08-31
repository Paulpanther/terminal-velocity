import { ConsoleViewModel } from '@/components/Console/ConsoleViewModel.ts'
import { useViewModel } from '@/hooks/useViewModel.ts'
import { runInAction } from 'mobx'
import * as React from 'react'
import { observer } from 'mobx-react-lite'
import styles from './Console.module.scss'

export const Console = observer(() => {
  const vm = useViewModel(ConsoleViewModel)

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      vm.submit()
    }
  }

  return (
    <div className={styles.console}>
      <div className={styles.output}>
        {vm.lines.map((l, i) => (
          <span key={i}>{l}</span>
        ))}
      </div>
      <textarea
        className={styles.input}
        value={vm.input}
        onChange={(e) => runInAction(() => (vm.input = e.currentTarget.value))}
        onKeyDown={(e) => onKeyDown(e)}
      />
    </div>
  )
})
