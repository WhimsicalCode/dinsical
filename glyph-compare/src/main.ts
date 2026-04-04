import './style.css'
import { loadFonts, type FontPair, type WeightKey } from './fonts'
import { renderCell, getGlyphInfo, computeModalFontSize, type RenderOpts } from './renderer'
import { SECTIONS } from './chars'

// ── State ──────────────────────────────────────────────────────────────────

interface AppState {
  pair:         FontPair | null
  weight:       WeightKey
  italic:       boolean
  fontSize:     number
  lineWidth:    number
  showDinsical:    boolean
  showDinNext: boolean
  showBaseline: boolean
}

const S: AppState = {
  pair:         null,
  weight:       'Regular',
  italic:       false,
  fontSize:     100,
  lineWidth:    1.2,
  showDinsical:    true,
  showDinNext: true,
  showBaseline: false,
}

// ── DOM refs ───────────────────────────────────────────────────────────────

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T
}

const $status      = el('status')
const $grid        = el('grid')
const $selWeight   = el<HTMLSelectElement>('sel-weight')
const $chkItalic   = el<HTMLInputElement>('chk-italic')
const $rngSize     = el<HTMLInputElement>('rng-size')
const $valSize     = el('val-size')
const $rngLw       = el<HTMLInputElement>('rng-lw')
const $valLw       = el('val-lw')
const $chkDinsical    = el<HTMLInputElement>('chk-dinsical')
const $chkDinNext = el<HTMLInputElement>('chk-din-next')
const $chkBaseline = el<HTMLInputElement>('chk-baseline')
const $overlay     = el('modal-overlay')
const $mChar       = el('modal-char')
const $mMeta       = el('modal-meta')
const $mCanvasWrap = el('modal-canvas-wrap')
const $mMetrics    = el('modal-metrics')

// ── Helpers ────────────────────────────────────────────────────────────────

function currentOpts(): RenderOpts {
  return {
    fontSize:     S.fontSize,
    showDinsical:    S.showDinsical,
    showDinNext: S.showDinNext,
    lineWidth:    S.lineWidth,
    showBaseline: S.showBaseline,
  }
}

function charLabel(char: string): string {
  const cp = char.codePointAt(0)!
  return (cp >= 0x20 && cp <= 0x7e) ? char : `U+${cp.toString(16).toUpperCase()}`
}

function cpHex(char: string): string {
  return `U+${char.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`
}

function syncFromControls(): void {
  S.weight       = $selWeight.value as WeightKey
  S.italic       = $chkItalic.checked
  S.fontSize     = Number($rngSize.value)
  S.lineWidth    = Number($rngLw.value) / 10
  S.showDinsical    = $chkDinsical.checked
  S.showDinNext = $chkDinNext.checked
  S.showBaseline = $chkBaseline.checked

  $valSize.textContent = `${S.fontSize}px`
  $valLw.textContent   = `${S.lineWidth.toFixed(1)}px`
}

// ── Grid ───────────────────────────────────────────────────────────────────

function buildGrid(pair: FontPair): void {
  $grid.innerHTML = ''
  const opts = currentOpts()

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
      cell.addEventListener('click', () => openModal(char))
      cells.appendChild(cell)
    }

    section.appendChild(cells)
    $grid.appendChild(section)
  }
}

/** Re-render all existing canvases without rebuilding the DOM. */
function refreshGrid(): void {
  const pair = S.pair
  if (!pair) return
  const opts = currentOpts()
  const canvases = Array.from($grid.querySelectorAll<HTMLCanvasElement>('canvas'))
  let i = 0
  for (const { chars } of SECTIONS) {
    for (const char of chars) {
      if (canvases[i]) renderCell(canvases[i], char, pair, opts)
      i++
    }
  }
}

// ── Font loading ───────────────────────────────────────────────────────────

async function loadAndBuild(): Promise<void> {
  $status.textContent = `Loading ${S.weight}${S.italic ? ' Italic' : ''}…`
  try {
    const pair = await loadFonts(S.weight, S.italic)
    S.pair = pair
    const d = pair.dinsical
    const c = pair.dinNext
    $status.textContent =
      `Dinsical — UPM ${d.unitsPerEm}  asc ${d.ascender}  desc ${d.descender}` +
      `   ·   ` +
      `DIN Next — UPM ${c.unitsPerEm}  asc ${c.ascender}  desc ${c.descender}`
    buildGrid(pair)
  } catch (err) {
    $status.textContent = `Error: ${(err as Error).message}`
  }
}

// ── Modal ──────────────────────────────────────────────────────────────────

function openModal(char: string): void {
  const pair = S.pair
  if (!pair) return

  const cp = char.codePointAt(0)!
  $mChar.textContent = (cp >= 0x20 && cp <= 0x7e) ? char : '?'
  $mMeta.textContent = cpHex(char)

  // Show modal first so the canvas-wrap has a layout size, then measure and render.
  $mCanvasWrap.innerHTML = ''
  $overlay.classList.remove('hidden')

  requestAnimationFrame(() => {
    const rect = $mCanvasWrap.getBoundingClientRect()
    const availW = rect.width  - 24  // subtract canvas-wrap's 12px left+right padding
    const availH = rect.height - 24  // subtract canvas-wrap's 12px top+bottom padding
    const bigSize = computeModalFontSize(char, pair!, availW, availH)
    const canvas = document.createElement('canvas')
    renderCell(canvas, char, pair!, currentOpts(), bigSize)
    $mCanvasWrap.appendChild(canvas)
  })

  // Metrics
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

function closeModal(): void {
  $overlay.classList.add('hidden')
}

// ── Events ─────────────────────────────────────────────────────────────────

// Font changes → reload + rebuild DOM
$selWeight.addEventListener('change', () => { syncFromControls(); loadAndBuild() })
$chkItalic.addEventListener('change', () => { syncFromControls(); loadAndBuild() })

// Render-only changes → just re-draw canvases
const onRenderChange = () => { syncFromControls(); refreshGrid() }
$rngSize.addEventListener('input', onRenderChange)
$rngLw.addEventListener('input', onRenderChange)
$chkDinsical.addEventListener('change', onRenderChange)
$chkDinNext.addEventListener('change', onRenderChange)
$chkBaseline.addEventListener('change', onRenderChange)

// Modal close
$overlay.addEventListener('click', e => { if (e.target === $overlay) closeModal() })
el('modal-close').addEventListener('click', closeModal)
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal() })

// ── Init ───────────────────────────────────────────────────────────────────

loadAndBuild()
