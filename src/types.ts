export interface League {
  id: string
  slug: string
  name: string
  region: string
  image: string
  priority: number
  displayPriority?: {
    position?: number
    status?: string
  }
}

export interface ScheduleEvent {
  startTime: string
  state: string
  type: string
  blockName?: string
  league: {
    name: string
    slug: string
  }
  match?: {
    id: string
    teams: MatchTeam[]
    strategy?: { type: string; count: number }
  }
}

export interface MatchTeam {
  name: string
  code: string
  image: string
  result?: { outcome: string; gameWins: number }
  record?: { wins: number; losses: number }
}

export interface SchedulePages {
  older?: string
  newer?: string
}
