/**
 * 공지 노출 판정 로직. UI와 무관한 순수 함수만 둔다.
 * 규칙 요약은 README의 "판정 규칙 요약표"와 1:1로 대응한다.
 */
import type {
  City,
  Id,
  Notice,
  Period,
  Reservation,
  Scope,
  Service,
  ServiceConfig,
  UserState,
} from './types'

export type Surface = 'guide' | 'ride' | 'landing' | 'notification'

export interface Placement {
  surface: Surface
  /** surface가 landing일 때 어느 서비스 랜딩인지 */
  serviceId?: Id
  /** surface가 landing일 때 어느 도시 지도에서 보이는지 (사용자 선택 도시 중 해당 서비스 제공 도시) */
  cityIds?: Id[]
  /** "왜 여기에 보이는가" */
  reason: string
}

export interface CheckItem {
  label: string
  ok: boolean
  detail?: string
}

export interface PopupJudgement {
  show: boolean
  reason: string
  checklist: CheckItem[]
}

export interface Evaluation {
  notice: Notice
  placements: Placement[]
  /** 통과한 조건들 (툴팁용) */
  trace: string[]
  /** 어느 화면에도 보이지 않을 때의 이유 */
  hiddenReasons: string[]
  /** 알림 센터 list item 배지 */
  badges: { cities: string[]; services: string[] }
  /** 중요 공지가 아니면 null */
  popup: PopupJudgement | null
}

export interface Card {
  notice: Notice
  reason: string
  trace: string[]
}

export interface NotificationEntry extends Card {
  badges: { cities: string[]; services: string[] }
  read: boolean
}

export interface AppView {
  /** Ride 탭에 표시되는 서비스 CTA (사용자가 선택한 도시에서 이용 가능한 서비스) */
  ctaServices: Service[]
  guide: Card[]
  ride: Card[]
  /** 서비스 랜딩. 같은 서비스라도 지도에 보이는 도시마다 공지가 다르다. */
  landings: { service: Service; cities: { city: City; cards: Card[] }[] }[]
  notifications: NotificationEntry[]
  /** 팝업으로 뜨는 중요 공지 */
  popups: Evaluation[]
  /** 중요 공지이지만 팝업 조건을 충족하지 못한 공지 */
  popupMisses: Evaluation[]
  /** Guide/Ride/랜딩/알림 센터 어디에도 보이지 않는 공지 */
  hidden: Evaluation[]
  evaluations: Evaluation[]
}

// ── 기본 판정 ──────────────────────────────────────────────

/** "전체 + 차후 포함"이면 무엇이든 포함, 아니면 발행 시점 스냅샷에 있는 것만 포함 */
export function inScope(scope: Scope, id: Id): boolean {
  return (scope.all && scope.includeFuture) || scope.ids.includes(id)
}

export function inPeriod(period: Period, now: number): boolean {
  return period.start <= now && now <= period.end
}

export function periodsOverlap(a: Period, b: Period): boolean {
  return a.start <= b.end && b.start <= a.end
}

const byKo = (a: string, b: string) => a.localeCompare(b, 'ko')
const join = (names: string[]) => names.join(', ')

/** 중요 공지 우선, 그다음 게시 시작 최신순, 같으면 나중에 발행한 것 먼저 */
export function compareNotices(a: Notice, b: Notice): number {
  if (a.important !== b.important) return a.important ? -1 : 1
  if (a.period.start !== b.period.start) return b.period.start - a.period.start
  return b.publishedAt - a.publishedAt
}

/** 구성이 바뀌어 더는 유효하지 않은 국가/도시/예약을 사용자 상태에서 걸러낸다 */
export function sanitizeUser(user: UserState, config: ServiceConfig): UserState {
  const countryId = config.countries.some((c) => c.id === user.countryId) ? user.countryId : null
  const cityIds = user.cityIds.filter((id) =>
    config.cities.some((c) => c.id === id && c.countryId === countryId),
  )
  const reservations = user.reservations.filter(
    (r) =>
      config.cities.some((c) => c.id === r.cityId) &&
      config.services.some((s) => s.id === r.serviceId),
  )
  return { ...user, countryId, cityIds, reservations }
}

