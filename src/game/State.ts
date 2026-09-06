import { createAtom, type IAtom } from 'mobx'

export class State {
  private readonly atom: IAtom

  constructor(name: string) {
    this.atom = createAtom(name)
  }

  protected observe() {
    this.atom.reportObserved()
  }

  protected changed() {
    this.atom.reportChanged()
  }
}
