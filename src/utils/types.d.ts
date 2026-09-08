export type Constructor<T> = new () => T

/**
 * Optional lifecycle hooks a view model can implement. `useViewModel` calls
 * `init` when the view mounts and `dispose` when it unmounts, so anything that
 * outlives a render — reactions, timers, animation frames — is torn down.
 */
export interface ViewModel {
  init?(): void
  dispose?(): void
}
