import { describe, expect, it } from 'vitest'
import { buildPresets } from './presets'
import { SAVED_VERSION, parseSaved } from './saved'

const preset = buildPresets(Date.UTC(2026, 9, 1))[0]
const saved = {
  version: SAVED_VERSION,
  name: '테스트',
  description: '설명',
  savedAt: 1,
  config: preset.config,
  notices: preset.notices,
  user: preset.user,
}

describe('자동 저장 파일 형식', () => {
  it('저장한 그대로 다시 읽힌다 (JSON 왕복)', () => {
    const parsed = parseSaved(JSON.parse(JSON.stringify(saved)))
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.value.config).toEqual(saved.config)
      expect(parsed.value.notices).toEqual(saved.notices)
      expect(parsed.value.user).toEqual({ ...saved.user, closedCards: [] })
    }
  })

  it('버전이 다르거나 모양이 틀리면 이유와 함께 거부', () => {
    expect(parseSaved({ ...saved, version: 99 })).toMatchObject({ ok: false })
    expect(parseSaved({ ...saved, notices: [{ id: 'x' }] })).toEqual({
      ok: false,
      error: '발행 공지(notices)가 올바르지 않습니다',
    })
    expect(parseSaved('hello')).toMatchObject({ ok: false })
  })

  it('사용자 상태의 빠진 항목은 기본값으로 채운다', () => {
    const parsed = parseSaved({ ...saved, user: { now: 5 } })
    expect(parsed.ok && parsed.value.user).toEqual({
      countryId: null,
      cityIds: [],
      reservations: [],
      now: 5,
      dismissedPopupIds: [],
      readNoticeIds: [],
      closedCards: [],
    })
  })

})
