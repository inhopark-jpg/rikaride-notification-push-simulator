const pad = (n: number) => String(n).padStart(2, '0')

/** <input type="datetime-local"> 값으로 변환 */
export function toInputValue(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fromInputValue(value: string): number | null {
  const ms = new Date(value).getTime()
  return Number.isNaN(ms) ? null : ms
}

/** 알림 센터 list item 날짜 표기 (Figma): "9월 19일 · 오후 02:30" */
export function formatNoticeDate(ms: number): string {
  const d = new Date(ms)
  const hour = d.getHours()
  return `${d.getMonth() + 1}월 ${d.getDate()}일 · ${hour < 12 ? '오전' : '오후'} ${pad(hour % 12 || 12)}:${pad(d.getMinutes())}`
}

export function formatShort(ms: number): string {
  const d = new Date(ms)
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export const formatPeriod = (p: { start: number; end: number }) =>
  `${formatShort(p.start)} ~ ${formatShort(p.end)}`

/** ms가 속한 날의 00:00 ~ 23:59:59.999 (예약/이용은 하루 단위) */
export function dayRange(ms: number): { start: number; end: number } {
  const d = new Date(ms)
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime()
  return { start, end: next - 1 }
}

/** <input type="date"> 값으로 변환 */
export function toDateInputValue(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** "YYYY-MM-DD" → 그날 00:00 (로컬 시각) */
export function fromDateInputValue(value: string): number | null {
  const [y, m, d] = value.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d).getTime()
}
