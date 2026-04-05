import './style.css'
import { loadFonts, type FontPair, type WeightKey } from './fonts'
import {
  renderCell, getGlyphInfo, computeModalFontSize,
} from './glyph-renderer'
import { SECTIONS } from './chars'
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
} from './kern-renderer'

// ── Types ─────────────────────────────────────────────────────────────────

type Tab = 'glyphs' | 'kern'

// ── Shared state ──────────────────────────────────────────────────────────

const SH = {
  weight:       'Regular' as WeightKey,
  italic:       false,
  lineWidth:    1.2,
  showBaseline: false,
  activeTab:    'glyphs' as Tab,
}

// ── Glyph state ───────────────────────────────────────────────────────────

const GS = {
  pair:         null as FontPair | null,
  fontSize:     100,
  showDinsical: true,
  showDinNext:  true,
  statusText:   'Loading…',
}

// ── Kern state ────────────────────────────────────────────────────────────

const KS = {
  fontPair:    null as FontPair | null,
  kernData:    null as KernPairData | null,
  dinsicalMap: new Map() as KernMap,
  dinNextMap:  new Map() as KernMap,
  fontSize:    60,
  viewMode:    'overlay' as 'overlay' | 'sbs',
  filter:      'all' as FilterMode,
  range:       'ascii' as RangeMode,
  previewText: 'WATER',
  statusText:  'Loading…',
}

const PRESET_WORDS = ['WATER', 'fjord', 'Yelp', '0.7%', 'AVOCADO', 'Tying']

// ── DOM refs ───────────────────────────────────────────────────────────────

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T
}

const $status       = el('status')
const $tabs         = el('tabs')
const $selWeight    = el<HTMLSelectElement>('sel-weight')
const $chkItalic    = el<HTMLInputElement>('chk-italic')
const $rngSize      = el<HTMLInputElement>('rng-size')
const $valSize      = el('val-size')
const $rngLw        = el<HTMLInputElement>('rng-lw')
const $valLw        = el('val-lw')
const $chkBaseline  = el<HTMLInputElement>('chk-baseline')
// Glyph-specific
const $chkDinsical  = el<HTMLInputElement>('chk-dinsical')
const $chkDinNext   = el<HTMLInputElement>('chk-din-next')
const $glyphGrid    = el('glyph-grid')
// Kern-specific
const $previewInput = el<HTMLInputElement>('preview-input')
const $previewWrap  = el('preview-wrap')
const $kernGrid     = el('kern-grid')
const $btnViewGroup   = el('btn-view-group')
const $btnFilterGroup = el('btn-filter-group')
const $btnRangeGroup  = el('btn-range-group')
// Modal
const $overlay      = el('modal-overlay')
const $modalCard    = el('modal-card')
const $mChar        = el('modal-char')
const $mPair        = el('modal-pair')
const $mMeta        = el('modal-meta')
const $mCanvasWrap  = el('modal-canvas-wrap')
const $mCtxSection  = el('modal-ctx-section')
const $mCtxWrap     = el('modal-ctx-wrap')
const $mMetrics     = el('modal-metrics')

// ── Render opts ────────────────────────────────────────────────────────────

function glyphOpts() {
  return {
    fontSize:     GS.fontSize,
    showDinsical: GS.showDinsical,
    showDinNext:  GS.showDinNext,
    lineWidth:    SH.lineWidth,
    showBaseline: SH.showBaseline,
  }
}

function kernOpts() {
  return { fontSize: KS.fontSize, lineWidth: SH.lineWidth, showBaseline: SH.showBaseline }
}

// ── Status bar ─────────────────────────────────────────────────────────────

function setGlyphStatus(text: string): void {
  GS.statusText = text
  if (SH.activeTab === 'glyphs') $status.textContent = text
}

function setKernStatus(text: string): void {
  KS.statusText = text
  if (SH.activeTab === 'kern') $status.textContent = text
}

// ── Tab switching ──────────────────────────────────────────────────────────

