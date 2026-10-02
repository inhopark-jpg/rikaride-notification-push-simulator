/**
 * 어드민 발행 폼(draft) → 공지(Notice) 변환과 scope 계층 의존 계산. 순수 함수만 둔다.
 */
import type { City, Id, Notice, NoticeType, Scope, Service, ServiceConfig } from './types'

export interface ScopeDraft {
  all: boolean
  includeFuture: boolean
  ids: Id[]
}

export interface NoticeDraft {
  type: NoticeType
  title: string
  body: string
  important: boolean
  start: number
  end: number
  countries: ScopeDraft
  cities: ScopeDraft
  services: ScopeDraft
}

export const TYPE_LABEL: Record<NoticeType, string> = {
  app: '앱 공지',
  mobility: '이동 서비스 공지',
}

export const PLACEHOLDER_BODY = '시범 발행된 공지입니다. 본문을 입력하지 않아 기본 문구가 표시됩니다.'
export const placeholderTitle = (type: NoticeType) => `[시범] ${TYPE_LABEL[type]}`

const DAY = 24 * 60 * 60 * 1000
const emptyScope = (): ScopeDraft => ({ all: false, includeFuture: false, ids: [] })

export function emptyDraft(now: number, type: NoticeType = 'app'): NoticeDraft {
  return {
    type,
    title: '',
    body: '',
    important: false,
    start: now,
    end: now + 7 * DAY,
    countries: emptyScope(),
    cities: emptyScope(),
    services: emptyScope(),
  }
}

/** 국가 선택에 따라 좁혀진 도시 옵션 */
export function cityOptions(config: ServiceConfig, countries: ScopeDraft): City[] {
  return config.cities.filter((c) => countries.all || countries.ids.includes(c.countryId))
}

/** 도시 선택에 따라 좁혀진 서비스 옵션 (선택된 도시들에서 실제 제공되는 서비스) */
export function serviceOptions(
  config: ServiceConfig,
  countries: ScopeDraft,
  cities: ScopeDraft,
): Service[] {
  const offered = new Set(
    cityOptions(config, countries)
      .filter((c) => cities.all || cities.ids.includes(c.id))
      .flatMap((c) => c.serviceIds),
  )
  return config.services.filter((s) => offered.has(s.id))
}

/** 상위 scope나 구성이 바뀌어 더는 선택할 수 없는 항목을 하위 scope에서 제거한다 */
export function normalizeDraft(draft: NoticeDraft, config: ServiceConfig): NoticeDraft {
  const keep = (scope: ScopeDraft, optionIds: Id[]): ScopeDraft => ({
    ...scope,
    includeFuture: scope.all && scope.includeFuture,
    ids: scope.ids.filter((id) => optionIds.includes(id)),
  })
  const countries = keep(
    draft.countries,
    config.countries.map((c) => c.id),
  )
  const cities = keep(
    draft.cities,
    cityOptions(config, countries).map((c) => c.id),
  )
  const services = keep(
    draft.services,
    serviceOptions(config, countries, cities).map((s) => s.id),
  )
  return { ...draft, countries, cities, services }
}

/** 발행할 수 없으면 이유를, 가능하면 null을 반환 */
export function publishError(draft: NoticeDraft): string | null {
  const empty = (s: ScopeDraft) => !s.all && s.ids.length === 0
  if (draft.end < draft.start) return '게시 종료가 시작보다 빠릅니다'
  if (empty(draft.countries)) return '발행 대상 국가를 선택하세요'
  if (draft.type === 'mobility') {
    if (empty(draft.cities)) return '발행 대상 도시를 선택하세요'
    if (empty(draft.services)) return '발행 대상 서비스를 선택하세요'
  }
  return null
}

/**
 * 발행 폼 안내용: 지금 발행하면 "서비스 전체" 공지로 취급되는지.
 * 발행 후의 실제 판정은 visibility.ts의 isServiceWide가 그때그때 다시 계산한다.
 */
export function isDraftServiceWide(services: ScopeDraft, optionCount: number): boolean {
  return services.all || (optionCount > 0 && services.ids.length === optionCount)
}

/**
 * draft를 발행한다. "전체 선택"이면 그 시점의 옵션 전체를 스냅샷으로 저장하고,
 * "차후 포함" 플래그는 별도로 보존한다.
 */
export function buildNotice(
  rawDraft: NoticeDraft,
  config: ServiceConfig,
  meta: { id: Id; publishedAt: number },
): Notice {
  const draft = normalizeDraft(rawDraft, config)
  const snapshot = (scope: ScopeDraft, optionIds: Id[]): Scope => ({
    all: scope.all,
    includeFuture: scope.all && scope.includeFuture,
    ids: scope.all ? optionIds : scope.ids,
  })

  const notice: Notice = {
    ...meta,
    type: draft.type,
    title: draft.title.trim() || placeholderTitle(draft.type),
    body: draft.body.trim() || PLACEHOLDER_BODY,
    important: draft.important,
    period: { start: draft.start, end: draft.end },
    countries: snapshot(
      draft.countries,
      config.countries.map((c) => c.id),
    ),
  }
  if (draft.type === 'mobility') {
    const svcOptions = serviceOptions(config, draft.countries, draft.cities)
    notice.cities = snapshot(
      draft.cities,
      cityOptions(config, draft.countries).map((c) => c.id),
    )
    notice.services = snapshot(
      draft.services,
      svcOptions.map((s) => s.id),
    )
  }
  return notice
}

/** 발행된 공지를 다시 폼에 불러온다 (수정용) */
export function draftFromNotice(notice: Notice): NoticeDraft {
  const toDraft = (scope?: Scope): ScopeDraft =>
    scope ? { all: scope.all, includeFuture: scope.includeFuture, ids: [...scope.ids] } : emptyScope()
  return {
    type: notice.type,
    title: notice.title === placeholderTitle(notice.type) ? '' : notice.title,
    body: notice.body === PLACEHOLDER_BODY ? '' : notice.body,
    important: notice.important,
    start: notice.period.start,
    end: notice.period.end,
    countries: toDraft(notice.countries),
    cities: toDraft(notice.cities),
    services: toDraft(notice.services),
  }
}

/** 발행 목록에 보여줄 scope 요약. 예: "전체 (발행 시점 3개) + 차후 포함" */
export function scopeSummary(scope: Scope, nameOf: (id: Id) => string | undefined): string {
  const names = scope.ids.map(nameOf).filter((n): n is string => !!n)
  if (!scope.all) return names.join(', ') || '(삭제된 항목)'
  return `전체 (발행 시점 ${scope.ids.length}개)${scope.includeFuture ? ' + 차후 포함' : ''}`
}
