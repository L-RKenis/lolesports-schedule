import express from 'express'
import cors from 'cors'

const app = express()
const PORT = process.env.PORT || 3001

// ESPORTS API configuration
const ESPORTS_API_KEY = '0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z'
const ESPORTS_TARGET = 'https://esports-api.lolesports.com/persisted/gw'
const LIVESTATS_TARGET = 'https://feed.lolesports.com/livestats/v1'

// CORS configuration
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests from any localhost port in development
    if (!origin || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
      callback(null, true)
    } else if (process.env.NODE_ENV === 'production') {
      // In production, only allow specific origins
      const allowedOrigins = [process.env.FRONTEND_URL].filter(Boolean)
      if (allowedOrigins.includes(origin)) {
        callback(null, true)
      } else {
        callback(new Error('Not allowed by CORS'))
      }
    } else {
      callback(null, true) // Allow all in dev
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
}

app.use(cors(corsOptions))

/**
 * Proxy for esports-api.lolesports.com
 * Removes /api/esports prefix and adds x-api-key header
 */
app.get('/api/esports/*', async (req, res) => {
  try {
    // Extract the path after /api/esports
    const path = req.path.replace(/^\/api\/esports/, '')
    const queryString = new URLSearchParams(req.query).toString()
    const url = `${ESPORTS_TARGET}${path}${queryString ? '?' + queryString : ''}`

    console.log('[esports-proxy]', { method: req.method, path, url })

    const response = await fetch(url, {
      method: req.method,
      headers: {
        'x-api-key': ESPORTS_API_KEY,
        'Content-Type': 'application/json',
      },
    })

    const contentType = response.headers.get('content-type')
    const body = await response.text()

    res.status(response.status)
    if (contentType) res.set('Content-Type', contentType)
    res.send(body)
  } catch (error) {
    console.error('[esports-proxy] error', error)
    res.status(500).json({
      error: 'Failed to fetch from esports API',
      message: error instanceof Error ? error.message : String(error),
    })
  }
})

/**
 * Proxy for feed.lolesports.com/livestats
 * Removes /api/livestats prefix
 */
app.get('/api/livestats/*', async (req, res) => {
  try {
    // Extract the path after /api/livestats
    const path = req.path.replace(/^\/api\/livestats/, '')
    const queryString = new URLSearchParams(req.query).toString()
    const url = `${LIVESTATS_TARGET}${path}${queryString ? '?' + queryString : ''}`

    console.log('[livestats-proxy]', { method: req.method, path, url })

    const response = await fetch(url, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
      },
    })

    const contentType = response.headers.get('content-type')
    const body = await response.text()

    res.status(response.status)
    if (contentType) res.set('Content-Type', contentType)
    res.send(body)
  } catch (error) {
    console.error('[livestats-proxy] error', error)
    res.status(500).json({
      error: 'Failed to fetch from livestats API',
      message: error instanceof Error ? error.message : String(error),
    })
  }
})

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' })
})

app.listen(PORT, () => {
  console.log(`🚀 Proxy server running on http://localhost:${PORT}`)
  console.log(`   esports-api: ${ESPORTS_TARGET}`)
  console.log(`   livestats: ${LIVESTATS_TARGET}`)
})