function switchTab(tab: Tab): void {
  if (SH.activeTab === tab) return
  SH.activeTab = tab

  document.body.className = `tab-${tab}`

  // Update tab button styles
  for (const btn of $tabs.querySelectorAll<HTMLButtonElement>('.tab-btn')) {
    btn.classList.toggle('active', btn.dataset.tab === tab)
  }

  // Sync size slider to per-tab fontSize
  const fs = tab === 'glyphs' ? GS.fontSize : KS.fontSize
  $rngSize.value = String(fs)
  $valSize.textContent = `${fs}px`

  // Restore status for newly-active tab
  $status.textContent = tab === 'glyphs' ? GS.statusText : KS.statusText
}

// ── Sync shared controls from DOM ──────────────────────────────────────────

function syncShared(): void {
  SH.weight       = $selWeight.value as WeightKey
  SH.italic       = $chkItalic.checked
  SH.lineWidth    = Number($rngLw.value) / 10
  SH.showBaseline = $chkBaseline.checked
  $valLw.textContent = `${SH.lineWidth.toFixed(1)}px`
}

function syncGlyphControls(): void {
  const fs = Number($rngSize.value)
  GS.fontSize     = fs
  GS.showDinsical = $chkDinsical.checked
  GS.showDinNext  = $chkDinNext.checked
  $valSize.textContent = `${fs}px`
}

function syncKernControls(): void {
  const fs = Number($rngSize.value)
  KS.fontSize = fs
  $valSize.textContent = `${fs}px`
}

// ── Helpers ────────────────────────────────────────────────────────────────

function charLabel(char: string): string {
  const cp = char.codePointAt(0)!
  return (cp >= 0x20 && cp <= 0x7e) ? char : `U+${cp.toString(16).toUpperCase()}`
}

function cpHex(char: string): string {
  return `U+${char.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`
}

// ════════════════════════════════════════════════════════════════════════════
// GLYPH TAB
// ════════════════════════════════════════════════════════════════════════════

function buildGlyphGrid(pair: FontPair): void {
  $glyphGrid.innerHTML = ''
  const opts = glyphOpts()

  for (const { label, chars } of SECTIONS) {
    const section = document.createElement('div')
    section.className = 'section'

    const title = document.createElement('div')
    title.className = 'section-title'
    title.textContent = label
    section.appendChild(title)

    const cells = document.createElement('div')
    cells.className = 'cells'

    for (const char of chars) {
      const cell = document.createElement('div')
      cell.className = 'cell'
      cell.title = cpHex(char)

      const canvas = document.createElement('canvas')
      renderCell(canvas, char, pair, opts)

      const lbl = document.createElement('div')
      lbl.className = 'cell-label'
      lbl.textContent = charLabel(char)

      cell.appendChild(canvas)
      cell.appendChild(lbl)
      cell.addEventListener('click', () => openGlyphModal(char))
      cells.appendChild(cell)
    }

    section.appendChild(cells)
    $glyphGrid.appendChild(section)
  }
}

function refreshGlyphGrid(): void {
  const pair = GS.pair
  if (!pair) return
  const opts = glyphOpts()
  const canvases = Array.from($glyphGrid.querySelectorAll<HTMLCanvasElement>('canvas'))
  let i = 0
  for (const { chars } of SECTIONS) {
    for (const char of chars) {
      if (canvases[i]) renderCell(canvases[i], char, pair, opts)
      i++
    }
  }
}

async function loadGlyphs(): Promise<void> {
  setGlyphStatus(`Loading ${SH.weight}${SH.italic ? ' Italic' : ''}…`)
  try {
    const pair = await loadFonts(SH.weight, SH.italic)
    GS.pair = pair
    const d = pair.dinsical
    const c = pair.dinNext
    setGlyphStatus(
      `Dinsical — UPM ${d.unitsPerEm}  asc ${d.ascender}  desc ${d.descender}` +
      `   ·   ` +
      `DIN Next — UPM ${c.unitsPerEm}  asc ${c.ascender}  desc ${c.descender}`,
    )
    buildGlyphGrid(pair)
  } catch (err) {
    setGlyphStatus(`Error: ${(err as Error).message}`)
  }
}

// ── Glyph modal ────────────────────────────────────────────────────────────

