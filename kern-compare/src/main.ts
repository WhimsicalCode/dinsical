import './style.css'
import { loadFonts, type FontPair, type WeightKey } from './fonts'
import {
  loadKernData, makeKernMap, lookupKern, unionPairs,
  filterPairs, groupByCategory, CATEGORY_ORDER,
  type KernPairData, type KernMap, type FilterMode, type RangeMode,
} from './kern-data'
import {
  renderStringOnCanvas, renderStringOverlay,
  renderPairOnCanvas, renderPairOverlay, renderPairContext,
  pairAdvancePx, stringAdvancePx,
  DINSICAL_COLOR, DIN_NEXT_COLOR,
  type RenderOpts,
} from './renderer'

// ── State ──────────────────────────────────────────────────────────────────

interface AppState {
  fontPair:    FontPair | null
  kernData:    KernPairData | null
  dinsicalMap:    KernMap
  dinNextMap: KernMap
  weight:      WeightKey
  italic:      boolean
  fontSize:    number
  lineWidth:   number
  viewMode:    'overlay' | 'sbs'
  filter:      FilterMode
  range:       RangeMode
  previewText: string
  showBaseline: boolean
}

const S: AppState = {
  fontPair:    null,
  kernData:    null,
  dinsicalMap:    new Map(),
  dinNextMap: new Map(),
  weight:      'Regular',
  italic:      false,
  fontSize:    60,
  lineWidth:   1.2,
  viewMode:    'overlay',
  filter:      'all',
  range:       'ascii',
  previewText: 'WATER',
  showBaseline: false,
}

const PRESET_WORDS = ['WATER', 'fjord', 'Yelp', '0.7%', 'AVOCADO', 'Tying']

// ── DOM refs ───────────────────────────────────────────────────────────────

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T
}

const $status       = el('status')
const $selWeight    = el<HTMLSelectElement>('sel-weight')
const $chkItalic    = el<HTMLInputElement>('chk-italic')
const $rngSize      = el<HTMLInputElement>('rng-size')
const $valSize      = el('val-size')
const $rngLw        = el<HTMLInputElement>('rng-lw')
const $valLw        = el('val-lw')
const $chkBaseline  = el<HTMLInputElement>('chk-baseline')
const $previewInput = el<HTMLInputElement>('preview-input')
const $previewWrap  = el('preview-wrap')
const $grid         = el('grid')

// toggle button groups
const $btnViewGroup   = el('btn-view-group')
const $btnFilterGroup = el('btn-filter-group')
const $btnRangeGroup  = el('btn-range-group')

// modal
const $overlay      = el('modal-overlay')
const $mPair        = el('modal-pair')
const $mMeta        = el('modal-meta')
const $mCanvasWrap  = el('modal-canvas-wrap')
const $mCtxWrap     = el('modal-ctx-wrap')
const $mMetrics     = el('modal-metrics')

// ── Render opts ────────────────────────────────────────────────────────────

function opts(): RenderOpts {
  return { fontSize: S.fontSize, lineWidth: S.lineWidth, showBaseline: S.showBaseline }
}

// ── String preview ─────────────────────────────────────────────────────────

function buildPreview(): void {
  $previewWrap.innerHTML = ''
  const pair = S.fontPair
  if (!pair) return
  const text = S.previewText || 'Type something…'

  if (S.viewMode === 'overlay') {
    const canvas = document.createElement('canvas')
    renderStringOverlay(canvas, text, pair, opts())
    $previewWrap.appendChild(canvas)
  } else {
    // side-by-side = two stacked canvases
    const minW = Math.max(
      stringAdvancePx(pair.dinsical,    text, S.fontSize),
      stringAdvancePx(pair.dinNext, text, S.fontSize),
    ) + 16

    for (const [font, color, label] of [
      [pair.dinsical,    DINSICAL_COLOR,    'Dinsical'],
      [pair.dinNext, DIN_NEXT_COLOR, 'DIN Next'],
    ] as const) {
      const row = document.createElement('div')
      row.className = 'sbs-row'
      const tag = document.createElement('span')
      tag.className = 'sbs-tag'
      tag.style.color = color
      tag.textContent = label
      const canvas = document.createElement('canvas')
      renderStringOnCanvas(canvas, text, font, color, opts(), minW)
      row.appendChild(tag)
      row.appendChild(canvas)
      $previewWrap.appendChild(row)
    }
  }
}

// ── Pair grid ──────────────────────────────────────────────────────────────

/** Lazy canvas renderer using IntersectionObserver. */
const renderQueue = new Map<HTMLCanvasElement, () => void>()
let observer: IntersectionObserver | null = null

