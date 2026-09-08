import { useEffect, useState } from 'react'
import type { Constructor, ViewModel } from '@/utils/types'

export function useViewModel<T>(clazz: Constructor<T>) {
  const [viewModel] = useState(() => new clazz())

  useEffect(() => {
    const vm = viewModel as ViewModel
    vm.init?.()
    return () => vm.dispose?.()
  }, [viewModel])

  return viewModel
}
