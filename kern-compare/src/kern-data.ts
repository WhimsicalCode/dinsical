import type { WeightKey } from './fonts'

// [leftCodepoint, rightCodepoint, xAdvanceValue]
export type KernEntry = [number, number, number]
export type KernPairData = { dinsy: KernEntry[]; dinsical: KernEntry[] }
export type KernMap = Map<string, number>   // key: "leftCP,rightCP"

export function makeKernMap(entries: KernEntry[]): KernMap {
  const m = new Map<string, number>()
  for (const [l, r, v] of entries) m.set(`${l},${r}`, v)
  return m
}

export function lookupKern(map: KernMap, leftCP: number, rightCP: number): number {
  return map.get(`${leftCP},${rightCP}`) ?? 0
}

/** Union of all pairs where at least one font has a non-zero value. */
export function unionPairs(data: KernPairData): Array<[number, number]> {
  const seen = new Set<string>()
  const result: Array<[number, number]> = []
  const add = (l: number, r: number) => {
    const k = `${l},${r}`
    if (!seen.has(k)) { seen.add(k); result.push([l, r]) }
  }
  for (const [l, r] of data.dinsy)    add(l, r)
  for (const [l, r] of data.dinsical) add(l, r)
  return result
}

// ── Filtering ──────────────────────────────────────────────────────────────

export type FilterMode = 'all' | 'dinsical' | 'dinsy'
export type RangeMode  = 'ascii' | 'latin' | 'all'

export function filterPairs(
  pairs:     Array<[number, number]>,
  dinsyMap:  KernMap,
  dinsicalMap: KernMap,
  filter:    FilterMode,
  range:     RangeMode,
): Array<[number, number]> {
  const inRange = rangeFilter(range)
  const inFilter = filterFn(filter, dinsyMap, dinsicalMap)
  return pairs.filter(([l, r]) => inRange(l, r) && inFilter(l, r))
}

function rangeFilter(range: RangeMode): (l: number, r: number) => boolean {
  if (range === 'ascii')  return (l, r) => l >= 32 && l <= 126 && r >= 32 && r <= 126
  if (range === 'latin')  return (l, r) => l >= 32 && l <= 591 && r >= 32 && r <= 591
  return () => true
}

function filterFn(
  filter: FilterMode,
  dinsyMap: KernMap,
  dinsicalMap: KernMap,
): (l: number, r: number) => boolean {
  if (filter === 'dinsical') return (l, r) => lookupKern(dinsicalMap, l, r) !== 0
  if (filter === 'dinsy')    return (l, r) => lookupKern(dinsyMap,    l, r) !== 0
  return () => true
}

// ── Categorisation ─────────────────────────────────────────────────────────

export type Category = 'UC–UC' | 'UC–LC' | 'LC–LC' | 'LC–UC' | 'Digits' | 'Space' | 'Other'

const isUC    = (cp: number) => cp >= 65  && cp <= 90
const isLC    = (cp: number) => cp >= 97  && cp <= 122
const isDigit = (cp: number) => cp >= 48  && cp <= 57
const isSpace = (cp: number) => cp === 32

export function categorise(l: number, r: number): Category {
  if (isSpace(l) || isSpace(r)) return 'Space'
  if (isDigit(l) || isDigit(r)) return 'Digits'
  if (isUC(l) && isUC(r))       return 'UC–UC'
  if (isUC(l) && isLC(r))       return 'UC–LC'
  if (isLC(l) && isUC(r))       return 'LC–UC'
  if (isLC(l) && isLC(r))       return 'LC–LC'
  return 'Other'
}

export const CATEGORY_ORDER: Category[] = ['UC–UC', 'UC–LC', 'LC–LC', 'LC–UC', 'Digits', 'Space', 'Other']

export function groupByCategory(
  pairs: Array<[number, number]>,
): Map<Category, Array<[number, number]>> {
  const map = new Map<Category, Array<[number, number]>>()
  for (const cat of CATEGORY_ORDER) map.set(cat, [])
  for (const [l, r] of pairs) {
    map.get(categorise(l, r))!.push([l, r])
  }
  // remove empty categories
  for (const [cat, list] of map) {
    if (list.length === 0) map.delete(cat)
  }
  return map
}

// ── Loading ────────────────────────────────────────────────────────────────

const cache = new Map<string, KernPairData>()

export async function loadKernData(weight: WeightKey, italic: boolean): Promise<KernPairData> {
  const key = `${weight}-${italic ? 'italic' : 'upright'}`
  if (cache.has(key)) return cache.get(key)!
  const res = await fetch(`/kern-data/${key}.json`)
  if (!res.ok) throw new Error(`HTTP ${res.status} — /kern-data/${key}.json`)
  const data = await res.json() as KernPairData
  cache.set(key, data)
  return data
}