function ensureObserver(): IntersectionObserver {
  if (observer) return observer
  observer = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (e.isIntersecting) {
        const canvas = e.target as HTMLCanvasElement
        const fn = renderQueue.get(canvas)
        if (fn) { fn(); renderQueue.delete(canvas); observer!.unobserve(canvas) }
      }
    }
  }, { rootMargin: '200px' })
  return observer
}

function scheduleRender(canvas: HTMLCanvasElement, fn: () => void): void {
  renderQueue.set(canvas, fn)
  ensureObserver().observe(canvas)
}

function clearObserver(): void {
  observer?.disconnect()
  observer = null
  renderQueue.clear()
}

function buildGrid(): void {
  clearObserver()
  $grid.innerHTML = ''
  const pair = S.fontPair
  const kern = S.kernData
  if (!pair || !kern) return

  const allPairs = unionPairs(kern)
  const filtered = filterPairs(allPairs, S.dinsicalMap, S.dinNextMap, S.filter, S.range)
  const grouped  = groupByCategory(filtered)

  const { cellH, baseline } = fakeCellDims(pair, S.fontSize)

  for (const cat of CATEGORY_ORDER) {
    const pairs = grouped.get(cat)
    if (!pairs || pairs.length === 0) continue

    const section = document.createElement('div')
    section.className = 'section'

    const title = document.createElement('div')
    title.className = 'section-title'
    title.textContent = `${cat} — ${pairs.length}`
    section.appendChild(title)

    const cells = document.createElement('div')
    cells.className = 'cells'

    for (const [leftCP, rightCP] of pairs) {
      const cell = makePairCell(leftCP, rightCP, pair, cellH, baseline)
      cell.addEventListener('click', () => openModal(leftCP, rightCP))
      cells.appendChild(cell)
    }

    section.appendChild(cells)
    $grid.appendChild(section)
  }

  const total = filtered.length
  const allTotal = allPairs.length
  $status.textContent =
    total === allTotal
      ? `${total} pairs`
      : `${total} of ${allTotal} pairs shown`
}

function fakeCellDims(pair: FontPair, fontSize: number): { cellH: number; baseline: number } {
  const s1 = fontSize / pair.dinsical.unitsPerEm
  const s2 = fontSize / pair.dinNext.unitsPerEm
  const asc  = Math.max(pair.dinsical.ascender   * s1, pair.dinNext.ascender   * s2)
  const desc = Math.max(-pair.dinsical.descender * s1, -pair.dinNext.descender * s2)
  return { cellH: Math.ceil(asc + desc) + 16, baseline: Math.ceil(asc) + 8 }
}

function makePairCell(
  leftCP:   number,
  rightCP:  number,
  pair:     FontPair,
  cellH:    number,
  baseline: number,
): HTMLDivElement {
  const cell  = document.createElement('div')
  cell.className = 'cell'

  const dv = lookupKern(S.dinsicalMap,    leftCP, rightCP)
  const cv = lookupKern(S.dinNextMap, leftCP, rightCP)

  if (S.viewMode === 'overlay') {
    const canvas = document.createElement('canvas')
    // Reserve space so layout doesn't jump when rendered
    const adv1 = pairAdvancePx(pair.dinsical,    leftCP, rightCP, S.fontSize)
    const adv2 = pairAdvancePx(pair.dinNext, leftCP, rightCP, S.fontSize)
    const estW = Math.max(adv1, adv2, S.fontSize * 0.4) + 16
    canvas.style.width  = `${Math.ceil(estW)}px`
    canvas.style.height = `${cellH}px`
    scheduleRender(canvas, () => renderPairOverlay(canvas, leftCP, rightCP, pair, opts()))
    cell.appendChild(canvas)
  } else {
    // side-by-side: two canvases in a flex row
    const wrap = document.createElement('div')
    wrap.className = 'sbs-cell-wrap'
    const c1 = document.createElement('canvas')
    const c2 = document.createElement('canvas')
    c1.className = 'sbs-canvas-d'
    c2.className = 'sbs-canvas-c'
    const adv1 = pairAdvancePx(pair.dinsical,    leftCP, rightCP, S.fontSize)
    const adv2 = pairAdvancePx(pair.dinNext, leftCP, rightCP, S.fontSize)
    c1.style.width  = `${Math.ceil(Math.max(adv1, S.fontSize * 0.4) + 16)}px`
    c1.style.height = `${cellH}px`
    c2.style.width  = `${Math.ceil(Math.max(adv2, S.fontSize * 0.4) + 16)}px`
    c2.style.height = `${cellH}px`
    scheduleRender(c1, () => renderPairOnCanvas(c1, leftCP, rightCP, pair.dinsical,    DINSICAL_COLOR,    opts()))
    scheduleRender(c2, () => renderPairOnCanvas(c2, leftCP, rightCP, pair.dinNext, DIN_NEXT_COLOR, opts()))
    wrap.appendChild(c1)
    wrap.appendChild(c2)
    cell.appendChild(wrap)
  }

  // Label: "AV"
  const lbl = document.createElement('div')
  lbl.className = 'cell-label'
  const l = String.fromCodePoint(leftCP)
  const r = String.fromCodePoint(rightCP)
  const printable = (cp: number) => cp >= 33 && cp <= 126
  lbl.textContent = (printable(leftCP) ? l : `U+${leftCP.toString(16).toUpperCase()}`) +
                    (printable(rightCP) ? r : `U+${rightCP.toString(16).toUpperCase()}`)
  cell.appendChild(lbl)

  // Kern values
  const vals = document.createElement('div')
  vals.className = 'kern-vals'

  const vd = document.createElement('span')
  vd.className = `kv dinsical${dv === 0 ? ' zero' : ''}`
  vd.textContent = dv === 0 ? '—' : String(dv)

  const vc = document.createElement('span')
  vc.className = `kv din-next${cv === 0 ? ' zero' : ''}`
  vc.textContent = cv === 0 ? '—' : String(cv)

  vals.appendChild(vd)
  vals.appendChild(vc)

  if (dv !== 0 && cv !== 0 && dv !== cv) {
    const delta = document.createElement('span')
    delta.className = 'kv delta'
    delta.textContent = `Δ${Math.abs(dv - cv)}`
    vals.appendChild(delta)
  } else if ((dv === 0) !== (cv === 0)) {
    const missing = document.createElement('span')
    missing.className = 'kv missing'
    missing.textContent = dv === 0 ? '▲ missing' : '▲ extra'
    vals.appendChild(missing)
  }

  cell.appendChild(vals)
  return cell
}

