const BASE = '/api/livestats'

export interface ParticipantMeta {
  participantId: number
  summonerName: string
  championId: string
  role: string
}

export interface GameMetadata {
  patchVersion: string
  blueTeamMetadata: { esportsTeamId: string; participantMetadata: ParticipantMeta[] }
  redTeamMetadata: { esportsTeamId: string; participantMetadata: ParticipantMeta[] }
}

export interface DetailParticipant {
  participantId: number
  level: number
  kills: number
  deaths: number
  assists: number
  totalGoldEarned: number
  creepScore: number
  killParticipation: number
  championDamageShare: number
  totalDamageDealtToChampions?: number
  wardsPlaced: number
  wardsDestroyed: number
  items: number[]
}

interface DetailsFrame {
  participants: DetailParticipant[]
}

interface DetailsResponse {
  frames: DetailsFrame[]
}

interface WindowResponse {
  gameMetadata: GameMetadata
  frames: WindowFrame[]
}

interface WindowFrame {
  rfc460Timestamp?: string
  gameState?: string
}

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text()
  console.info('[livestats] response', {
    status: res.status,
    ok: res.ok,
    contentType: res.headers.get('content-type') ?? null,
    textLength: text.length,
    preview: text.slice(0, 120),
  })
  try {
    return JSON.parse(text) as T
  } catch (error) {
    console.error('[livestats] json parse failed', {
      status: res.status,
      textLength: text.length,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

export async function fetchGameWindow(
  gameId: string,
  startingTime?: string,
): Promise<WindowResponse> {
  const q = startingTime ? `?${new URLSearchParams({ startingTime })}` : ''
  const endpoint = `${BASE}/window/${gameId}${q}`
  console.info('[livestats] fetch window', { endpoint, gameId, startingTime: startingTime ?? null })
  const res = await fetch(endpoint)
  if (!res.ok) throw new Error(`livestats window failed: ${res.status}`)
  return parseJson<WindowResponse>(res)
}

async function fetchDetails(
  gameId: string,
  startingTime: string,
): Promise<DetailsResponse | null> {
  const q = new URLSearchParams({ startingTime })
  const endpoint = `${BASE}/details/${gameId}?${q}`
  console.info('[livestats] fetch details', { endpoint, gameId, startingTime })
  const res = await fetch(endpoint)
  if (!res.ok) return null
  if (res.status === 204) {
    console.warn('[livestats] details returned 204 (no content)', { gameId, startingTime })
    return null
  }
  return parseJson<DetailsResponse>(res)
}

function frameScore(parts: DetailParticipant[]): number {
  if (!parts?.length) return -1
  return parts.reduce(
    (s, p) => s + (p.kills ?? 0) + (p.deaths ?? 0) + (p.creepScore ?? 0) * 0.05,
    0,
  )
}

export interface VodSlice {
  firstFrameTime?: string
  startMillis?: number
  endMillis?: number
}

function candidateStartingTimes(
  gameNumber: number,
  vod: VodSlice | undefined,
  seriesStart: string | null,
): string[] {
  const out: string[] = []
  if (vod?.firstFrameTime && vod.endMillis != null && vod.startMillis != null) {
    const base = Date.parse(vod.firstFrameTime)
    if (!Number.isNaN(base)) {
      const span = Math.max(0, vod.endMillis - vod.startMillis)
      for (const off of [
        -120_000, 0, 180_000, 300_000, 600_000, 900_000, 1_200_000, 1_800_000, 2_400_000,
        3_000_000,
      ]) {
        out.push(new Date(base + span + off).toISOString())
      }
    }
  }
  if (seriesStart) {
    const t = Date.parse(seriesStart)
    if (!Number.isNaN(t)) {
      const block = t + (gameNumber - 1) * 42 * 60 * 1000
      for (const mins of [22, 30, 38, 46, 54, 62]) {
        out.push(new Date(block + mins * 60 * 1000).toISOString())
      }
    }
  }
  return [...new Set(out)]
}

export async function fetchBestEndgameStats(
  gameId: string,
  gameNumber: number,
  vod: VodSlice | undefined,
  seriesStart: string | null,
): Promise<{ participants: DetailParticipant[]; metadata: GameMetadata } | null> {
  let windowJson: WindowResponse
  try {
    windowJson = await fetchGameWindow(gameId)
  } catch {
    return null
  }
  const metadata = windowJson.gameMetadata
  const terminalFrame = [...(windowJson.frames ?? [])]
    .reverse()
    .find((f) => (f.gameState ?? '').toLowerCase() === 'finished')
  const lastFrame = (windowJson.frames ?? []).at(-1)
  const frameAnchorTime = terminalFrame?.rfc460Timestamp ?? lastFrame?.rfc460Timestamp
  const times = [
    ...(frameAnchorTime ? [frameAnchorTime] : []),
    ...candidateStartingTimes(gameNumber, vod, seriesStart),
  ].filter((x, i, arr) => Boolean(x) && arr.indexOf(x) === i)
  if (times.length === 0) return null

  let best: DetailParticipant[] | null = null
  let bestScore = -1
  const maxTries = 30
  console.info('[livestats] probing candidate times', {
    gameId,
    gameNumber,
    terminalGameStateFound: Boolean(terminalFrame),
    frameAnchorTime: frameAnchorTime ?? null,
    candidateCount: times.length,
    maxTries,
  })
  for (const startingTime of times.slice(0, maxTries)) {
    let det: DetailsResponse | null = null
    try {
      det = await fetchDetails(gameId, startingTime)
    } catch (error) {
      console.warn('[livestats] details parse failed; continue next timestamp', {
        gameId,
        startingTime,
        error: error instanceof Error ? error.message : String(error),
      })
      continue
    }
    const last = det?.frames?.at(-1)?.participants
    if (!last?.length) continue
    const sc = frameScore(last)
    if (sc > bestScore) {
      bestScore = sc
      best = last
    }
  }

  console.info('[livestats] selected best frame', {
    gameId,
    bestScore,
    found: Boolean(best),
  })
  if (!best || bestScore < 1) return null
  return { participants: best, metadata }
}