/** 사용자가 선택한 도시에서 이용 가능한 서비스 (Ride 탭 CTA) */
export function availableServices(config: ServiceConfig, user: UserState): Service[] {
  const offered = new Set(
    config.cities
      .filter((c) => c.countryId === user.countryId && user.cityIds.includes(c.id))
      .flatMap((c) => c.serviceIds),
  )
  return config.services.filter((s) => offered.has(s.id))
}

/** 공지 대상 도시들에서 지금 제공되는 서비스. "서비스 전체"의 기준 집합이다. */
export function servicesInNoticeCities(notice: Notice, config: ServiceConfig): Service[] {
  if (!notice.cities) return []
  const cityScope = notice.cities
  const offered = new Set(
    config.cities
      .filter((c) => inScope(notice.countries, c.countryId) && inScope(cityScope, c.id))
      .flatMap((c) => c.serviceIds),
  )
  return config.services.filter((s) => offered.has(s.id))
}

/**
 * 지금 시점에 "서비스 전체" 공지인지 (→ Ride 탭).
 * 서비스 scope가 공지 대상 도시들에서 현재 제공되는 서비스를 전부 덮을 때만 true.
 * 발행 때는 전체였어도, 이후 추가된 서비스가 scope에 없으면 더 이상 전체가 아니다.
 */
export function isServiceWide(notice: Notice, config: ServiceConfig): boolean {
  if (!notice.services) return false
  const scope = notice.services
  const current = servicesInNoticeCities(notice, config)
  if (current.length === 0) return scope.all
  return current.every((s) => inScope(scope, s.id))
}

// ── 공지 1건 판정 ──────────────────────────────────────────

