import type { Font, Glyph, Path } from 'opentype.js'
import type { FontPair } from './fonts'

export interface RenderOpts {
  fontSize:     number
  showDinsical:    boolean
  showDinNext: boolean
  lineWidth:    number
  showBaseline: boolean
}

export interface GlyphInfo {
  name:         string
  advanceWidth: number
  index:        number
}

const PAD = 10
const DINSICAL_STROKE    = '#dc2626'
const DIN_NEXT_STROKE = '#2563eb'

// ── Metrics ───────────────────────────────────────────────────────────────

function fontScale(font: Font, fontSize: number): number {
  return fontSize / font.unitsPerEm
}

export function cellDims(pair: FontPair, fontSize: number): { cellH: number; baseline: number } {
  const s = (f: Font) => fontScale(f, fontSize)
  const asc  = Math.max(pair.dinsical.ascender   * s(pair.dinsical),  pair.dinNext.ascender   * s(pair.dinNext))
  const desc = Math.max(-pair.dinsical.descender * s(pair.dinsical), -pair.dinNext.descender  * s(pair.dinNext))
  return {
    cellH:    Math.ceil(asc + desc) + PAD * 2,
    baseline: Math.ceil(asc) + PAD,
  }
}

function advancePx(glyph: Glyph, font: Font, fontSize: number): number {
  return (glyph.advanceWidth ?? 0) * fontScale(font, fontSize)
}

// ── Path tracing ──────────────────────────────────────────────────────────

/**
 * Trace path commands onto ctx WITHOUT filling.
 * path.draw(ctx) fills in black by default (it checks path.fill internally),
 * so we iterate commands manually to get a clean stroke-only path.
 */
function tracePath(ctx: CanvasRenderingContext2D, path: Path): void {
  ctx.beginPath()
  for (const cmd of path.commands) {
    if (cmd.type === 'M') {
      ctx.moveTo(cmd.x, cmd.y)
    } else if (cmd.type === 'L') {
      ctx.lineTo(cmd.x, cmd.y)
    } else if (cmd.type === 'C') {
      ctx.bezierCurveTo(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y)
    } else if (cmd.type === 'Q') {
      ctx.quadraticCurveTo(cmd.x1, cmd.y1, cmd.x, cmd.y)
    } else if (cmd.type === 'Z') {
      ctx.closePath()
    }
  }
}

// ── Render ────────────────────────────────────────────────────────────────

export function renderCell(
  canvas: HTMLCanvasElement,
  char: string,
  pair: FontPair,
  opts: RenderOpts,
  overrideFontSize?: number,
): void {
  const dpr      = window.devicePixelRatio || 1
  const fontSize = overrideFontSize ?? opts.fontSize
  const { cellH, baseline } = cellDims(pair, fontSize)

  const gDinsical    = pair.dinsical.charToGlyph(char)
  const gDinNext = pair.dinNext.charToGlyph(char)
  const aw1 = advancePx(gDinsical,    pair.dinsical,    fontSize)
  const aw2 = advancePx(gDinNext, pair.dinNext, fontSize)
  const cellW = Math.max(aw1, aw2, fontSize * 0.3) + PAD * 2

  canvas.width        = Math.round(cellW * dpr)
  canvas.height       = Math.round(cellH * dpr)
  canvas.style.width  = `${Math.ceil(cellW)}px`
  canvas.style.height = `${cellH}px`

  const ctx = canvas.getContext('2d')!
  ctx.scale(dpr, dpr)

  if (opts.showBaseline) {
    ctx.save()
    ctx.strokeStyle = 'rgba(0,0,0,0.15)'
    ctx.lineWidth = 0.75
    ctx.setLineDash([3, 4])
    ctx.beginPath()
    ctx.moveTo(0, baseline)
    ctx.lineTo(cellW, baseline)
    ctx.stroke()
    ctx.restore()
  }

  // DIN Next first (blue), Dinsical on top (red)
  if (opts.showDinNext && gDinNext.index > 0) {
    paint(ctx, gDinNext, pair.dinNext, (cellW - aw2) / 2, baseline, fontSize, DIN_NEXT_STROKE, opts)
  }
  if (opts.showDinsical && gDinsical.index > 0) {
    paint(ctx, gDinsical, pair.dinsical, (cellW - aw1) / 2, baseline, fontSize, DINSICAL_STROKE, opts)
  }
}

function paint(
  ctx:      CanvasRenderingContext2D,
  glyph:    Glyph,
  font:     Font,
  x:        number,
  y:        number,
  fontSize: number,
  stroke:   string,
  opts:     RenderOpts,
): void {
  const path = glyph.getPath(x, y, fontSize)
  ctx.save()
  tracePath(ctx, path)
  ctx.strokeStyle = stroke
  ctx.lineWidth   = opts.lineWidth
  ctx.lineJoin    = 'round'
  ctx.stroke()
  ctx.restore()
}

// ── Modal font size ─────────────────────────────────────────────────────────

/**
 * Compute the largest fontSize where the glyph cell fits within (availW × availH).
 * Both dimensions scale linearly with fontSize, so we solve each constraint and take the min.
 */
export function computeModalFontSize(char: string, pair: FontPair, availW: number, availH: number): number {
  const s1 = 1 / pair.dinsical.unitsPerEm
  const s2 = 1 / pair.dinNext.unitsPerEm

  const ascR  = Math.max(pair.dinsical.ascender    * s1, pair.dinNext.ascender    * s2)
  const descR = Math.max(-pair.dinsical.descender  * s1, -pair.dinNext.descender  * s2)

  const g1 = pair.dinsical.charToGlyph(char)
  const g2 = pair.dinNext.charToGlyph(char)
  const awR = Math.max(
    (g1.advanceWidth ?? 0) * s1,
    (g2.advanceWidth ?? 0) * s2,
    0.3,
  )

  // cellH = (ascR + descR) * fs + 2*PAD  →  fs = (availH - 2*PAD) / (ascR + descR)
  // cellW =  awR            * fs + 2*PAD  →  fs = (availW - 2*PAD) /  awR
  const fsH = (availH - 2 * PAD) / (ascR + descR)
  const fsW = (availW - 2 * PAD) / awR

  return Math.max(20, Math.floor(Math.min(fsH, fsW)))
}

// ── Info ──────────────────────────────────────────────────────────────────

export function getGlyphInfo(char: string, font: Font): GlyphInfo {
  const g = font.charToGlyph(char)
  return { name: g.name ?? '.notdef', advanceWidth: g.advanceWidth ?? 0, index: g.index }
}
