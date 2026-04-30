/**
 * API configuration for dynamic base URLs
 * Uses environment variables to support dev and production environments
 * 
 * On localhost: uses http://localhost:3001 (or configured via VITE_API_URL)
 * On Vercel: uses relative paths /api (Vercel's serverless functions handle it)
 */

// If VITE_API_URL is explicitly set, use it
// Otherwise: production uses relative /api paths, dev uses localhost:3001
export const API_BASE_URL = 
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? '' : 'http://localhost:3001')

console.log('[api-config]', {
  VITE_API_URL: import.meta.env.VITE_API_URL,
  isProduction: import.meta.env.PROD,
  API_BASE_URL,
})