export function evaluateNotice(notice: Notice, config: ServiceConfig, user: UserState): Evaluation {
  const trace: string[] = []
  const hiddenReasons: string[] = []
  const placements: Placement[] = []
  const badges = { cities: [] as string[], services: [] as string[] }

  // 1. 게시 기간
  const periodOk = inPeriod(notice.period, user.now)
  if (periodOk) trace.push('게시 기간 내')
  else hiddenReasons.push(user.now < notice.period.start ? '게시 기간 시작 전' : '게시 기간 종료')

  // 2. 국가
  const country = config.countries.find((c) => c.id === user.countryId)
  const countryOk = !!country && inScope(notice.countries, country.id)
  if (!country) hiddenReasons.push('사용자 앱 국가 미설정')
  else if (!countryOk) hiddenReasons.push(`사용자 앱 국가(${country.name})가 국가 scope에 없음`)
  else trace.push(`앱 국가(${country.name})가 국가 scope에 포함`)

  if (notice.type === 'app') {
    if (periodOk && countryOk) {
      trace.push('앱 공지는 도시 선택과 무관')
      placements.push(
        { surface: 'guide', reason: '앱 공지 → Guide 탭' },
        { surface: 'notification', reason: '유효한 앱 공지 → 알림 센터' },
      )
    }
  } else {
    const cityScope = notice.cities!
    const serviceScope = notice.services!
    const userCities = config.cities.filter(
      (c) => c.countryId === user.countryId && user.cityIds.includes(c.id),
    )
    let matchedServices: Service[] = []
    /** 선택한 도시 중 공지 대상 서비스를 실제 제공하는 도시 */
    let servedCities: City[] = []
    const serviceWide = isServiceWide(notice, config)

    // 3. 도시, 4. 서비스 — 국가가 맞을 때만 의미가 있다
    if (countryOk) {
      const matchedCities = userCities.filter((c) => inScope(cityScope, c.id))
      if (userCities.length === 0) {
        hiddenReasons.push('사용자가 도시를 선택하지 않음 (이동 서비스 공지는 도시 선택 필요)')
      } else if (matchedCities.length === 0) {
        hiddenReasons.push(
          `선택한 도시(${join(userCities.map((c) => c.name))})가 도시 scope에 없음`,
        )
      } else {
        const cityNames = matchedCities.map((c) => c.name).sort(byKo)
        trace.push(`선택한 도시 중 ${join(cityNames)}이(가) 도시 scope에 포함`)
        // 도시마다 따로 본다: 공지 대상 서비스를 실제로 제공하는 도시만 공지 대상이다.
        // (인천·서울 + 공항 셔틀 공지라도, 공항 셔틀이 없는 서울은 대상이 아님)
        servedCities = matchedCities.filter((c) =>
          c.serviceIds.some((id) => inScope(serviceScope, id)),
        )
        const offered = new Set(
          servedCities.flatMap((c) => c.serviceIds.filter((id) => inScope(serviceScope, id))),
        )
        matchedServices = config.services.filter((s) => offered.has(s.id))
        if (matchedServices.length === 0) {
          hiddenReasons.push(`선택한 도시(${join(cityNames)})에 해당 서비스 미제공`)
        } else {
          const servedNames = servedCities.map((c) => c.name).sort(byKo)
          const unserved = cityNames.filter((name) => !servedNames.includes(name))
          if (unserved.length > 0) {
            trace.push(`${join(unserved)}에는 대상 서비스가 없어 제외`)
          }
          badges.cities = servedNames
          const serviceNames = matchedServices.map((s) => s.name).sort(byKo)
          trace.push(`${join(servedNames)} 제공 서비스 ∩ 서비스 scope = ${join(serviceNames)}`)
          if (!serviceWide) badges.services = serviceNames
        }
      }
    }

    // 5. 위치 분기
    if (hiddenReasons.length === 0) {
      if (serviceWide) {
        trace.push('서비스 scope가 대상 도시의 현재 제공 서비스를 모두 포함')
        placements.push({ surface: 'ride', reason: '서비스 전체 scope → Ride 탭' })
      } else {
        // "전체 선택"으로 발행했지만 이후 추가된 서비스 때문에 더는 전체가 아닌 경우
        const outgrown = serviceScope.all
        if (outgrown) {
          const added = servicesInNoticeCities(notice, config).filter(
            (s) => !inScope(serviceScope, s.id),
          )
          trace.push(
            `발행 후 추가된 서비스(${join(added.map((s) => s.name))})가 scope에 없어 더 이상 서비스 전체가 아님`,
          )
        }
        // 중요 공지는 서비스 전체가 아니어도 Ride 탭에 함께 표시한다 (랜딩 표시는 그대로)
        if (notice.important) {
          placements.push({ surface: 'ride', reason: '중요 이동 서비스 공지 → Ride 탭' })
        }
        for (const s of matchedServices) {
          placements.push({
            surface: 'landing',
            serviceId: s.id,
            cityIds: servedCities
              .filter((c) => c.serviceIds.includes(s.id) && inScope(serviceScope, s.id))
              .map((c) => c.id),
            reason: outgrown
              ? `신규 서비스 추가로 서비스 전체 아님 → ${s.name} 랜딩`
              : `${s.name} 지정 → ${s.name} 랜딩`,
          })
        }
      }
      placements.push({ surface: 'notification', reason: '유효한 이동 서비스 공지 → 알림 센터' })
    }
  }

  return {
    notice,
    placements,
    trace,
    hiddenReasons,
    badges,
    popup: notice.important ? judgePopup(notice, config, user, periodOk, countryOk) : null,
  }
}

/**
 * 6. 팝업 판정.
 * 이동 서비스 공지는 사용자가 "선택한" 도시는 보지 않고, 예약/이용 건의 도시·서비스·기간을 본다.
 */
