import { defineConfig } from 'vite'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { existsSync, readFileSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(__dirname, '..')

const MIME: Record<string, string> = {
  ttf: 'font/ttf',
  otf: 'font/otf',
  woff: 'font/woff',
  woff2: 'font/woff2',
}

export default defineConfig({
  plugins: [
    {
      name: 'project-fonts',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const url = (req.url ?? '').split('?')[0]
          if (!url.startsWith('/fonts/') && !url.startsWith('/din-next/')) return next()
          const filePath = resolve(PROJECT_ROOT, url.slice(1))
          if (!existsSync(filePath)) return next()
          const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
          res.setHeader('Content-Type', MIME[ext] ?? 'application/octet-stream')
          res.setHeader('Cache-Control', 'max-age=3600')
          res.end(readFileSync(filePath))
        })
      },
    },
  ],
})
