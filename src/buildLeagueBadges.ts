import type { League } from './types'
import { sortRegionNames } from './regionOrder'

export interface LeagueBadge {
  slug: string
  name: string
  image: string
}

/**
 * One chip per league, ordered by region (major scenes first), then API priority.
 */
export function buildLeagueBadges(leagues: League[]): LeagueBadge[] {
  const regionOrder = sortRegionNames([...new Set(leagues.map((l) => l.region))])
  const regionIndex = new Map(regionOrder.map((r, i) => [r, i]))

  return [...leagues]
    .sort((a, b) => {
      const ra = regionIndex.get(a.region) ?? 999
      const rb = regionIndex.get(b.region) ?? 999
      if (ra !== rb) return ra - rb
      if (a.priority !== b.priority) return a.priority - b.priority
      return a.name.localeCompare(b.name)
    })
    .map((l) => ({
      slug: l.slug,
      name: l.name,
      image: l.image,
    }))
}