function judgePopup(
  notice: Notice,
  config: ServiceConfig,
  user: UserState,
  periodOk: boolean,
  countryOk: boolean,
): PopupJudgement {
  const checklist: CheckItem[] = [
    { label: '게시 기간 내', ok: periodOk },
    { label: '앱 국가가 국가 scope에 포함', ok: countryOk },
  ]
  let reason = '중요 앱 공지 → 앱 실행 시 팝업'

  if (notice.type === 'mobility') {
    // 서비스 → 예약 도시 → 기간 순으로 좁혀 가며, 각 단계에 남은 예약을 체크리스트에 보여준다
    const targeted = user.reservations.filter((r) => inScope(notice.services!, r.serviceId))
    const inCity = targeted.filter((r) => inScope(notice.cities!, r.cityId))
    const overlapping = inCity.filter((r) => periodsOverlap(r, notice.period))
    const describe = (reservations: Reservation[]) => {
      if (reservations.length === 0) return undefined
      const labels = reservations.map((r) => {
        const city = config.cities.find((c) => c.id === r.cityId)?.name ?? r.cityId
        const service = config.services.find((s) => s.id === r.serviceId)?.name ?? r.serviceId
        return `${city} ${service}`
      })
      return join([...new Set(labels)])
    }
    checklist.push(
      { label: '대상 서비스 예약/이용 중', ok: targeted.length > 0, detail: describe(targeted) },
      {
        label: '예약/이용 도시가 도시 scope에 포함',
        ok: inCity.length > 0,
        detail: describe(inCity),
      },
      {
        label: '예약/이용일이 게시 기간과 겹침',
        ok: overlapping.length > 0,
        detail: describe(overlapping),
      },
    )
    reason = '중요 공지 + 대상 도시·서비스 예약/이용 + 기간 겹침 → 팝업'
  }

  checklist.push({
    label: '"다시 보지 않기" 미선택',
    ok: !user.dismissedPopupIds.includes(notice.id),
  })

  return { show: checklist.every((c) => c.ok), reason, checklist }
}

// ── 화면별로 묶기 ──────────────────────────────────────────

export function evaluateAll(notices: Notice[], config: ServiceConfig, user: UserState): AppView {
  const evaluations = [...notices]
    .sort(compareNotices)
    .map((n) => evaluateNotice(n, config, user))

  const cardsFor = (surface: Surface, serviceId?: Id): Card[] =>
    evaluations.flatMap((e) =>
      e.placements
        .filter((p) => p.surface === surface && p.serviceId === serviceId)
        .map((p) => ({ notice: e.notice, reason: p.reason, trace: e.trace })),
    )

  const ctaServices = availableServices(config, user)

  return {
    ctaServices,
    guide: cardsFor('guide'),
    ride: cardsFor('ride'),
    landings: ctaServices.map((service) => ({
      service,
      cities: config.cities
        .filter(
          (c) =>
            c.countryId === user.countryId &&
            user.cityIds.includes(c.id) &&
            c.serviceIds.includes(service.id),
        )
        .map((city) => ({
          city,
          cards: evaluations.flatMap((e) =>
            e.placements
              .filter(
                (p) =>
                  p.surface === 'landing' &&
                  p.serviceId === service.id &&
                  p.cityIds?.includes(city.id),
              )
              .map((p) => ({ notice: e.notice, reason: p.reason, trace: e.trace })),
          ),
        })),
    })),
    notifications: evaluations.flatMap((e) =>
      e.placements
        .filter((p) => p.surface === 'notification')
        .map((p) => ({
          notice: e.notice,
          reason: p.reason,
          trace: e.trace,
          badges: e.badges,
          read: user.readNoticeIds.includes(e.notice.id),
        })),
    ),
    popups: evaluations.filter((e) => e.popup?.show),
    popupMisses: evaluations.filter((e) => e.popup && !e.popup.show),
    hidden: evaluations.filter((e) => e.placements.length === 0),
    evaluations,
  }
}

/** 공지 1건이 현재 어디에 보이는지 짧은 라벨 목록으로 (발행 목록 표시용) */
export function surfaceLabels(evaluation: Evaluation, config: ServiceConfig): string[] {
  const labels = evaluation.placements.map((p) => {
    if (p.surface === 'guide') return 'Guide 탭'
    if (p.surface === 'ride') return 'Ride 탭'
    if (p.surface === 'notification') return '알림 센터'
    const name = config.services.find((s) => s.id === p.serviceId)?.name ?? p.serviceId
    const cities = (p.cityIds ?? []).map((id) => config.cities.find((c) => c.id === id)?.name ?? id)
    return `${name} 랜딩(${cities.join('·')})`
  })
  if (evaluation.popup?.show) labels.push('팝업')
  return labels
}
