import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchLeagues, fetchSchedule } from '../api/esports'
import { buildLeagueBadges } from '../buildLeagueBadges'
import { LeagueFilter } from '../components/LeagueFilter'
import { ScheduleList } from '../components/ScheduleList'
import { groupMatchesByDay } from '../groupMatches'
import type { League, ScheduleEvent } from '../types'

function dedupeEvents(list: ScheduleEvent[]): ScheduleEvent[] {
  const seen = new Set<string>()
  const out: ScheduleEvent[] = []
  for (const e of list) {
    const id = e.match?.id
    const key = id ?? `${e.startTime}-${e.league.slug}-${e.type}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(e)
  }
  return out
}

const MAIN_LEAGUE_NAMES = new Set([
  'First Stand',
  'MSI',
  'Worlds',
  'Worlds Qualifying Series',
  'LCK',
  'LPL',
  'LEC',
  'LCS',
  'CBLOL',
  'LCP',
])

type TournamentStage = {
  title: string
  details: string
}

type TournamentFormat = {
  summary: string
  stages: TournamentStage[]
}

type TeamStanding = {
  teamCode: string
  teamName: string
  teamImage: string
  wins: number
  losses: number
}

const TOURNAMENT_FORMATS_BY_LEAGUE: Record<string, TournamentFormat> = {
  LCK: {
    summary: 'Two-round robin regular season, then a double-elimination playoffs bracket.',
    stages: [
      {
        title: 'Regular Season',
        details:
          '10 teams play a double round robin (18 matches per team). Teams are ranked by match record.',
      },
      {
        title: 'Playoffs',
        details:
          'Top teams advance to a double-elimination bracket. Upper-bracket winner reaches the final; lower-bracket teams fight through elimination matches.',
      },
      {
        title: 'Final Qualification',
        details: 'Top finishers secure international qualification based on playoff results.',
      },
    ],
  },
  LPL: {
    summary: 'Group stage and split phases feed into regional playoffs and finals.',
    stages: [
      {
        title: 'Regular Stage',
        details:
          'Teams play split regular matches to determine seeding and qualification positions.',
      },
      {
        title: 'Playoffs',
        details:
          'Qualified teams enter a seeded bracket where higher seeds receive matchup advantages.',
      },
      {
        title: 'Finals',
        details: 'Top playoff teams compete for the league title and international seeds.',
      },
    ],
  },
  LEC: {
    summary: 'Season split into stage rounds, then season finals for top teams.',
    stages: [
      {
        title: 'Stage 1',
        details: 'Teams play regular matches to create initial standings and cutoff lines.',
      },
      {
        title: 'Stage 2',
        details: 'Qualified teams play bracket rounds with elimination and advancement paths.',
      },
      {
        title: 'Season Finals',
        details: 'Best teams from earlier stages compete for the final championship spots.',
      },
    ],
  },
  LCS: {
    summary: 'Regular season standings determine playoff bracket seeding.',
    stages: [
      {
        title: 'Regular Season',
        details:
          'Teams play scheduled round-robin matches to decide qualification and playoff seed.',
      },
      {
        title: 'Playoffs',
        details: 'Qualified teams enter a double-elimination bracket for the championship.',
      },
      {
        title: 'Finals',
        details: 'Remaining teams play for the split title and international qualification.',
      },
    ],
  },
  MSI: {
    summary: 'International teams progress from opening rounds into knockout elimination.',
    stages: [
      {
        title: 'Play-In / Opening',
        details: 'Teams begin with opening stage matches to determine main bracket entrants.',
      },
      {
        title: 'Bracket Stage',
        details: 'Qualified teams play a double-elimination knockout bracket.',
      },
      {
        title: 'Grand Final',
        details: 'Final two teams play for the MSI title.',
      },
    ],
  },
  Worlds: {
    summary: 'Global event progressing through swiss/group style rounds into knockouts.',
    stages: [
      {
        title: 'Opening Stage',
        details: 'Teams from different regions compete to secure spots in the main stage.',
      },
      {
        title: 'Main Stage',
        details: 'Qualified teams play progression rounds based on wins and losses.',
      },
      {
        title: 'Knockout',
        details: 'Top teams enter single-elimination playoffs through to the world final.',
      },
    ],
  },
}

function isMainLeague(league: League): boolean {
  return MAIN_LEAGUE_NAMES.has(league.name)
}

function buildLeagueStandings(events: ScheduleEvent[], leagueSlug: string): TeamStanding[] {
  const table = new Map<string, TeamStanding>()
  for (const event of events) {
    if (event.league.slug !== leagueSlug || !event.match) continue
    for (const team of event.match.teams) {
      const key = `${team.code || team.name}-${team.name}`
      const existing = table.get(key)
      const recordWins = team.record?.wins
      const recordLosses = team.record?.losses
      const fallbackWins = team.result?.outcome === 'win' ? 1 : 0
      const fallbackLosses = team.result?.outcome === 'loss' ? 1 : 0
      const nextWins = typeof recordWins === 'number' ? recordWins : fallbackWins
      const nextLosses = typeof recordLosses === 'number' ? recordLosses : fallbackLosses

      if (!existing) {
        table.set(key, {
          teamCode: team.code || team.name,
          teamName: team.name,
          teamImage: team.image,
          wins: nextWins,
          losses: nextLosses,
        })
        continue
      }

      // keep the strongest known record snapshot seen in schedule payload
      if (
        nextWins > existing.wins ||
        (nextWins === existing.wins && nextLosses < existing.losses)
      ) {
        existing.wins = nextWins
        existing.losses = nextLosses
      }
      if (!existing.teamImage && team.image) existing.teamImage = team.image
    }
  }

  return [...table.values()].sort((a, b) => {
    if (a.wins !== b.wins) return b.wins - a.wins
    if (a.losses !== b.losses) return a.losses - b.losses
    return a.teamCode.localeCompare(b.teamCode)
  })
}

export default function HomePage() {
  const [leagues, setLeagues] = useState<League[]>([])
  const [events, setEvents] = useState<ScheduleEvent[]>([])
  const [olderToken, setOlderToken] = useState<string | undefined>()
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedLeagueSlugs, setSelectedLeagueSlugs] = useState<Set<string>>(() => new Set())
  const [formatLeagueSlug, setFormatLeagueSlug] = useState<string>('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const [lg, sch] = await Promise.all([fetchLeagues(), fetchSchedule()])
        if (cancelled) return
        setLeagues(lg)
        setEvents(dedupeEvents(sch.events))
        setOlderToken(sch.pages.older)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load schedule')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const focusedLeagues = useMemo(() => leagues.filter(isMainLeague), [leagues])
  const leagueBadges = useMemo(() => buildLeagueBadges(focusedLeagues), [focusedLeagues])
  const focusedLeagueSlugs = useMemo(
    () => new Set(focusedLeagues.map((l) => l.slug)),
    [focusedLeagues],
  )
  const formatLeagueOptions = useMemo(
    () => focusedLeagues.filter((league) => TOURNAMENT_FORMATS_BY_LEAGUE[league.name]),
    [focusedLeagues],
  )

  useEffect(() => {
    if (formatLeagueOptions.length === 0) {
      setFormatLeagueSlug('')
      return
    }
    if (!formatLeagueSlug || !formatLeagueOptions.some((league) => league.slug === formatLeagueSlug)) {
      setFormatLeagueSlug(formatLeagueOptions[0].slug)
    }
  }, [formatLeagueOptions, formatLeagueSlug])

  const selectedFormatLeague = useMemo(
    () => formatLeagueOptions.find((league) => league.slug === formatLeagueSlug),
    [formatLeagueOptions, formatLeagueSlug],
  )
  const selectedTournamentFormat = useMemo(
    () =>
      selectedFormatLeague ? TOURNAMENT_FORMATS_BY_LEAGUE[selectedFormatLeague.name] : undefined,
    [selectedFormatLeague],
  )
  const selectedLeagueStandings = useMemo(
    () => (formatLeagueSlug ? buildLeagueStandings(events, formatLeagueSlug) : []),
    [events, formatLeagueSlug],
  )

  const filteredEvents = useMemo(() => {
    const scoped = events.filter((ev) => focusedLeagueSlugs.has(ev.league.slug))
    if (selectedLeagueSlugs.size === 0) return scoped
    return scoped.filter((ev) => selectedLeagueSlugs.has(ev.league.slug))
  }, [events, focusedLeagueSlugs, selectedLeagueSlugs])

  const dayGroups = useMemo(() => groupMatchesByDay(filteredEvents), [filteredEvents])

  const toggleLeague = useCallback((slug: string) => {
    setSelectedLeagueSlugs((prev) => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })
  }, [])

  const clearSelection = useCallback(() => setSelectedLeagueSlugs(new Set()), [])

  const loadOlder = useCallback(async () => {
    if (!olderToken || loadingMore) return
    setLoadingMore(true)
    setError(null)
    try {
      const sch = await fetchSchedule('en-US', olderToken)
      setEvents((prev) => dedupeEvents([...prev, ...sch.events]))
      setOlderToken(sch.pages.older)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load more')
    } finally {
      setLoadingMore(false)
    }
  }, [olderToken, loadingMore])

  return (
    <div className="app">
      <header className="header">
        <div className="header__title-segment">
          <h1>LoL Esports schedule</h1>
          <p className="header__sub">Match times in your local timezone</p>
        </div>
        <div className="header__info-segment">
          <section className="tournament-format" aria-label="Tournament format by league">
            <div className="tournament-format__top">
              <label htmlFor="format-league-select">Tournament format</label>
              <select
                id="format-league-select"
                value={formatLeagueSlug}
                onChange={(event) => setFormatLeagueSlug(event.target.value)}
              >
                {formatLeagueOptions.map((league) => (
                  <option key={league.slug} value={league.slug}>
                    {league.name}
                  </option>
                ))}
              </select>
            </div>
            {selectedTournamentFormat ? (
              <>
                <p className="tournament-format__summary">{selectedTournamentFormat.summary}</p>
                <ol className="tournament-format__list">
                  {selectedTournamentFormat.stages.map((stage) => (
                    <li key={stage.title}>
                      <strong>{stage.title}:</strong> {stage.details}
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <p className="tournament-format__summary">
                No tournament format is available for the selected league.
              </p>
            )}
          </section>
          <section className="tournament-standings" aria-label="Tournament standings">
            <h2>
              {selectedFormatLeague ? `${selectedFormatLeague.name} standings` : 'Tournament standings'}
            </h2>
            {selectedLeagueStandings.length === 0 ? (
              <p className="tournament-standings__empty">
                Team records are not available for this tournament yet.
              </p>
            ) : (
              <ol className="tournament-standings__list">
                {selectedLeagueStandings.slice(0, 10).map((team, index) => (
                  <li key={`${team.teamCode}-${team.teamName}`}>
                    <span className="tournament-standings__rank">#{index + 1}</span>
                    <span className="tournament-standings__team">
                      {team.teamImage && <img src={team.teamImage} alt="" loading="lazy" />}
                      <strong>{team.teamCode}</strong>
                    </span>
                    <span className="tournament-standings__score">
                      {team.wins} - {team.losses}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </header>

      {error && (
        <div className="banner banner--error" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <div className="loading">Loading leagues and matches…</div>
      ) : (
        <>
          <LeagueFilter
            leagues={leagueBadges}
            selectedSlugs={selectedLeagueSlugs}
            onToggle={toggleLeague}
            onClearSelection={clearSelection}
          />
          {olderToken && (
            <div className="load-more-wrap">
              <button
                type="button"
                className="load-more"
                onClick={loadOlder}
                disabled={loadingMore}
              >
                {loadingMore ? 'Loading…' : 'Load earlier matches'}
              </button>
            </div>
          )}
          <ScheduleList groups={dayGroups} />
        </>
      )}

      <footer className="footer">
        Schedule data from Riot’s LoL Esports API. Not affiliated with Riot Games.
      </footer>
    </div>
  )
}
