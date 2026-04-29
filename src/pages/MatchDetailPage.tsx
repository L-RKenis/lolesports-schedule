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

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
}

const ROLE_FALLBACK_ARCHETYPE: Record<string, string> = {
  top: 'frontline or side-lane pressure',
  jungle: 'engage setup and objective control',
  mid: 'burst and mid-game skirmish control',
  middle: 'burst and mid-game skirmish control',
  bottom: 'sustained teamfight DPS',
  adc: 'sustained teamfight DPS',
  support: 'engage, peel, and vision control',
  utility: 'engage, peel, and vision control',
}

const CHAMPION_ARCHETYPE_HINT: Record<string, string> = {
  Ambessa: 'bruiser dive and skirmish pressure',
  Ahri: 'pick potential and mobile burst',
  Alistar: 'hard engage and frontline peel',
  Amumu: 'AoE engage wombo setup',
  Ashe: 'long-range engage and utility DPS',
  Azir: 'front-to-back teamfight DPS and zone control',
  Braum: 'peel and anti-dive protection',
  Camille: 'single-target dive and flank threat',
  Corki: 'poke-heavy siege and objective pressure',
  Draven: 'lane snowball and early skirmish damage',
  Ezreal: 'safe poke and kiting',
  Gnar: 'teamfight engage and lane pressure',
  Gragas: 'disengage or pick setup through barrels',
  Gwen: 'AP side-lane and anti-frontline damage',
  Jax: 'split-push and backline dive threat',
  Jayce: 'poke siege and lane control',
  Jhin: 'pick follow-up and long-range utility',
  Jinx: 'reset-based front-to-back carry DPS',
  Kaisa: 'dive follow-up and mixed burst DPS',
  Kalista: 'objective control and skirmish aggression',
  Kennen: 'AoE flank engage and wombo threat',
  KogMaw: 'hypercarry front-to-back scaling',
  LeBlanc: 'pick burst and side pressure',
  LeeSin: 'early tempo ganks and playmaking',
  Leona: 'hard engage and teamfight setup',
  Lillia: 'AoE sleep setup and scaling AP damage',
  Lucian: 'lane pressure and mid-game skirmish burst',
  Lulu: 'enchanter peel enabling hypercarries',
  Maokai: 'vision control and reliable engage',
  MissFortune: 'teamfight AoE DPS with setup',
  Nautilus: 'point-and-click engage chain',
  Nocturne: 'backline dive and map pressure',
  Orianna: 'teamfight control and wombo combo setup',
  Poppy: 'anti-dive control and engage denial',
  Rakan: 'fast engage and teamfight disruption',
  Rell: 'AoE engage and lockdown',
  Renekton: 'early lane control and dive assist',
  Rumble: 'AoE zone control in objectives',
  Sejuani: 'frontline engage and melee synergy',
  Senna: 'scaling utility carry and poke',
  Smolder: 'late-game scaling dragon DPS',
  Sylas: 'skirmish burst and flexible engage',
  Syndra: 'pick burst and zone control',
  TahmKench: 'frontline peel and carry protection',
  Tristana: 'siege DPS and explosive skirmish power',
  TwistedFate: 'global pick setup and map play',
  Vi: 'targeted backline engage',
  Viego: 'reset skirmisher and follow-up dive',
  Wukong: 'teamfight engage and AoE disruption',
  Xayah: 'self-peel DPS in front-to-back fights',
  XinZhao: 'early skirmish control and engage',
  Zeri: 'extended teamfight kiting and scaling',
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

function summarizeTeamComp(rows: Row[], side: 'blue' | 'red', teamCode: string): string {
  const teamRows = rows.filter((row) => row.side === side)
  if (teamRows.length === 0) return `${teamCode}: no player data available for composition analysis.`

  const champsWithRoles = teamRows.map((row) => {
    const role = row.role ? row.role.toLowerCase() : ''
    const roleHint = ROLE_FALLBACK_ARCHETYPE[role] ?? 'teamfight utility'
    const champHint = CHAMPION_ARCHETYPE_HINT[row.championId] ?? roleHint
    return `${row.championId} (${row.role || 'flex'}: ${champHint})`
  })

  const topDamage = [...teamRows].sort((a, b) => b.championDamageShare - a.championDamageShare)[0]
  const topDamageShare = Math.round((topDamage?.championDamageShare ?? 0) * 100)

  const hasStrongEngage = teamRows.some((row) =>
    ['Alistar', 'Leona', 'Rakan', 'Rell', 'Nautilus', 'Wukong', 'Sejuani', 'Vi', 'Maokai'].includes(
      row.championId,
    ),
  )
  const hasPokeCore = teamRows.some((row) =>
    ['Jayce', 'Ezreal', 'Corki', 'Varus', 'Ashe'].includes(row.championId),
  )
  const hasHyperCarry = teamRows.some((row) =>
    ['Jinx', 'Zeri', 'KogMaw', 'Smolder', 'Aphelios', 'Xayah'].includes(row.championId),
  )

  const style = hasStrongEngage
    ? 'This draft prefers engage windows and coordinated front-to-back teamfights.'
    : hasPokeCore
      ? 'This draft prefers poke, objective setup, and chipping opponents before full commit.'
      : 'This draft has a mixed style and can pivot between skirmish picks and standard 5v5s.'

  const scalingNote = hasHyperCarry
    ? 'It has a clear late-game carry angle if the frontline and support can protect DPS uptime.'
    : 'Its power is less single-carry focused and more about coordinated spell layering.'

  return `${teamCode}: ${champsWithRoles.join(', ')}. Primary damage source is ${
    topDamage?.championId ?? 'N/A'
  } (~${topDamageShare}% team damage share). ${style} ${scalingNote}`
}

function buildTeamCompExplanation(rows: Row[], blueCode: string, redCode: string): string {
  const blueSummary = summarizeTeamComp(rows, 'blue', blueCode)
  const redSummary = summarizeTeamComp(rows, 'red', redCode)
  return [
    'Here is a quick draft read with League of Legends teamfight context:',
    blueSummary,
    redSummary,
    'Win condition read: look at who has cleaner engage tools and whether the main carry can hit safely in front-to-back fights. If one side has stronger poke, they should play for setup before dragon/baron starts.',
  ].join('\n\n')
}

function buildQuestionAnswer(
  question: string,
  rows: Row[] | null,
  blueCode?: string,
  redCode?: string,
): string {
  const q = question.toLowerCase()
  if (!rows || !blueCode || !redCode) {
    return 'I need completed game stats first. Open a completed game tab so I can analyze draft, damage, and player performance.'
  }

  const teamComp = buildTeamCompExplanation(rows, blueCode, redCode)

  if (q.includes('comp') || q.includes('draft') || q.includes('champion')) {
    return teamComp
  }

  if (q.includes('damage') || q.includes('carry') || q.includes('dps')) {
    const sorted = [...rows].sort((a, b) => b.championDamageShare - a.championDamageShare).slice(0, 3)
    const lines = sorted.map(
      (r) =>
        `${r.summonerName} (${r.championId}, ${r.side}) contributes about ${(r.championDamageShare * 100).toFixed(1)}% team damage share.`,
    )
    return `Top damage threats in this game:\n\n${lines.join('\n')}\n\nUse this to identify who must be protected (or focused) in late fights.`
  }

  if (q.includes('win condition') || q.includes('how to win') || q.includes('strategy')) {
    return `${teamComp}\n\nMacro tip: play around objective timers where your comp is strongest (engage windows for dive comps, setup time for poke comps, and peel spacing for hypercarry comps).`
  }

  if (q.includes('lane') || q.includes('matchup') || q.includes('early game')) {
    const lanes = rows
      .map((r) => `${r.side === 'blue' ? blueCode : redCode} ${r.role || 'flex'}: ${r.championId}`)
      .join(', ')
    return `Lane-oriented read from champions played:\n\n${lanes}\n\nEarly game priority usually comes from jungle-mid support coordination and lane prio around first drake/herald setups.`
  }

  return `${teamComp}\n\nI can also answer focused questions about damage threats, win conditions, lane pressure, or teamfight execution for this game.`
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
  const [questionInput, setQuestionInput] = useState('')
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
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

  function handleAskAssistant() {
    const question = questionInput.trim()
    if (!question) return
    const baseId = `${Date.now()}`
    const userMessage: ChatMessage = { id: `${baseId}-u`, role: 'user', text: question }
    const answer = buildQuestionAnswer(
      question,
      rows,
      activeSideTeams?.blue?.code,
      activeSideTeams?.red?.code,
    )
    const assistantMessage: ChatMessage = { id: `${baseId}-a`, role: 'assistant', text: answer }
    setChatMessages((prev) => [...prev, userMessage, assistantMessage])
    setQuestionInput('')
  }

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

      <section className="match-assistant" aria-label="AI assistant">
        <h2>AI Assistant</h2>
        <p className="match-assistant__hint">
          Ask for tactical explanation based on current game draft and player statistics.
        </p>
        <div className="match-assistant__controls">
          <input
            type="text"
            value={questionInput}
            onChange={(event) => setQuestionInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') handleAskAssistant()
            }}
            placeholder="Ask a game-related question (e.g. How do these comps win teamfights?)"
            aria-label="Assistant question input"
          />
          <button type="button" onClick={handleAskAssistant}>
            Ask
          </button>
        </div>
        <div className="match-assistant__chatlog" role="log" aria-live="polite">
          {chatMessages.length === 0 ? (
            <p className="match-assistant__empty">
              Select a prompt and click Ask to get an explanation.
            </p>
          ) : (
            chatMessages.map((message) => (
              <article
                key={message.id}
                className={`match-assistant__msg match-assistant__msg--${message.role}`}
              >
                <h3>{message.role === 'user' ? 'You' : 'Assistant'}</h3>
                <p>{message.text}</p>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  )
}
