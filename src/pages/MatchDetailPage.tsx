import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { fetchMatchEventDetails, type EventMatchGame } from '../api/esports'
import {
  fetchBestEndgameStats,
  type DetailParticipant,
  type GameMetadata,
  type ParticipantMeta,
  type VodSlice,
} from '../api/livestats'
import {
  archiveLinksFromGames,
  liveStreamLinks,
  providerIconUrl,
} from '../officialMedia'

function ddragonPatch(patchVersion: string): string {
  const segs = patchVersion.split('.').filter(Boolean)
  if (segs.length >= 2) return `${segs[0]}.${segs[1]}.1`
  return '15.1.1'
}

function roleOrder(role: string): number {
  const x = role.toLowerCase()
  const o: Record<string, number> = {
    top: 0,
    jungle: 1,
    middle: 2,
    mid: 2,
    bottom: 3,
    adc: 3,
    support: 4,
    utility: 4,
  }
  return o[x] ?? 99
}

interface Row extends DetailParticipant {
  summonerName: string
  championId: string
  role: string
  side: 'blue' | 'red'
}

interface DamageBarItem {
  participantId: number
  side: 'blue' | 'red'
  label: string
  value: number
}

function buildRows(meta: GameMetadata, parts: DetailParticipant[]): Row[] {
  const metaById = new Map<number, ParticipantMeta>()
  const blueM = meta.blueTeamMetadata?.participantMetadata ?? []
  const redM = meta.redTeamMetadata?.participantMetadata ?? []
  for (const p of blueM) {
    metaById.set(p.participantId, p)
  }
  for (const p of redM) {
    metaById.set(p.participantId, p)
  }
  const rows: Row[] = parts.map((p) => {
    const m = metaById.get(p.participantId)
    return {
      ...p,
      summonerName: m?.summonerName ?? `Player ${p.participantId}`,
      championId: m?.championId ?? 'Unknown',
      role: m?.role ?? '',
      side: p.participantId <= 5 ? 'blue' : 'red',
    }
  })
  rows.sort((a, b) => {
    if (a.side !== b.side) return a.side === 'blue' ? -1 : 1
    return roleOrder(a.role) - roleOrder(b.role)
  })
  return rows
}

