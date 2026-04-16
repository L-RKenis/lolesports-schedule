export interface MediaLinkItem {
  url: string
  provider: string
  label: string
}

export function buildOfficialWatchUrl(provider: string, parameter: string): string | null {
  const param = parameter?.trim()
  if (!param) return null
  const p = provider.toLowerCase()
  if (p === 'youtube') {
    return `https://www.youtube.com/watch?v=${encodeURIComponent(param)}`
  }
  if (p === 'twitch') {
    if (/^\d+$/.test(param)) return `https://www.twitch.tv/videos/${param}`
    return `https://www.twitch.tv/${encodeURIComponent(param)}`
  }
  if (p === 'afreecatv') {
    return `https://play.afreecatv.com/${encodeURIComponent(param)}`
  }
  return null
}

export function providerDisplayName(provider: string): string {
  const p = provider.toLowerCase()
  if (p === 'youtube') return 'YouTube'
  if (p === 'twitch') return 'Twitch'
  if (p === 'afreecatv') return 'AfreecaTV'
  return provider ? provider.charAt(0).toUpperCase() + provider.slice(1) : 'Watch'
}

export function providerIconUrl(provider: string): string {
  const p = provider.toLowerCase()
  if (p === 'youtube') return 'https://cdn.simpleicons.org/youtube/FF0000'
  if (p === 'twitch') return 'https://cdn.simpleicons.org/twitch/9146FF'
  if (p === 'afreecatv') return 'https://cdn.simpleicons.org/afreecatv/254FE5'
  return 'https://cdn.simpleicons.org/link/FFFFFF'
}

function localeRank(locale: string): number {
  const l = (locale ?? '').toLowerCase()
  if (l.startsWith('en-us')) return 0
  if (l.startsWith('en-')) return 1
  return 2
}

export function liveStreamLinks(
  streams: Array<{ provider: string; parameter: string; locale?: string }>,
): MediaLinkItem[] {
  const rows: Array<{ provider: string; locale: string; url: string }> = []
  for (const s of streams) {
    const url = buildOfficialWatchUrl(s.provider, s.parameter)
    if (!url) continue
    rows.push({ provider: s.provider, locale: s.locale ?? '', url })
  }
  rows.sort((a, b) => localeRank(a.locale) - localeRank(b.locale))
  const seen = new Set<string>()
  const out: MediaLinkItem[] = []
  for (const r of rows) {
    if (seen.has(r.url)) continue
    seen.add(r.url)
    out.push({
      url: r.url,
      provider: r.provider,
      label: providerDisplayName(r.provider),
    })
  }
  return out
}

export function archiveLinksFromGames(
  games: Array<{
    state: string
    vods?: Array<{ provider?: string; parameter?: string; locale?: string }>
  }>,
): MediaLinkItem[] {
  const rows: Array<{ provider: string; locale: string; url: string }> = []
  for (const g of games) {
    if (g.state !== 'completed') continue
    for (const v of g.vods ?? []) {
      const prov = v.provider ?? ''
      const param = v.parameter ?? ''
      const url = buildOfficialWatchUrl(prov, param)
      if (!url) continue
      rows.push({ provider: prov, locale: v.locale ?? '', url })
    }
  }
  rows.sort((a, b) => localeRank(a.locale) - localeRank(b.locale))
  const seen = new Set<string>()
  const out: MediaLinkItem[] = []
  for (const r of rows) {
    if (seen.has(r.url)) continue
    seen.add(r.url)
    out.push({
      url: r.url,
      provider: r.provider,
      label: providerDisplayName(r.provider),
    })
  }
  return out
}
