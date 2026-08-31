import styles from './App.module.scss'
import { Console } from '@/components/Console/Console.tsx'

function App() {
  return (
    <main className={styles.app}>
      <Console />
    </main>
  )
}

export default App