// ── Modal ──────────────────────────────────────────────────────────────────

function openModal(leftCP: number, rightCP: number): void {
  const pair = S.fontPair
  if (!pair) return

  const l = String.fromCodePoint(leftCP)
  const r = String.fromCodePoint(rightCP)
  const printable = (cp: number) => cp >= 33 && cp <= 126
  const lLabel = printable(leftCP)  ? l : `U+${leftCP.toString(16).toUpperCase()}`
  const rLabel = printable(rightCP) ? r : `U+${rightCP.toString(16).toUpperCase()}`

  $mPair.textContent = `${lLabel}${rLabel}`
  $mMeta.textContent = `U+${leftCP.toString(16).toUpperCase().padStart(4,'0')} · U+${rightCP.toString(16).toUpperCase().padStart(4,'0')}`

  // Large pair canvas
  $mCanvasWrap.innerHTML = ''
  const bigSize = Math.min(S.fontSize * 2.5, 220)
  const bigCanvas = document.createElement('canvas')
  renderPairOverlay(bigCanvas, leftCP, rightCP, pair, { ...opts(), fontSize: bigSize })
  $mCanvasWrap.appendChild(bigCanvas)

  // Context canvas
  $mCtxWrap.innerHTML = ''
  const ctxCanvas = document.createElement('canvas')
  renderPairContext(ctxCanvas, leftCP, rightCP, pair, { ...opts(), fontSize: bigSize })
  $mCtxWrap.appendChild(ctxCanvas)

  // Metrics
  const dv = lookupKern(S.dinsicalMap,    leftCP, rightCP)
  const cv = lookupKern(S.dinNextMap, leftCP, rightCP)
  const diff = dv - cv

  const g1d = pair.dinsical.charToGlyph(l)
  const g2d = pair.dinsical.charToGlyph(r)
  const g1c = pair.dinNext.charToGlyph(l)
  const g2c = pair.dinNext.charToGlyph(r)

  const awL_d = g1d.advanceWidth ?? 0
  const awR_d = g2d.advanceWidth ?? 0
  const awL_c = g1c.advanceWidth ?? 0
  const awR_c = g2c.advanceWidth ?? 0

  const diffClass = diff !== 0 ? 'diff' : ''

  $mMetrics.innerHTML = `
    <div class="mcard" style="border-top:3px solid ${DINSICAL_COLOR}">
      <div class="mcard-title" style="color:${DINSICAL_COLOR}">Dinsical</div>
      <div class="mrow"><span>left glyph</span><code>${g1d.name ?? '.notdef'}</code></div>
      <div class="mrow"><span>right glyph</span><code>${g2d.name ?? '.notdef'}</code></div>
      <div class="mrow"><span>adv left</span><code>${awL_d}</code></div>
      <div class="mrow"><span>adv right</span><code>${awR_d}</code></div>
      <div class="mrow"><span>kern</span><code class="${diffClass}">${dv}</code></div>
    </div>
    <div class="mcard" style="border-top:3px solid ${DIN_NEXT_COLOR}">
      <div class="mcard-title" style="color:${DIN_NEXT_COLOR}">DIN Next</div>
      <div class="mrow"><span>left glyph</span><code>${g1c.name ?? '.notdef'}</code></div>
      <div class="mrow"><span>right glyph</span><code>${g2c.name ?? '.notdef'}</code></div>
      <div class="mrow"><span>adv left</span><code>${awL_c}</code></div>
      <div class="mrow"><span>adv right</span><code>${awR_c}</code></div>
      <div class="mrow"><span>kern</span><code class="${diffClass}">${cv}</code></div>
    </div>
    ${diff !== 0 ? `
    <div class="mcard mcard-delta">
      <div class="mcard-title">Δ</div>
      <div class="mrow"><span>kern difference</span><code class="diff">${diff > 0 ? '+' : ''}${diff}</code></div>
      <div class="mrow"><span>status</span><code class="diff">${dv === 0 ? 'missing in Dinsical' : cv === 0 ? 'missing in DIN Next' : 'values differ'}</code></div>
    </div>` : ''}
  `

  $overlay.classList.remove('hidden')
}

