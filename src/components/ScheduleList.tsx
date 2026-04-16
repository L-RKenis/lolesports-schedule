import { Link } from 'react-router-dom'
import type { ScheduleEvent } from '../types'

interface Grouped {
  label: string
  sortKey: string
  events: ScheduleEvent[]
}

interface ScheduleListProps {
  groups: Grouped[]
}

export function ScheduleList({ groups }: ScheduleListProps) {
  if (groups.length === 0) {
    return (
      <div className="schedule-empty">
        <p>No matches match your filters.</p>
      </div>
    )
  }

  return (
    <div className="schedule-list">
      {groups.map((g) => (
        <section key={g.sortKey} className="schedule-day">
          <h3 className="schedule-day__title">{g.label}</h3>
          <ul className="schedule-day__matches">
            {g.events.map((ev) => (
              <li key={ev.match?.id ?? `${ev.startTime}-${ev.league.slug}`}>
                <MatchRow event={ev} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function MatchRow({ event }: { event: ScheduleEvent }) {
  const m = event.match
  const t = m?.teams ?? []
  const [a, b] = [t[0], t[1]]
  const bo = m?.strategy
  const boLabel = bo ? `Bo${bo.count}` : ''

  const time = new Date(event.startTime)
  const timeStr = time.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })

  const stateClass =
    event.state === 'inProgress'
      ? 'match-row--live'
      : event.state === 'completed'
        ? 'match-row--done'
        : 'match-row--upcoming'

  const card = (
    <article className={`match-row ${stateClass}`}>
      <div className="match-row__meta">
        <span className="match-row__league">{event.league.name}</span>
        {event.blockName && <span className="match-row__block">{event.blockName}</span>}
        {boLabel && <span className="match-row__bo">{boLabel}</span>}
      </div>
      <div className="match-row__main">
        <span className="match-row__time">{timeStr}</span>
        <div className="match-row__teams">
          {a && <TeamSide team={a} align="end" />}
          <span className="match-row__vs">vs</span>
          {b && <TeamSide team={b} align="start" />}
        </div>
        {event.state === 'inProgress' && (
          <span className="match-row__live-pill">Live</span>
        )}
        {event.state !== 'completed' && event.state !== 'inProgress' && (
          <span className="match-row__incoming-pill">Incoming</span>
        )}
      </div>
    </article>
  )

  if ((event.state === 'completed' || event.state === 'inProgress') && m?.id) {
    const qs = new URLSearchParams()
    qs.set('start', event.startTime)
    if (event.state === 'inProgress') qs.set('state', 'inProgress')
    return (
      <Link className="match-row-link" to={`/match/${m.id}?${qs.toString()}`}>
        {card}
      </Link>
    )
  }

  return card
}

function TeamSide({
  team,
  align,
}: {
  team: NonNullable<ScheduleEvent['match']>['teams'][0]
  align: 'start' | 'end'
}) {
  const wins = team.result?.gameWins
  const showScore = wins !== undefined && wins !== null
  return (
    <div className={`match-row__team match-row__team--${align}`}>
      <img className="match-row__logo" src={team.image} alt="" />
      <div className="match-row__team-text">
        <span className="match-row__code">{team.code}</span>
        <span className="match-row__name">{team.name}</span>
      </div>
      {showScore && <span className="match-row__score">{wins}</span>}
    </div>
  )
}
