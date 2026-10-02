/**
 * 자동 저장 파일 형식. presets/_autosave.json 에 이 모양 그대로 저장된다.
 */
import type { Notice, ServiceConfig, UserState } from './types'

export const SAVED_VERSION = 1

export interface SavedScenario {
  version: typeof SAVED_VERSION
  name: string
  description: string
  savedAt: number
  config: ServiceConfig
  notices: Notice[]
  user: UserState
}

export type ParseResult = { ok: true; value: SavedScenario } | { ok: false; error: string }

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const isArrayOf = (v: unknown, check: (item: unknown) => boolean) =>
  Array.isArray(v) && v.every(check)
const isScope = (v: unknown) =>
  isObject(v) &&
  Array.isArray(v.ids) &&
  typeof v.all === 'boolean' &&
  typeof v.includeFuture === 'boolean'

/** 파일에서 읽은 값을 검사한다. 틀린 곳이 있으면 이유를 돌려준다. */
export function parseSaved(value: unknown): ParseResult {
  const fail = (error: string): ParseResult => ({ ok: false, error })
  if (!isObject(value)) return fail('저장 파일 형식이 아닙니다')
  if (value.version !== SAVED_VERSION) return fail(`지원하지 않는 버전입니다 (${String(value.version)})`)

  const { config, notices, user } = value
  if (
    !isObject(config) ||
    !isArrayOf(config.countries, (c) => isObject(c) && typeof c.id === 'string') ||
    !isArrayOf(config.services, (s) => isObject(s) && typeof s.id === 'string') ||
    !isArrayOf(
      config.cities,
      (c) => isObject(c) && typeof c.countryId === 'string' && Array.isArray(c.serviceIds),
    )
  ) {
    return fail('서비스 구성(config)이 올바르지 않습니다')
  }
  if (
    !isArrayOf(
      notices,
      (n) =>
        isObject(n) &&
        typeof n.id === 'string' &&
        (n.type === 'app' || n.type === 'mobility') &&
        isObject(n.period) &&
        isScope(n.countries) &&
        (n.type === 'app' || (isScope(n.cities) && isScope(n.services))),
    )
  ) {
    return fail('발행 공지(notices)가 올바르지 않습니다')
  }
  if (!isObject(user) || typeof user.now !== 'number') {
    return fail('사용자 상태(user)가 올바르지 않습니다')
  }

  return {
    ok: true,
    value: {
      version: SAVED_VERSION,
      name: typeof value.name === 'string' ? value.name : '',
      description: typeof value.description === 'string' ? value.description : '',
      savedAt: typeof value.savedAt === 'number' ? value.savedAt : 0,
      config: config as unknown as ServiceConfig,
      notices: notices as Notice[],
      // 빠진 항목은 기본값으로 채운다
      user: {
        countryId: typeof user.countryId === 'string' ? user.countryId : null,
        cityIds: Array.isArray(user.cityIds) ? (user.cityIds as string[]) : [],
        reservations: Array.isArray(user.reservations)
          ? (user.reservations as UserState['reservations'])
          : [],
        now: user.now,
        dismissedPopupIds: Array.isArray(user.dismissedPopupIds)
          ? (user.dismissedPopupIds as string[])
          : [],
        readNoticeIds: Array.isArray(user.readNoticeIds) ? (user.readNoticeIds as string[]) : [],
        closedCards: Array.isArray(user.closedCards) ? (user.closedCards as string[]) : [],
      },
    },
  }
}