function closeModal(): void {
  $overlay.classList.add('hidden')
}

// ── Font + data loading ────────────────────────────────────────────────────

async function loadAll(): Promise<void> {
  const label = `${S.weight}${S.italic ? ' Italic' : ''}`
  $status.textContent = `Loading ${label}…`
  $grid.innerHTML = ''
  $previewWrap.innerHTML = ''

  try {
    const [fontPair, kernData] = await Promise.all([
      loadFonts(S.weight, S.italic),
      loadKernData(S.weight, S.italic),
    ])
    S.fontPair    = fontPair
    S.kernData    = kernData
    S.dinsicalMap    = makeKernMap(kernData.dinsical)
    S.dinNextMap = makeKernMap(kernData.dinNext)

    buildPreview()
    buildGrid()
  } catch (err) {
    $status.textContent = `Error: ${(err as Error).message}`
  }
}

// ── Toggle helpers ─────────────────────────────────────────────────────────

function setActive(group: HTMLElement, value: string): void {
  for (const btn of group.querySelectorAll<HTMLButtonElement>('button')) {
    btn.classList.toggle('active', btn.dataset.value === value)
  }
}

function bindToggleGroup(
  group: HTMLElement,
  onChange: (value: string) => void,
): void {
  group.addEventListener('click', e => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button')
    if (!btn || !btn.dataset.value) return
    setActive(group, btn.dataset.value)
    onChange(btn.dataset.value)
  })
}

// ── Preset word buttons ────────────────────────────────────────────────────

function buildPresets(): void {
  const wrap = el('preset-btns')
  for (const word of PRESET_WORDS) {
    const btn = document.createElement('button')
    btn.className = 'preset-btn'
    btn.textContent = word
    if (word === S.previewText) btn.classList.add('active')
    btn.addEventListener('click', () => {
      S.previewText = word
      $previewInput.value = word
      wrap.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      buildPreview()
    })
    wrap.appendChild(btn)
  }
}

// ── Events ─────────────────────────────────────────────────────────────────

$selWeight.addEventListener('change', () => { S.weight = $selWeight.value as WeightKey; loadAll() })
$chkItalic.addEventListener('change', () => { S.italic = $chkItalic.checked; loadAll() })

$rngSize.addEventListener('input', () => {
  S.fontSize = Number($rngSize.value)
  $valSize.textContent = `${S.fontSize}px`
  buildPreview()
  buildGrid()
})

$rngLw.addEventListener('input', () => {
  S.lineWidth = Number($rngLw.value) / 10
  $valLw.textContent = `${S.lineWidth.toFixed(1)}px`
  buildPreview()
  buildGrid()
})

$chkBaseline.addEventListener('change', () => {
  S.showBaseline = $chkBaseline.checked
  buildPreview()
  buildGrid()
})

$previewInput.addEventListener('input', () => {
  S.previewText = $previewInput.value
  // deactivate preset buttons
  el('preset-btns').querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'))
  buildPreview()
})

bindToggleGroup($btnViewGroup, v => {
  S.viewMode = v as 'overlay' | 'sbs'
  buildPreview()
  buildGrid()
})

bindToggleGroup($btnFilterGroup, v => {
  S.filter = v as FilterMode
  buildGrid()
})

bindToggleGroup($btnRangeGroup, v => {
  S.range = v as RangeMode
  buildGrid()
})

$overlay.addEventListener('click', e => { if (e.target === $overlay) closeModal() })
el('modal-close').addEventListener('click', closeModal)
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal() })

// ── Init ───────────────────────────────────────────────────────────────────

buildPresets()
loadAll()