export function MatchDetailPage() {
  const { matchId } = useParams<{ matchId: string }>()
  const [searchParams] = useSearchParams()
  const seriesStart = searchParams.get('start')
  const stateFromUrl = searchParams.get('state')

  const [eventLoading, setEventLoading] = useState(true)
  const [eventErr, setEventErr] = useState<string | null>(null)
  const [eventData, setEventData] = useState<Awaited<
    ReturnType<typeof fetchMatchEventDetails>
  > | null>(null)

  const [activeGameId, setActiveGameId] = useState<string | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [statsErr, setStatsErr] = useState<string | null>(null)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [patch, setPatch] = useState<string>('15.1.1')
  const statsSeq = useRef(0)

  useEffect(() => {
    if (!matchId) return
    let cancelled = false
    ;(async () => {
      setEventLoading(true)
      setEventErr(null)
      try {
        const ev = await fetchMatchEventDetails(matchId)
        if (cancelled) return
        setEventData(ev)
        const completed = ev.match.games.filter((g) => g.state === 'completed')
        const inProgress = ev.match.games.filter((g) => g.state === 'inProgress')
        setActiveGameId(
          completed[0]?.id ?? inProgress[0]?.id ?? ev.match.games[0]?.id ?? null,
        )
      } catch (e) {
        if (!cancelled) setEventErr(e instanceof Error ? e.message : 'Failed to load match')
      } finally {
        if (!cancelled) setEventLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [matchId])

  const activeGame = useMemo(() => {
    if (!eventData || !activeGameId) return null
    return eventData.match.games.find((g) => g.id === activeGameId) ?? null
  }, [eventData, activeGameId])

  useEffect(() => {
    if (!activeGame || activeGame.state !== 'completed') {
      setRows(null)
      setStatsLoading(false)
      setStatsErr(
        activeGame && activeGame.state !== 'completed'
          ? 'Statistics are only captured here for completed games.'
          : null,
      )
      return
    }

    const id = ++statsSeq.current
    setStatsLoading(true)
    setStatsErr(null)
    setRows(null)

    ;(async () => {
      try {
        const rawVod = activeGame.vods?.[0]
        const vod: VodSlice | undefined = rawVod
          ? {
              firstFrameTime: rawVod.firstFrameTime,
              startMillis: rawVod.startMillis ?? undefined,
              endMillis: rawVod.endMillis ?? undefined,
            }
          : undefined
        const bundle = await fetchBestEndgameStats(
          activeGame.id,
          activeGame.number,
          vod,
          seriesStart,
        )
        if (id !== statsSeq.current) return
        if (!bundle) {
          setStatsErr(
            'Post-game stats are not available from the livestats feed (data may have expired).',
          )
          return
        }
        setPatch(ddragonPatch(bundle.metadata.patchVersion))
        setRows(buildRows(bundle.metadata, bundle.participants))
      } catch (e) {
        if (id !== statsSeq.current) return
        setStatsErr(e instanceof Error ? e.message : 'Could not load game stats')
      } finally {
        if (id === statsSeq.current) setStatsLoading(false)
      }
    })()
  }, [activeGame, seriesStart])

  const completedGames = eventData?.match.games.filter((g) => g.state === 'completed') ?? []

  const teamById = useMemo(() => {
    const m = new Map<
      string,
      {
        code: string
        image: string
      }
    >()
    eventData?.match.teams.forEach((t) => m.set(t.id, { code: t.code, image: t.image }))
    return m
  }, [eventData])

  const activeSideTeams = useMemo(() => {
    if (!activeGame) return null
    return {
      blue: teamById.get(activeGame.teams.find((x) => x.side === 'blue')?.id ?? ''),
      red: teamById.get(activeGame.teams.find((x) => x.side === 'red')?.id ?? ''),
    }
  }, [activeGame, teamById])

  const damageBars = useMemo(() => {
    if (!rows) return []
    const hasExactDamage = rows.every((r) => typeof r.totalDamageDealtToChampions === 'number')
    return rows.map((r) => ({
      participantId: r.participantId,
      side: r.side,
      label: r.summonerName,
      value: hasExactDamage ? (r.totalDamageDealtToChampions ?? 0) : r.championDamageShare * 100,
    }))
  }, [rows])
  const hasExactDamage = rows
    ? rows.every((r) => typeof r.totalDamageDealtToChampions === 'number')
    : false
  const maxDamageBarValue = Math.max(...damageBars.map((x) => x.value), 1)

  const officialMediaLinks = useMemo(() => {
    if (!eventData) return []
    const gamesInProgress = eventData.match.games.some((g) => g.state === 'inProgress')
    const isLive = gamesInProgress || stateFromUrl === 'inProgress'
    if (isLive) {
      const live = liveStreamLinks(eventData.streams)
      if (live.length > 0) return live
    }
    return archiveLinksFromGames(eventData.match.games)
  }, [eventData, stateFromUrl])

  if (eventLoading) {
    return (
      <div className="app match-detail">
        <p className="loading">Loading match…</p>
      </div>
    )
  }

  if (eventErr || !eventData) {
    return (
      <div className="app match-detail">
        <Link to="/" className="match-detail__back">
          ← Schedule
        </Link>
        <div className="banner banner--error" role="alert">
          {eventErr ?? 'Match not found.'}
        </div>
      </div>
    )
  }

  const { league, match } = eventData
  const [t0, t1] = match.teams

  return (
    <div className="app match-detail">
      <div className="match-detail__top-row">
        <Link to="/" className="match-detail__back">
          ← Back to schedule
        </Link>
        {officialMediaLinks.length > 0 && (
          <div className="match-detail__official-media" aria-label="Official broadcast links">
            {officialMediaLinks.map((item) => (
              <a
                key={item.url}
                className="match-detail__media-link"
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <img
                  className="match-detail__media-icon"
                  src={providerIconUrl(item.provider)}
                  alt=""
                  loading="lazy"
                />
                <span className="match-detail__media-name">{item.label}</span>
              </a>
            ))}
          </div>
        )}
      </div>

      <header className="match-detail__head">
        {league.image && (
          <img src={league.image} alt="" className="match-detail__league-ico" />
        )}
        <div>
          <p className="match-detail__league">{league.name}</p>
          <h1 className="match-detail__title">
            {t0?.code ?? '—'} vs {t1?.code ?? '—'}
          </h1>
          <p className="match-detail__sub">
            Score {t0?.result?.gameWins ?? 0} — {t1?.result?.gameWins ?? 0}
            {match.strategy?.count ? ` (Bo${match.strategy.count})` : ''}
          </p>
        </div>
      </header>

      <p className="match-detail__data-note">
        Player rows use Riot’s livestats feed (similar sources to broadcast overlays). If raw champion
        damage is unavailable from the feed, the damage chart falls back to team damage share (%).
      </p>

      {completedGames.length === 0 ? (
        <p className="match-detail__empty">No completed games in this match yet.</p>
      ) : (
        <>
          <div className="match-detail__tabs" role="tablist" aria-label="Games">
            {completedGames.map((g: EventMatchGame) => (
              <button
                key={g.id}
                type="button"
                role="tab"
                aria-selected={g.id === activeGameId}
                className={`match-detail__tab${g.id === activeGameId ? ' match-detail__tab--on' : ''}`}
                onClick={() => setActiveGameId(g.id)}
              >
                Game {g.number}
              </button>
            ))}
          </div>

          {statsLoading && <p className="match-detail__loading">Loading game statistics…</p>}
          {statsErr && !statsLoading && (
            <div className="banner banner--error match-detail__stats-err" role="alert">
              {statsErr}
            </div>
          )}

          {rows && !statsLoading && (
            <div className="match-detail__table-wrap">
              <table className="match-detail__table">
                <thead>
                  <tr>
                    <th className="match-detail__team-logo-col">Team</th>
                    <th>Player</th>
                    <th>Champion</th>
                    <th>Role</th>
                    <th>K / D / A</th>
                    <th>CS</th>
                    <th>Gold</th>
                    <th>Items</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.participantId}
                      className={`match-detail__row match-detail__row--${r.side}`}
                    >
                      <td className="match-detail__team-logo-cell">
                        <img
                          src={r.side === 'blue' ? activeSideTeams?.blue?.image : activeSideTeams?.red?.image}
                          alt=""
                        />
                      </td>
                      <td>{r.summonerName}</td>
                      <td>
                        <span className="match-detail__champ-wrap">
                          <img
                            className="match-detail__champ"
                            src={`https://ddragon.leagueoflegends.com/cdn/${patch}/img/champion/${r.championId}.png`}
                            alt=""
                            onError={(e) => {
                              ;(e.target as HTMLImageElement).style.display = 'none'
                            }}
                          />
                          {r.championId}
                        </span>
                      </td>
                      <td>{r.role}</td>
                      <td>
                        {r.kills} / {r.deaths} / {r.assists}
                      </td>
                      <td>{r.creepScore}</td>
                      <td>{r.totalGoldEarned.toLocaleString()}</td>
                      <td>
                        <div className="match-detail__items">
                          {r.items
                            .filter((id) => id > 0)
                            .map((id) => (
                              <img
                                key={id + '-' + r.participantId}
                                src={`https://ddragon.leagueoflegends.com/cdn/${patch}/img/item/${id}.png`}
                                alt=""
                                title={`Item ${id}`}
                                onError={(e) => {
                                  ;(e.target as HTMLImageElement).style.visibility = 'hidden'
                                }}
                              />
                            ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {rows && !statsLoading && (
            <section className="match-detail__damage" aria-label="Damage graph">
              <h3>Damage dealt</h3>
              {!hasExactDamage && (
                <p className="match-detail__damage-note">
                  Exact per-player damage is not provided by this match feed. Showing team damage
                  share instead.
                </p>
              )}
              <div className="match-detail__damage-list">
                {damageBars.map((bar: DamageBarItem) => (
                  <div key={bar.participantId} className="match-detail__damage-row">
                    <span className="match-detail__damage-player">{bar.label}</span>
                    <div className="match-detail__damage-track">
                      <span
                        className={`match-detail__damage-bar match-detail__damage-bar--${bar.side}`}
                        style={{ width: `${(bar.value / maxDamageBarValue) * 100}%` }}
                      />
                    </div>
                    <span className="match-detail__damage-value">
                      {hasExactDamage ? Math.round(bar.value).toLocaleString() : `${bar.value.toFixed(1)}%`}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <footer className="footer">
        Stats from{' '}
        <code>feed.lolesports.com</code> when available. Not affiliated with Riot Games.
      </footer>
    </div>
  )
}
