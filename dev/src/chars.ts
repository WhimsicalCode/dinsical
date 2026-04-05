export interface Section {
  label: string
  chars: string[]
}

export const SECTIONS: Section[] = [
  { label: 'Uppercase',   chars: [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'] },
  { label: 'Lowercase',   chars: [...'abcdefghijklmnopqrstuvwxyz'] },
  { label: 'Digits',      chars: [...'0123456789'] },
  { label: 'Punctuation', chars: [...'.,;:!?"\'`-–—…_()[]{}/\\@#$%&*+=<>^~|'] },
]
