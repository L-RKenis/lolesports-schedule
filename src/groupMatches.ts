import type { ScheduleEvent } from './types'

export interface DayGroup {
  label: string
  sortKey: string
  events: ScheduleEvent[]
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function dayHeading(d: Date, now: Date): string {
  const day = startOfLocalDay(d).getTime()
  const t = startOfLocalDay(now).getTime()
  const diff = (day - t) / 86400000
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })
}

export function groupMatchesByDay(events: ScheduleEvent[], now = new Date()): DayGroup[] {
  const sorted = [...events].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  )

  const map = new Map<string, ScheduleEvent[]>()
  for (const ev of sorted) {
    const d = new Date(ev.startTime)
    const key = localDayKey(d)
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(ev)
  }

  const keys = [...map.keys()].sort()
  return keys.map((sortKey) => {
    const first = map.get(sortKey)![0]
    const d = new Date(first.startTime)
    return {
      sortKey,
      label: dayHeading(d, now),
      events: map.get(sortKey)!,
    }
  })
}
