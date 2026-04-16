import type { LeagueBadge } from '../buildLeagueBadges'

interface LeagueFilterProps {
  leagues: LeagueBadge[]
  selectedSlugs: Set<string>
  onToggle: (slug: string) => void
  onClearSelection: () => void
}

export function LeagueFilter({
  leagues,
  selectedSlugs,
  onToggle,
  onClearSelection,
}: LeagueFilterProps) {
  const hasSelection = selectedSlugs.size > 0
  return (
    <section className="league-filter" aria-label="Filter leagues">
      <div className="league-filter__header">
        <h2>Leagues</h2>
        <p className="league-filter__hint">
          Tap logos to <strong>show only selected leagues</strong>. If none are selected, all are
          shown.
        </p>
        {hasSelection && (
          <button type="button" className="league-filter__clear" onClick={onClearSelection}>
            Show all leagues
          </button>
        )}
      </div>
      <div className="league-filter__strip">
        {leagues.map((lg) => {
          const selected = selectedSlugs.has(lg.slug)
          const dimmed = hasSelection && !selected
          return (
            <button
              key={lg.slug}
              type="button"
              className={`league-chip${dimmed ? ' league-chip--excluded' : ''}`}
              onClick={() => onToggle(lg.slug)}
              title={`${selected ? 'Remove' : 'Select'} ${lg.name}`}
              aria-pressed={selected}
            >
              <span className="league-chip__img-wrap">
                <img src={lg.image} alt="" loading="lazy" />
              </span>
              <span className="league-chip__label">{lg.name}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
