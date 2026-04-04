import type { Font, Path } from 'opentype.js'
import type { FontPair } from './fonts'

export interface RenderOpts {
  fontSize:     number
  lineWidth:    number
  showBaseline: boolean
}

const PAD = 8
export const DINSICAL_COLOR    = '#dc2626'
export const DIN_NEXT_COLOR = '#2563eb'

// ── Low-level helpers ──────────────────────────────────────────────────────

function scale(font: Font, fontSize: number): number {
  return fontSize / font.unitsPerEm
}

function tracePath(ctx: CanvasRenderingContext2D, path: Path): void {
  ctx.beginPath()
  for (const cmd of path.commands) {
    if      (cmd.type === 'M') ctx.moveTo(cmd.x, cmd.y)
    else if (cmd.type === 'L') ctx.lineTo(cmd.x, cmd.y)
    else if (cmd.type === 'C') ctx.bezierCurveTo(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y)
    else if (cmd.type === 'Q') ctx.quadraticCurveTo(cmd.x1, cmd.y1, cmd.x, cmd.y)
    else if (cmd.type === 'Z') ctx.closePath()
  }
}

function setupCanvas(
  canvas: HTMLCanvasElement,
  w: number,
  h: number,
): CanvasRenderingContext2D {
  const dpr = window.devicePixelRatio || 1
  canvas.width        = Math.round(w * dpr)
  canvas.height       = Math.round(h * dpr)
  canvas.style.width  = `${Math.ceil(w)}px`
  canvas.style.height = `${Math.ceil(h)}px`
  const ctx = canvas.getContext('2d')!
  ctx.scale(dpr, dpr)
  return ctx
}

function drawBaseline(ctx: CanvasRenderingContext2D, w: number, baseline: number): void {
  ctx.save()
  ctx.strokeStyle = 'rgba(0,0,0,0.15)'
  ctx.lineWidth   = 0.75
  ctx.setLineDash([3, 4])
  ctx.beginPath()
  ctx.moveTo(0, baseline)
  ctx.lineTo(w, baseline)
  ctx.stroke()
  ctx.restore()
}

/** Stroke a text string character-by-character (avoids GSUB substitution throws). */
function strokeText(
  ctx:      CanvasRenderingContext2D,
  font:     Font,
  text:     string,
  x:        number,
  baseline: number,
  fontSize: number,
  color:    string,
  lw:       number,
): void {
  const sc     = scale(font, fontSize)
  const chars  = [...text]
  const glyphs = chars.map(c => font.charToGlyph(c))
  let cx = x

  ctx.save()
  ctx.beginPath()
  for (let i = 0; i < glyphs.length; i++) {
    const g    = glyphs[i]
    const path = g.getPath(cx, baseline, fontSize)
    for (const cmd of path.commands) {
      if      (cmd.type === 'M') ctx.moveTo(cmd.x, cmd.y)
      else if (cmd.type === 'L') ctx.lineTo(cmd.x, cmd.y)
      else if (cmd.type === 'C') ctx.bezierCurveTo(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y)
      else if (cmd.type === 'Q') ctx.quadraticCurveTo(cmd.x1, cmd.y1, cmd.x, cmd.y)
      else if (cmd.type === 'Z') ctx.closePath()
    }
    cx += ((g.advanceWidth ?? 0) + (i < glyphs.length - 1 ? font.getKerningValue(g, glyphs[i + 1]) : 0)) * sc
  }
  ctx.strokeStyle = color
  ctx.lineWidth   = lw
  ctx.lineJoin    = 'round'
  ctx.stroke()
  ctx.restore()
}

// ── Metric helpers ─────────────────────────────────────────────────────────

function cellHeightFromPair(pair: FontPair, fontSize: number): { cellH: number; baseline: number } {
  const s1 = scale(pair.dinsical,    fontSize)
  const s2 = scale(pair.dinNext, fontSize)
  const asc  = Math.max(pair.dinsical.ascender   * s1, pair.dinNext.ascender   * s2)
  const desc = Math.max(-pair.dinsical.descender * s1, -pair.dinNext.descender * s2)
  return { cellH: Math.ceil(asc + desc) + PAD * 2, baseline: Math.ceil(asc) + PAD }
}

export function pairAdvancePx(font: Font, leftCP: number, rightCP: number, fontSize: number): number {
  const sc = scale(font, fontSize)
  const g1 = font.charToGlyph(String.fromCodePoint(leftCP))
  const g2 = font.charToGlyph(String.fromCodePoint(rightCP))
  return ((g1.advanceWidth ?? 0) + font.getKerningValue(g1, g2) + (g2.advanceWidth ?? 0)) * sc
}

export function stringAdvancePx(font: Font, text: string, fontSize: number): number {
  const sc     = scale(font, fontSize)
  const chars  = [...text]
  const glyphs = chars.map(c => font.charToGlyph(c))
  let x = 0
  for (let i = 0; i < glyphs.length; i++) {
    x += (glyphs[i].advanceWidth ?? 0) * sc
    if (i < glyphs.length - 1)
      x += font.getKerningValue(glyphs[i], glyphs[i + 1]) * sc
  }
  return x
}

// ── String preview ─────────────────────────────────────────────────────────