function openGlyphModal(char: string): void {
  const pair = GS.pair
  if (!pair) return

  $overlay.className = 'modal-overlay modal-glyph'
  $mChar.textContent = char
  $mChar.style.display = ''
  $mPair.style.display = 'none'
  $mCtxSection.style.display = 'none'

  const cp = char.codePointAt(0)!
  $mMeta.textContent = cpHex(char)
  $mCanvasWrap.innerHTML = ''

  requestAnimationFrame(() => {
    const rect   = $mCanvasWrap.getBoundingClientRect()
    const availW = rect.width  - 24
    const availH = rect.height - 24
    const bigSize = computeModalFontSize(char, pair!, availW, availH)
    const canvas = document.createElement('canvas')
    renderCell(canvas, char, pair!, glyphOpts(), bigSize)
    $mCanvasWrap.appendChild(canvas)
  })

  const i1 = getGlyphInfo(char, pair.dinsical)
  const i2 = getGlyphInfo(char, pair.dinNext)
  const awDiff = i1.advanceWidth !== i2.advanceWidth

  $mMetrics.innerHTML = `
    <div class="mcard" style="border-top:3px solid #dc2626">
      <div class="mcard-title" style="color:#dc2626">Dinsical</div>
      <div class="mrow"><span>glyph name</span>  <code>${i1.name}</code></div>
      <div class="mrow"><span>advance width</span><code class="${awDiff ? 'diff' : ''}">${i1.advanceWidth}</code></div>
      <div class="mrow"><span>UPM</span>          <code>${pair.dinsical.unitsPerEm}</code></div>
    </div>
    <div class="mcard" style="border-top:3px solid #2563eb">
      <div class="mcard-title" style="color:#2563eb">DIN Next</div>
      <div class="mrow"><span>glyph name</span>  <code>${i2.name}</code></div>
      <div class="mrow"><span>advance width</span><code class="${awDiff ? 'diff' : ''}">${i2.advanceWidth}</code></div>
      <div class="mrow"><span>UPM</span>          <code>${pair.dinNext.unitsPerEm}</code></div>
    </div>
  `
}

// ════════════════════════════════════════════════════════════════════════════
// KERN TAB
// ════════════════════════════════════════════════════════════════════════════

// ── Lazy observer ─────────────────────────────────────────────────────────

const renderQueue = new Map<HTMLCanvasElement, () => void>()
let kernObserver: IntersectionObserver | null = null

function ensureObserver(): IntersectionObserver {
  if (kernObserver) return kernObserver
  kernObserver = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (e.isIntersecting) {
        const canvas = e.target as HTMLCanvasElement
        const fn = renderQueue.get(canvas)
        if (fn) { fn(); renderQueue.delete(canvas); kernObserver!.unobserve(canvas) }
      }
    }
  }, { rootMargin: '200px' })
  return kernObserver
}

function scheduleRender(canvas: HTMLCanvasElement, fn: () => void): void {
  renderQueue.set(canvas, fn)
  ensureObserver().observe(canvas)
}

function clearKernObserver(): void {
  kernObserver?.disconnect()
  kernObserver = null
  renderQueue.clear()
}

// ── Preview ────────────────────────────────────────────────────────────────

function buildPreview(): void {
  $previewWrap.innerHTML = ''
  const pair = KS.fontPair
  if (!pair) return
  const text = KS.previewText || 'Type something…'
  const opts = kernOpts()

  if (KS.viewMode === 'overlay') {
    const canvas = document.createElement('canvas')
    renderStringOverlay(canvas, text, pair, opts)
    $previewWrap.appendChild(canvas)
  } else {
    const minW = Math.max(
      stringAdvancePx(pair.dinsical, text, KS.fontSize),
      stringAdvancePx(pair.dinNext,  text, KS.fontSize),
    ) + 16

    for (const [font, color, label] of [
      [pair.dinsical, DINSICAL_COLOR, 'Dinsical'],
      [pair.dinNext,  DIN_NEXT_COLOR, 'DIN Next'],
    ] as const) {
      const row = document.createElement('div')
      row.className = 'sbs-row'
      const tag = document.createElement('span')
      tag.className = 'sbs-tag'
      tag.style.color = color
      tag.textContent = label
      const canvas = document.createElement('canvas')
      renderStringOnCanvas(canvas, text, font, color, opts, minW)
      row.appendChild(tag)
      row.appendChild(canvas)
      $previewWrap.appendChild(row)
    }
  }
}

