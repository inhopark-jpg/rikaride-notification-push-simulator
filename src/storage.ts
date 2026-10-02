/**
 * 개발 서버의 자동 저장 API(server/presetStore.ts) 호출.
 * 저장 API가 없는 곳(Netlify 등 정적 호스팅)에서는 실패하고, 앱은 저장 없이 동작한다.
 */
import { parseSaved } from './domain/saved'
import type { SavedScenario } from './domain/saved'

export const storage = {
  /** 자동 저장이 없으면 null */
  async loadAutosave(): Promise<SavedScenario | null> {
    const res = await fetch('/api/autosave')
    if (res.status === 404) return null
    if (!res.ok || !res.headers.get('content-type')?.includes('json')) {
      throw new Error(`자동 저장을 읽지 못했습니다 (${res.status})`)
    }
    const parsed = parseSaved(await res.json())
    if (!parsed.ok) throw new Error(parsed.error)
    return parsed.value
  },
  async saveAutosave(data: SavedScenario): Promise<void> {
    const res = await fetch('/api/autosave', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error(`자동 저장 실패 (${res.status})`)
  },
}
