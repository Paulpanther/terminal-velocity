import { autorun, createAtom, type IAtom } from 'mobx'

export abstract class State {
  private readonly atom: IAtom
  public readonly name: string

  protected constructor(name: string) {
    this.name = name
    this.atom = createAtom(name)
  }

  protected observe() {
    this.atom.reportObserved()
  }

  protected changed() {
    this.atom.reportChanged()
  }

  protected abstract _save(): object

  public save(): object {
    this.observe()
    return this._save()
  }

  public abstract load(data: object): void
}

export function persist<T extends State>(state: T, storage = localStorage): T {
  const key = `tv:${state.name}`
  const raw = storage.getItem(key)
  if (raw) {
    try {
      state.load(JSON.parse(raw))
    } catch {
      storage.removeItem(key)
    }
  }
  autorun(() => storage.setItem(key, JSON.stringify(state.save())), {
    delay: 250,
  })
  return state
}
