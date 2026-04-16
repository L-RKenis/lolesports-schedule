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

function isMainLeague(league: League): boolean {
  return MAIN_LEAGUE_NAMES.has(league.name)
}

export default function HomePage() {
  const [leagues, setLeagues] = useState<League[]>([])
  const [events, setEvents] = useState<ScheduleEvent[]>([])
  const [olderToken, setOlderToken] = useState<string | undefined>()
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedLeagueSlugs, setSelectedLeagueSlugs] = useState<Set<string>>(() => new Set())

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
        <div className="header__brand">
          <span className="header__mark" aria-hidden />
          <div>
            <h1>LoL Esports schedule</h1>
            <p className="header__sub">Match times in your local timezone</p>
          </div>
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
