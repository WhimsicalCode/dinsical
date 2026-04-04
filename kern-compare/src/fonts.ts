import { parse as parseFont } from 'opentype.js'
import type { Font } from 'opentype.js'

export type { Font }
export type FontPair = { dinsy: Font; dinNext: Font }

export type WeightKey = 'Light' | 'Regular' | 'Medium' | 'Bold' | 'Heavy' | 'Black'
type StyleKey = 'upright' | 'italic'
type CacheKey = `${WeightKey}-${StyleKey}`

const PATHS: Record<CacheKey, { dinsy: string; dinNext: string }> = {
  'Light-upright':   { dinsy: '/fonts/ttf/Dinsy-Light.ttf',          dinNext: '/din-next/otf/DIN-Next-Light.otf'        },
  'Light-italic':    { dinsy: '/fonts/ttf/Dinsy-LightItalic.ttf',    dinNext: '/din-next/otf/DIN-Next-LightItalic.otf'  },
  'Regular-upright': { dinsy: '/fonts/ttf/Dinsy-Regular.ttf',        dinNext: '/din-next/otf/DIN-Next-Regular.otf'      },
  'Regular-italic':  { dinsy: '/fonts/ttf/Dinsy-Italic.ttf',         dinNext: '/din-next/otf/DIN-Next-Italic.otf'       },
  'Medium-upright':  { dinsy: '/fonts/ttf/Dinsy-Medium.ttf',         dinNext: '/din-next/otf/DIN-Next-Medium.otf'       },
  'Medium-italic':   { dinsy: '/fonts/ttf/Dinsy-MediumItalic.ttf',   dinNext: '/din-next/otf/DIN-Next-MediumItalic.otf' },
  'Bold-upright':    { dinsy: '/fonts/ttf/Dinsy-Bold.ttf',           dinNext: '/din-next/otf/DIN-Next-Bold.otf'         },
  'Bold-italic':     { dinsy: '/fonts/ttf/Dinsy-BoldItalic.ttf',     dinNext: '/din-next/otf/DIN-Next-BoldItalic.otf'   },
  'Heavy-upright':   { dinsy: '/fonts/ttf/Dinsy-Heavy.ttf',          dinNext: '/din-next/otf/DIN-Next-Heavy.otf'        },
  'Heavy-italic':    { dinsy: '/fonts/ttf/Dinsy-HeavyItalic.ttf',    dinNext: '/din-next/otf/DIN-Next-HeavyItalic.otf'  },
  'Black-upright':   { dinsy: '/fonts/ttf/Dinsy-Black.ttf',          dinNext: '/din-next/otf/DIN-Next-Black.otf'        },
  'Black-italic':    { dinsy: '/fonts/ttf/Dinsy-BlackItalic.ttf',    dinNext: '/din-next/otf/DIN-Next-BlackItalic.otf'  },
}

const cache = new Map<CacheKey, FontPair>()

async function load(url: string): Promise<Font> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`)
  return parseFont(await res.arrayBuffer())
}

export async function loadFonts(weight: WeightKey, italic: boolean): Promise<FontPair> {
  const key: CacheKey = `${weight}-${italic ? 'italic' : 'upright'}`
  if (cache.has(key)) return cache.get(key)!
  const p = PATHS[key]
  const [dinsy, dinNext] = await Promise.all([load(p.dinsy), load(p.dinNext)])
  const pair: FontPair = { dinsy, dinNext }
  cache.set(key, pair)
  return pair
}