/** Render a single font's string onto a canvas (for side-by-side stacked layout). */
export function renderStringOnCanvas(
  canvas:   HTMLCanvasElement,
  text:     string,
  font:     Font,
  color:    string,
  opts:     RenderOpts,
  minWidth: number,
): void {
  const { cellH, baseline } = cellHeightFromPair({ dinsical: font, dinNext: font }, opts.fontSize)
  const w = Math.max(minWidth, stringAdvancePx(font, text, opts.fontSize) + PAD * 2)
  const ctx = setupCanvas(canvas, w, cellH)
  if (opts.showBaseline) drawBaseline(ctx, w, baseline)
  strokeText(ctx, font, text, PAD, baseline, opts.fontSize, color, opts.lineWidth)
}

/** Overlay both fonts' strings onto one canvas. */
export function renderStringOverlay(
  canvas: HTMLCanvasElement,
  text:   string,
  pair:   FontPair,
  opts:   RenderOpts,
): void {
  const { cellH, baseline } = cellHeightFromPair(pair, opts.fontSize)
  const w = Math.max(
    stringAdvancePx(pair.dinsical,    text, opts.fontSize),
    stringAdvancePx(pair.dinNext, text, opts.fontSize),
  ) + PAD * 2

  const ctx = setupCanvas(canvas, w, cellH)
  if (opts.showBaseline) drawBaseline(ctx, w, baseline)
  strokeText(ctx, pair.dinNext, text, PAD, baseline, opts.fontSize, DIN_NEXT_COLOR, opts.lineWidth)
  strokeText(ctx, pair.dinsical,    text, PAD, baseline, opts.fontSize, DINSICAL_COLOR,    opts.lineWidth)
}

// ── Pair cells ─────────────────────────────────────────────────────────────

/** Render a single font's pair bigram onto a canvas. Returns the canvas pixel width. */
export function renderPairOnCanvas(
  canvas:  HTMLCanvasElement,
  leftCP:  number,
  rightCP: number,
  font:    Font,
  color:   string,
  opts:    RenderOpts,
  fixedW?: number,   // if set, use this width instead of computing from advance
): number {
  const { cellH, baseline } = cellHeightFromPair({ dinsical: font, dinNext: font }, opts.fontSize)
  const adv = pairAdvancePx(font, leftCP, rightCP, opts.fontSize)
  const w   = fixedW ?? (Math.max(adv, opts.fontSize * 0.4) + PAD * 2)
  const ctx = setupCanvas(canvas, w, cellH)
  if (opts.showBaseline) drawBaseline(ctx, w, baseline)
  const x = (w - adv) / 2
  const text = String.fromCodePoint(leftCP) + String.fromCodePoint(rightCP)
  strokeText(ctx, font, text, x, baseline, opts.fontSize, color, opts.lineWidth)
  return w
}

/** Overlay both fonts' pair bigrams onto one canvas. */
export function renderPairOverlay(
  canvas:  HTMLCanvasElement,
  leftCP:  number,
  rightCP: number,
  pair:    FontPair,
  opts:    RenderOpts,
): void {
  const { cellH, baseline } = cellHeightFromPair(pair, opts.fontSize)
  const adv1 = pairAdvancePx(pair.dinsical,    leftCP, rightCP, opts.fontSize)
  const adv2 = pairAdvancePx(pair.dinNext, leftCP, rightCP, opts.fontSize)
  const adv  = Math.max(adv1, adv2)
  const w    = Math.max(adv, opts.fontSize * 0.4) + PAD * 2
  const ctx  = setupCanvas(canvas, w, cellH)

  if (opts.showBaseline) drawBaseline(ctx, w, baseline)

  const text = String.fromCodePoint(leftCP) + String.fromCodePoint(rightCP)
  // DIN Next underneath, Dinsical on top
  strokeText(ctx, pair.dinNext, text, (w - adv2) / 2, baseline, opts.fontSize, DIN_NEXT_COLOR, opts.lineWidth)
  strokeText(ctx, pair.dinsical,    text, (w - adv1) / 2, baseline, opts.fontSize, DINSICAL_COLOR,    opts.lineWidth)
}

/** Render pair context ("n" + pair + "o") for the modal. */
export function renderPairContext(
  canvas:   HTMLCanvasElement,
  leftCP:   number,
  rightCP:  number,
  pair:     FontPair,
  opts:     RenderOpts,
): void {
  const prefix = 'n'
  const suffix = 'o'
  const inner  = String.fromCodePoint(leftCP) + String.fromCodePoint(rightCP)
  const full   = prefix + inner + suffix

  const { cellH, baseline } = cellHeightFromPair(pair, opts.fontSize)
  const w = Math.max(
    stringAdvancePx(pair.dinsical,    full, opts.fontSize),
    stringAdvancePx(pair.dinNext, full, opts.fontSize),
  ) + PAD * 2

  const ctx = setupCanvas(canvas, w, cellH)
  if (opts.showBaseline) drawBaseline(ctx, w, baseline)
  strokeText(ctx, pair.dinNext, full, PAD, baseline, opts.fontSize, DIN_NEXT_COLOR, opts.lineWidth)
  strokeText(ctx, pair.dinsical,    full, PAD, baseline, opts.fontSize, DINSICAL_COLOR,    opts.lineWidth)
}
