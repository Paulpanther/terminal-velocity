import { useState } from 'react'
import type { Constructor } from '@/utils/types'

export function useViewModel<T>(clazz: Constructor<T>) {
  const [viewModel] = useState(() => new clazz())
  return viewModel
}
