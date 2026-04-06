import { parse as parseFont } from 'opentype.js'
import type { Font } from 'opentype.js'

export type { Font }
export type FontPair = { dinsical: Font; dinWhim: Font }

export type WeightKey = 'Light' | 'Regular' | 'Medium' | 'Bold' | 'Heavy' | 'Black'
type StyleKey = 'upright' | 'italic'
type CacheKey = `${WeightKey}-${StyleKey}`

const PATHS: Record<CacheKey, { dinsical: string; dinWhim: string }> = {
  'Light-upright':   { dinsical: '/fonts/ttf/Dinsical-Light.ttf',          dinWhim: '/din-whim/otf/DIN-Whim-Light.otf'        },
  'Light-italic':    { dinsical: '/fonts/ttf/Dinsical-LightItalic.ttf',    dinWhim: '/din-whim/otf/DIN-Whim-LightItalic.otf'  },
  'Regular-upright': { dinsical: '/fonts/ttf/Dinsical-Regular.ttf',        dinWhim: '/din-whim/otf/DIN-Whim-Regular.otf'      },
  'Regular-italic':  { dinsical: '/fonts/ttf/Dinsical-Italic.ttf',         dinWhim: '/din-whim/otf/DIN-Whim-Italic.otf'       },
  'Medium-upright':  { dinsical: '/fonts/ttf/Dinsical-Medium.ttf',         dinWhim: '/din-whim/otf/DIN-Whim-Medium.otf'       },
  'Medium-italic':   { dinsical: '/fonts/ttf/Dinsical-MediumItalic.ttf',   dinWhim: '/din-whim/otf/DIN-Whim-MediumItalic.otf' },
  'Bold-upright':    { dinsical: '/fonts/ttf/Dinsical-Bold.ttf',           dinWhim: '/din-whim/otf/DIN-Whim-Bold.otf'         },
  'Bold-italic':     { dinsical: '/fonts/ttf/Dinsical-BoldItalic.ttf',     dinWhim: '/din-whim/otf/DIN-Whim-BoldItalic.otf'   },
  'Heavy-upright':   { dinsical: '/fonts/ttf/Dinsical-Heavy.ttf',          dinWhim: '/din-whim/otf/DIN-Whim-Heavy.otf'        },
  'Heavy-italic':    { dinsical: '/fonts/ttf/Dinsical-HeavyItalic.ttf',    dinWhim: '/din-whim/otf/DIN-Whim-HeavyItalic.otf'  },
  'Black-upright':   { dinsical: '/fonts/ttf/Dinsical-Black.ttf',          dinWhim: '/din-whim/otf/DIN-Whim-Black.otf'        },
  'Black-italic':    { dinsical: '/fonts/ttf/Dinsical-BlackItalic.ttf',    dinWhim: '/din-whim/otf/DIN-Whim-BlackItalic.otf'  },
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
  const [dinsical, dinWhim] = await Promise.all([load(p.dinsical), load(p.dinWhim)])
  const pair: FontPair = { dinsical, dinWhim }
  cache.set(key, pair)
  return pair
}