// ── Pair grid ──────────────────────────────────────────────────────────────

function buildKernGrid(): void {
  clearKernObserver()
  $kernGrid.innerHTML = ''
  const pair = KS.fontPair
  const kern = KS.kernData
  if (!pair || !kern) return

  const allPairs = unionPairs(kern)
  const filtered = filterPairs(allPairs, KS.dinsicalMap, KS.dinNextMap, KS.filter, KS.range)
  const grouped  = groupByCategory(filtered)

  const { cellH } = fakeCellDims(pair, KS.fontSize)

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
      const cell = makePairCell(leftCP, rightCP, pair, cellH)
      cell.addEventListener('click', () => openKernModal(leftCP, rightCP))
      cells.appendChild(cell)
    }

    section.appendChild(cells)
    $kernGrid.appendChild(section)
  }

  const total = filtered.length
  const allTotal = allPairs.length
  setKernStatus(total === allTotal ? `${total} pairs` : `${total} of ${allTotal} pairs shown`)
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
): HTMLDivElement {
  const cell = document.createElement('div')
  cell.className = 'cell'

  const dv = lookupKern(KS.dinsicalMap, leftCP, rightCP)
  const cv = lookupKern(KS.dinNextMap,  leftCP, rightCP)
  const opts = kernOpts()

  if (KS.viewMode === 'overlay') {
    const canvas = document.createElement('canvas')
    const adv1 = pairAdvancePx(pair.dinsical, leftCP, rightCP, KS.fontSize)
    const adv2 = pairAdvancePx(pair.dinNext,  leftCP, rightCP, KS.fontSize)
    const estW = Math.max(adv1, adv2, KS.fontSize * 0.4) + 16
    canvas.style.width  = `${Math.ceil(estW)}px`
    canvas.style.height = `${cellH}px`
    scheduleRender(canvas, () => renderPairOverlay(canvas, leftCP, rightCP, pair, opts))
    cell.appendChild(canvas)
  } else {
    const wrap = document.createElement('div')
    wrap.className = 'sbs-cell-wrap'
    const c1 = document.createElement('canvas')
    const c2 = document.createElement('canvas')
    c1.className = 'sbs-canvas-d'
    c2.className = 'sbs-canvas-c'
    const adv1 = pairAdvancePx(pair.dinsical, leftCP, rightCP, KS.fontSize)
    const adv2 = pairAdvancePx(pair.dinNext,  leftCP, rightCP, KS.fontSize)
    c1.style.width  = `${Math.ceil(Math.max(adv1, KS.fontSize * 0.4) + 16)}px`
    c1.style.height = `${cellH}px`
    c2.style.width  = `${Math.ceil(Math.max(adv2, KS.fontSize * 0.4) + 16)}px`
    c2.style.height = `${cellH}px`
    scheduleRender(c1, () => renderPairOnCanvas(c1, leftCP, rightCP, pair.dinsical, DINSICAL_COLOR, opts))
    scheduleRender(c2, () => renderPairOnCanvas(c2, leftCP, rightCP, pair.dinNext,  DIN_NEXT_COLOR, opts))
    wrap.appendChild(c1)
    wrap.appendChild(c2)
    cell.appendChild(wrap)
  }

  // Pair label
  const lbl = document.createElement('div')
  lbl.className = 'cell-label'
  const printable = (cp: number) => cp >= 33 && cp <= 126
  lbl.textContent =
    (printable(leftCP)  ? String.fromCodePoint(leftCP)  : `U+${leftCP.toString(16).toUpperCase()}`) +
    (printable(rightCP) ? String.fromCodePoint(rightCP) : `U+${rightCP.toString(16).toUpperCase()}`)
  cell.appendChild(lbl)

  // Kern value badges
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

// ── Kern modal ─────────────────────────────────────────────────────────────

function openKernModal(leftCP: number, rightCP: number): void {
  const pair = KS.fontPair
  if (!pair) return

  $overlay.className = 'modal-overlay modal-kern'
  $mChar.style.display = 'none'
  $mPair.style.display = ''
  $mCtxSection.style.display = ''

  const l = String.fromCodePoint(leftCP)
  const r = String.fromCodePoint(rightCP)
  const printable = (cp: number) => cp >= 33 && cp <= 126
  const lLabel = printable(leftCP)  ? l : `U+${leftCP.toString(16).toUpperCase()}`
  const rLabel = printable(rightCP) ? r : `U+${rightCP.toString(16).toUpperCase()}`

  $mPair.textContent = `${lLabel}${rLabel}`
  $mMeta.textContent = `U+${leftCP.toString(16).toUpperCase().padStart(4,'0')} · U+${rightCP.toString(16).toUpperCase().padStart(4,'0')}`

  const bigSize = Math.min(KS.fontSize * 2.5, 220)
  const bigOpts = { ...kernOpts(), fontSize: bigSize }

  $mCanvasWrap.innerHTML = ''
  const bigCanvas = document.createElement('canvas')
  renderPairOverlay(bigCanvas, leftCP, rightCP, pair, bigOpts)
  $mCanvasWrap.appendChild(bigCanvas)

  $mCtxWrap.innerHTML = ''
  const ctxCanvas = document.createElement('canvas')
  renderPairContext(ctxCanvas, leftCP, rightCP, pair, bigOpts)
  $mCtxWrap.appendChild(ctxCanvas)

  const dv = lookupKern(KS.dinsicalMap, leftCP, rightCP)
  const cv = lookupKern(KS.dinNextMap,  leftCP, rightCP)
  const diff = dv - cv

  const g1d = pair.dinsical.charToGlyph(l)
  const g2d = pair.dinsical.charToGlyph(r)
  const g1c = pair.dinNext.charToGlyph(l)
  const g2c = pair.dinNext.charToGlyph(r)

  const diffClass = diff !== 0 ? 'diff' : ''

  $mMetrics.innerHTML = `
    <div class="mcard" style="border-top:3px solid ${DINSICAL_COLOR}">
      <div class="mcard-title" style="color:${DINSICAL_COLOR}">Dinsical</div>
      <div class="mrow"><span>left glyph</span><code>${g1d.name ?? '.notdef'}</code></div>
      <div class="mrow"><span>right glyph</span><code>${g2d.name ?? '.notdef'}</code></div>
      <div class="mrow"><span>adv left</span><code>${g1d.advanceWidth ?? 0}</code></div>
      <div class="mrow"><span>adv right</span><code>${g2d.advanceWidth ?? 0}</code></div>
      <div class="mrow"><span>kern</span><code class="${diffClass}">${dv}</code></div>
    </div>
    <div class="mcard" style="border-top:3px solid ${DIN_NEXT_COLOR}">
      <div class="mcard-title" style="color:${DIN_NEXT_COLOR}">DIN Next</div>
      <div class="mrow"><span>left glyph</span><code>${g1c.name ?? '.notdef'}</code></div>
      <div class="mrow"><span>right glyph</span><code>${g2c.name ?? '.notdef'}</code></div>
      <div class="mrow"><span>adv left</span><code>${g1c.advanceWidth ?? 0}</code></div>
      <div class="mrow"><span>adv right</span><code>${g2c.advanceWidth ?? 0}</code></div>
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

// ── Kern loading ───────────────────────────────────────────────────────────

async function loadKern(): Promise<void> {
  const label = `${SH.weight}${SH.italic ? ' Italic' : ''}`
  setKernStatus(`Loading ${label}…`)
  $kernGrid.innerHTML = ''
  $previewWrap.innerHTML = ''

  try {
    const [fontPair, kernData] = await Promise.all([
      loadFonts(SH.weight, SH.italic),
      loadKernData(SH.weight, SH.italic),
    ])
    KS.fontPair    = fontPair
    KS.kernData    = kernData
    KS.dinsicalMap = makeKernMap(kernData.dinsical)
    KS.dinNextMap  = makeKernMap(kernData.dinNext)

    buildPreview()
    buildKernGrid()
  } catch (err) {
    setKernStatus(`Error: ${(err as Error).message}`)
  }
}

// ════════════════════════════════════════════════════════════════════════════
// MODAL shared
// ════════════════════════════════════════════════════════════════════════════

function closeModal(): void {
  $overlay.classList.add('hidden')
}

// ════════════════════════════════════════════════════════════════════════════
// TOGGLE HELPERS
// ════════════════════════════════════════════════════════════════════════════

function setActive(group: HTMLElement, value: string): void {
  for (const btn of group.querySelectorAll<HTMLButtonElement>('button')) {
    btn.classList.toggle('active', btn.dataset.value === value)
  }
}

function bindToggleGroup(group: HTMLElement, onChange: (value: string) => void): void {
  group.addEventListener('click', e => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button')
    if (!btn || !btn.dataset.value) return
    setActive(group, btn.dataset.value)
    onChange(btn.dataset.value)
  })
}

// ════════════════════════════════════════════════════════════════════════════
// PRESET WORDS (kern tab)
// ════════════════════════════════════════════════════════════════════════════

function buildPresets(): void {
  const wrap = el('preset-btns')
  for (const word of PRESET_WORDS) {
    const btn = document.createElement('button')
    btn.className = 'preset-btn'
    btn.textContent = word
    if (word === KS.previewText) btn.classList.add('active')
    btn.addEventListener('click', () => {
      KS.previewText = word
      $previewInput.value = word
      wrap.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      buildPreview()
    })
    wrap.appendChild(btn)
  }
}

// ════════════════════════════════════════════════════════════════════════════
// EVENTS
// ════════════════════════════════════════════════════════════════════════════

// Tab switching
$tabs.addEventListener('click', e => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.tab-btn')
  if (!btn || !btn.dataset.tab) return
  switchTab(btn.dataset.tab as Tab)
})

// Font change → reload both tabs
$selWeight.addEventListener('change', () => {
  syncShared()
  loadGlyphs()
  loadKern()
})
$chkItalic.addEventListener('change', () => {
  syncShared()
  loadGlyphs()
  loadKern()
})

// Size range → per-tab
$rngSize.addEventListener('input', () => {
  if (SH.activeTab === 'glyphs') {
    syncGlyphControls()
    refreshGlyphGrid()
  } else {
    syncKernControls()
    buildPreview()
    buildKernGrid()
  }
})

// Line width → both tabs re-render
$rngLw.addEventListener('input', () => {
  syncShared()
  if (SH.activeTab === 'glyphs') refreshGlyphGrid()
  else { buildPreview(); buildKernGrid() }
})

// Baseline → re-render active tab
$chkBaseline.addEventListener('change', () => {
  syncShared()
  if (SH.activeTab === 'glyphs') refreshGlyphGrid()
  else { buildPreview(); buildKernGrid() }
})

// Glyph-specific
$chkDinsical.addEventListener('change', () => { syncGlyphControls(); refreshGlyphGrid() })
$chkDinNext.addEventListener('change',  () => { syncGlyphControls(); refreshGlyphGrid() })

// Kern-specific
$previewInput.addEventListener('input', () => {
  KS.previewText = $previewInput.value
  el('preset-btns').querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'))
  buildPreview()
})

bindToggleGroup($btnViewGroup, v => {
  KS.viewMode = v as 'overlay' | 'sbs'
  buildPreview()
  buildKernGrid()
})

bindToggleGroup($btnFilterGroup, v => {
  KS.filter = v as FilterMode
  buildKernGrid()
})

bindToggleGroup($btnRangeGroup, v => {
  KS.range = v as RangeMode
  buildKernGrid()
})

// Modal close
$overlay.addEventListener('click', e => { if (e.target === $overlay) closeModal() })
el('modal-close').addEventListener('click', closeModal)
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal() })

// ════════════════════════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════════════════════════

buildPresets()
loadGlyphs()
loadKern()
