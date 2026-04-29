import type { League, ScheduleEvent, SchedulePages } from '../types'
import { API_BASE_URL } from './config'

const BASE = `${API_BASE_URL}/api/esports`

function toHttps(url: string): string {
  if (url.startsWith('http://')) return 'https://' + url.slice(7)
  return url
}

export function secureImageUrl(url: string): string {
  return toHttps(url)
}

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text()
  return JSON.parse(text) as T
}

export async function fetchLeagues(locale = 'en-US'): Promise<League[]> {
  const q = new URLSearchParams({ hl: locale })
  const endpoint = `${BASE}/getLeagues?${q}`
  const res = await fetch(endpoint)
  if (!res.ok) throw new Error(`getLeagues failed: ${res.status}`)
  const json = await parseJson<{ data?: { leagues?: League[] } }>(res)
  const list = json?.data?.leagues ?? []
  return list.map((l: League) => ({
    ...l,
    image: secureImageUrl(l.image),
  }))
}

export interface ScheduleResult {
  events: ScheduleEvent[]
  pages: SchedulePages
  updated?: string
}

export async function fetchSchedule(
  locale = 'en-US',
  pageToken?: string,
): Promise<ScheduleResult> {
  const q = new URLSearchParams({ hl: locale })
  if (pageToken) q.set('pageToken', pageToken)
  const endpoint = `${BASE}/getSchedule?${q}`
  const res = await fetch(endpoint)
  if (!res.ok) throw new Error(`getSchedule failed: ${res.status}`)
  const json = await parseJson<{ data?: { schedule?: ScheduleResult } }>(res)
  const sch = json?.data?.schedule
  const raw: ScheduleEvent[] = sch?.events ?? []
  const events = raw.map((e) => ({
    ...e,
    match: e.match
      ? {
          ...e.match,
          teams: e.match.teams.map((t) => ({
            ...t,
            image: secureImageUrl(t.image),
          })),
        }
      : undefined,
  }))
  return {
    events,
    pages: sch?.pages ?? {},
    updated: sch?.updated,
  }
}

export interface EventMatchGame {
  id: string
  number: number
  state: string
  teams: { id: string; side: 'blue' | 'red' }[]
  vods?: Array<{
    parameter?: string
    provider?: string
    locale?: string
    firstFrameTime?: string
    startMillis?: number | null
    endMillis?: number | null
  }>
}

export interface EventStream {
  parameter: string
  provider: string
  locale?: string
}

export interface MatchEventDetails {
  id: string
  league: { name: string; slug: string; image?: string }
  streams: EventStream[]
  match: {
    strategy?: { count: number; type?: string }
    teams: Array<{
      id: string
      name: string
      code: string
      image: string
      result?: { gameWins?: number }
    }>
    games: EventMatchGame[]
  }
}

export async function fetchMatchEventDetails(
  matchId: string,
  locale = 'en-US',
): Promise<MatchEventDetails> {
  const q = new URLSearchParams({ hl: locale, id: matchId })
  const endpoint = `${BASE}/getEventDetails?${q}`
  const res = await fetch(endpoint)
  if (!res.ok) throw new Error(`getEventDetails failed: ${res.status}`)
  const json = await parseJson<{ data?: { event?: MatchEventDetails } }>(res)
  const ev = json?.data?.event
  if (!ev?.match) throw new Error('Match not found')
  const league = ev.league ?? {}
  const rawGames = ev.match.games ?? []
  const games: EventMatchGame[] = rawGames.map(
    (g: {
      id?: string | number
      number?: number
      state?: string
      teams?: EventMatchGame['teams']
      vods?: EventMatchGame['vods']
    }) => ({
      id: String(g.id ?? ''),
      number: g.number ?? 0,
      state: g.state ?? '',
      teams: g.teams ?? [],
      vods: (g.vods ?? []).map((v) => ({
        parameter: v.parameter,
        provider: v.provider,
        locale: v.locale,
        firstFrameTime: v.firstFrameTime,
        startMillis: v.startMillis ?? undefined,
        endMillis: v.endMillis ?? undefined,
      })),
    }),
  )

  const rawStreams = (ev as { streams?: EventStream[] }).streams ?? []
  const streams: EventStream[] = rawStreams.map((s) => ({
    parameter: String(s.parameter ?? ''),
    provider: String(s.provider ?? ''),
    locale: s.locale,
  }))

  const match = {
    ...ev.match,
    games,
    teams: (
      ev.match.teams ?? []
    ).map((t: {
      id?: string
      name?: string
      code?: string
      image?: string
      result?: { gameWins?: number }
    }) => ({
      id: t.id ?? '',
      name: t.name ?? '',
      code: t.code ?? '',
      ...t,
      image: t.image ? secureImageUrl(t.image) : '',
    })),
  }
  return {
    id: String(ev.id),
    league: {
      name: league.name ?? '',
      slug: league.slug ?? '',
      image: league.image ? secureImageUrl(league.image) : undefined,
    },
    streams,
    match,
  }
}
