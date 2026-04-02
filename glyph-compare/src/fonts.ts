import { parse as parseFont } from 'opentype.js'
import type { Font } from 'opentype.js'

export type { Font }
export type FontPair = { dinsy: Font; dinsical: Font }

export type WeightKey = 'Light' | 'Regular' | 'Medium' | 'Bold' | 'Heavy' | 'Black'
type StyleKey = 'upright' | 'italic'
type CacheKey = `${WeightKey}-${StyleKey}`

const PATHS: Record<CacheKey, { dinsy: string; dinsical: string }> = {
  'Light-upright':   { dinsy: '/fonts/ttf/Dinsy-Light.ttf',          dinsical: '/dinsical/otf/DINsical-Light.otf'        },
  'Light-italic':    { dinsy: '/fonts/ttf/Dinsy-LightItalic.ttf',    dinsical: '/dinsical/otf/DINsical-LightItalic.otf'  },
  'Regular-upright': { dinsy: '/fonts/ttf/Dinsy-Regular.ttf',        dinsical: '/dinsical/otf/DINsical-Regular.otf'      },
  'Regular-italic':  { dinsy: '/fonts/ttf/Dinsy-Italic.ttf',         dinsical: '/dinsical/otf/DINsical-Italic.otf'       },
  'Medium-upright':  { dinsy: '/fonts/ttf/Dinsy-Medium.ttf',         dinsical: '/dinsical/otf/DINsical-Medium.otf'       },
  'Medium-italic':   { dinsy: '/fonts/ttf/Dinsy-MediumItalic.ttf',   dinsical: '/dinsical/otf/DINsical-MediumItalic.otf' },
  'Bold-upright':    { dinsy: '/fonts/ttf/Dinsy-Bold.ttf',           dinsical: '/dinsical/otf/DINsical-Bold.otf'         },
  'Bold-italic':     { dinsy: '/fonts/ttf/Dinsy-BoldItalic.ttf',     dinsical: '/dinsical/otf/DINsical-BoldItalic.otf'   },
  'Heavy-upright':   { dinsy: '/fonts/ttf/Dinsy-Heavy.ttf',          dinsical: '/dinsical/otf/DINsical-Heavy.otf'        },
  'Heavy-italic':    { dinsy: '/fonts/ttf/Dinsy-HeavyItalic.ttf',    dinsical: '/dinsical/otf/DINsical-HeavyItalic.otf'  },
  'Black-upright':   { dinsy: '/fonts/ttf/Dinsy-Black.ttf',          dinsical: '/dinsical/otf/DINsical-Black.otf'        },
  'Black-italic':    { dinsy: '/fonts/ttf/Dinsy-BlackItalic.ttf',    dinsical: '/dinsical/otf/DINsical-BlackItalic.otf'  },
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
  const [dinsy, dinsical] = await Promise.all([load(p.dinsy), load(p.dinsical)])
  const pair: FontPair = { dinsy, dinsical }
  cache.set(key, pair)
  return pair
}
