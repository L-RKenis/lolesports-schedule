/**
 * Vercel Serverless Function API Handler
 * Handles requests to /api/esports/* and /api/livestats/*
 */

const ESPORTS_API_KEY = '0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z'
const ESPORTS_TARGET = 'https://esports-api.lolesports.com/persisted/gw'
const LIVESTATS_TARGET = 'https://feed.lolesports.com/livestats/v1'

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT')
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version')

  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  // Extract the API path from req.url
  // req.url will be something like /api/esports/getLeagues?hl=en-US
  const url = req.url || ''
  const isEsportsRequest = url.startsWith('/api/esports')
  const isLivestatsRequest = url.startsWith('/api/livestats')

  if (!isEsportsRequest && !isLivestatsRequest) {
    return res.status(404).json({ error: 'Not Found' })
  }

  try {
    let targetUrl
    let headers = { 'Content-Type': 'application/json' }

    if (isEsportsRequest) {
      // Remove /api/esports prefix and build target URL
      const path = url.replace(/^\/api\/esports/, '')
      targetUrl = `${ESPORTS_TARGET}${path}`
      headers['x-api-key'] = ESPORTS_API_KEY
    } else {
      // Remove /api/livestats prefix and build target URL
      const path = url.replace(/^\/api\/livestats/, '')
      targetUrl = `${LIVESTATS_TARGET}${path}`
    }

    console.log(`[api-proxy] ${isEsportsRequest ? 'ESPORTS' : 'LIVESTATS'}`, {
      method: req.method,
      url,
      targetUrl,
    })

    const response = await fetch(targetUrl, {
      method: req.method || 'GET',
      headers,
    })

    const contentType = response.headers.get('content-type')
    const body = await response.text()

    res.status(response.status)
    if (contentType) res.setHeader('Content-Type', contentType)

    // If response body is empty, send empty response
    if (!body) {
      res.end()
    } else {
      res.send(body)
    }
  } catch (error) {
    console.error('[api-proxy] error', error)
    res.status(500).json({
      error: 'Failed to fetch from external API',
      message: error instanceof Error ? error.message : String(error),
    })
  }
}
