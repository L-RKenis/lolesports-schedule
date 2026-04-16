/** Display order when sorting leagues by their API region (major scenes first). */
const ORDER: string[] = [
  'INTERNATIONAL',
  'KOREA',
  'CHINA',
  'EMEA',
  'NORTH AMERICA',
  'AMERICAS',
  'PACIFIC',
  'JAPAN',
  'BRAZIL',
  'LATIN AMERICA',
  'LATIN AMERICA NORTH',
  'LATIN AMERICA SOUTH',
  'VIETNAM',
  'HONG KONG, MACAU, TAIWAN',
  'OCEANIA',
  'COMMONWEALTH OF INDEPENDENT STATES',
]

export function sortRegionNames(regions: string[]): string[] {
  const idx = (r: string) => {
    const i = ORDER.indexOf(r)
    return i === -1 ? 999 : i
  }
  return [...regions].sort((a, b) => idx(a) - idx(b) || a.localeCompare(b))
}
