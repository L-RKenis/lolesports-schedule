import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/** Public client key used by lolesports.com (see unofficial API docs). */
const ESPORTS_API_KEY = '0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z'

const esportsProxy = {
  target: 'https://esports-api.lolesports.com/persisted/gw',
  changeOrigin: true,
  rewrite: (path: string) => path.replace(/^\/api\/esports/, ''),
  configure: (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    proxy: any,
  ) => {
    proxy.on('proxyReq', (proxyReq: { setHeader: (k: string, v: string) => void }) => {
      proxyReq.setHeader('x-api-key', ESPORTS_API_KEY)
    })
  },
}

const livestatsProxy = {
  target: 'https://feed.lolesports.com/livestats/v1',
  changeOrigin: true,
  rewrite: (path: string) => path.replace(/^\/api\/livestats/, ''),
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/esports': esportsProxy,
      '/api/livestats': livestatsProxy,
    },
  },
  preview: {
    proxy: {
      '/api/esports': esportsProxy,
      '/api/livestats': livestatsProxy,
    },
  },
})
