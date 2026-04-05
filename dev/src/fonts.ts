import { parse as parseFont } from 'opentype.js'
import type { Font } from 'opentype.js'

export type { Font }
export type FontPair = { dinsical: Font; dinNext: Font }

export type WeightKey = 'Light' | 'Regular' | 'Medium' | 'Bold' | 'Heavy' | 'Black'
type StyleKey = 'upright' | 'italic'
type CacheKey = `${WeightKey}-${StyleKey}`

const PATHS: Record<CacheKey, { dinsical: string; dinNext: string }> = {
  'Light-upright':   { dinsical: '/fonts/ttf/Dinsical-Light.ttf',          dinNext: '/din-next/otf/DIN-Next-Light.otf'        },
  'Light-italic':    { dinsical: '/fonts/ttf/Dinsical-LightItalic.ttf',    dinNext: '/din-next/otf/DIN-Next-LightItalic.otf'  },
  'Regular-upright': { dinsical: '/fonts/ttf/Dinsical-Regular.ttf',        dinNext: '/din-next/otf/DIN-Next-Regular.otf'      },
  'Regular-italic':  { dinsical: '/fonts/ttf/Dinsical-Italic.ttf',         dinNext: '/din-next/otf/DIN-Next-Italic.otf'       },
  'Medium-upright':  { dinsical: '/fonts/ttf/Dinsical-Medium.ttf',         dinNext: '/din-next/otf/DIN-Next-Medium.otf'       },
  'Medium-italic':   { dinsical: '/fonts/ttf/Dinsical-MediumItalic.ttf',   dinNext: '/din-next/otf/DIN-Next-MediumItalic.otf' },
  'Bold-upright':    { dinsical: '/fonts/ttf/Dinsical-Bold.ttf',           dinNext: '/din-next/otf/DIN-Next-Bold.otf'         },
  'Bold-italic':     { dinsical: '/fonts/ttf/Dinsical-BoldItalic.ttf',     dinNext: '/din-next/otf/DIN-Next-BoldItalic.otf'   },
  'Heavy-upright':   { dinsical: '/fonts/ttf/Dinsical-Heavy.ttf',          dinNext: '/din-next/otf/DIN-Next-Heavy.otf'        },
  'Heavy-italic':    { dinsical: '/fonts/ttf/Dinsical-HeavyItalic.ttf',    dinNext: '/din-next/otf/DIN-Next-HeavyItalic.otf'  },
  'Black-upright':   { dinsical: '/fonts/ttf/Dinsical-Black.ttf',          dinNext: '/din-next/otf/DIN-Next-Black.otf'        },
  'Black-italic':    { dinsical: '/fonts/ttf/Dinsical-BlackItalic.ttf',    dinNext: '/din-next/otf/DIN-Next-BlackItalic.otf'  },
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
  const [dinsical, dinNext] = await Promise.all([load(p.dinsical), load(p.dinNext)])
  const pair: FontPair = { dinsical, dinNext }
  cache.set(key, pair)
  return pair
}
