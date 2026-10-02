export type Id = string

// ── 열 1. 서비스 Configuration ──────────────────────────────
export interface Country {
  id: Id
  name: string
}

export interface City {
  id: Id
  name: string
  countryId: Id
  /** 이 도시에서 제공되는 서비스 */
  serviceIds: Id[]
}

export interface Service {
  id: Id
  name: string
}

export interface ServiceConfig {
  countries: Country[]
  cities: City[]
  services: Service[]
}

// ── 열 2. 공지 ─────────────────────────────────────────────
export interface Period {
  start: number
  end: number
}

/**
 * scope 한 계층(국가/도시/서비스).
 * 발행 시점 스냅샷(ids)과 "전체 + 차후 포함" 플래그를 분리해서 저장한다.
 */
export interface Scope {
  /** 발행 시점에 포함된 항목. "전체 선택"이어도 그 시점의 목록을 그대로 저장한다. */
  ids: Id[]
  /** "전체 선택" 체크 여부 */
  all: boolean
  /** "차후 추가되는 항목 포함" 체크 여부 (all일 때만 의미가 있다) */
  includeFuture: boolean
}

export type NoticeType = 'app' | 'mobility'

export interface Notice {
  id: Id
  type: NoticeType
  title: string
  body: string
  important: boolean
  period: Period
  publishedAt: number
  countries: Scope
  /** 이동 서비스 공지만 */
  cities?: Scope
  /** 이동 서비스 공지만. "서비스 전체" 여부는 저장하지 않고 판정 시점에 계산한다. */
  services?: Scope
}

// ── 열 3. 가상 사용자 ───────────────────────────────────────
export interface Reservation {
  id: Id
  /** 예약/이용하는 서비스가 속한 도시 */
  cityId: Id
  serviceId: Id
  start: number
  end: number
}

export interface UserState {
  countryId: Id | null
  cityIds: Id[]
  reservations: Reservation[]
  /** 가상 현재 시각 */
  now: number
  /** 팝업에서 "다시 보지 않기"를 누른 공지 */
  dismissedPopupIds: Id[]
  /** 알림 센터에서 읽은 공지 */
  readNoticeIds: Id[]
  /** 화면에서 x로 닫은 공지 카드. "<화면>:<공지 id>" 형식 (예: "guide:n1", "landing:sv-호출버스:n1") */
  closedCards?: string[]
}
