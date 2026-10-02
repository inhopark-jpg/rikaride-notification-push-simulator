import { describe, expect, it } from 'vitest'
import { addCity, addCountry, addService, cityId, configFromSpec, countryId, serviceId } from './config'
import { buildPresets } from './presets'
import { buildNotice, cityOptions, emptyDraft, normalizeDraft, serviceOptions } from './publish'
import type { NoticeDraft, ScopeDraft } from './publish'
import type { Notice, ServiceConfig, UserState } from './types'
import { evaluateAll, evaluateNotice, inScope, isServiceWide, periodsOverlap } from './visibility'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const NOW = Date.UTC(2026, 8, 30, 3, 0)

const config = configFromSpec([
  [
    '한국',
    [
      ['서울', ['호출버스', '광역 호출버스', '전담 기사', '공항 셔틀']],
      ['부산', ['호출버스', '공항 셔틀']],
      ['인천', ['공항 셔틀']],
    ],
  ],
  ['일본', [['오사카', ['호출버스', '전담 기사']]]],
])

const ALL: ScopeDraft = { all: true, includeFuture: false, ids: [] }
const ALL_FUTURE: ScopeDraft = { all: true, includeFuture: true, ids: [] }
const pick = (ids: string[]): ScopeDraft => ({ all: false, includeFuture: false, ids })
const co = (...names: string[]) => pick(names.map(countryId))
const ci = (...names: string[]) => pick(names.map(cityId))
const sv = (...names: string[]) => pick(names.map(serviceId))

let seq = 0
function publish(draft: Partial<NoticeDraft>, at: ServiceConfig = config): Notice {
  seq += 1
  return buildNotice({ ...emptyDraft(NOW), start: NOW - DAY, end: NOW + DAY, ...draft }, at, {
    id: `n${seq}`,
    publishedAt: seq,
  })
}

function user(partial: Partial<UserState> = {}): UserState {
  return {
    countryId: countryId('한국'),
    cityIds: [],
    reservations: [],
    now: NOW,
    dismissedPopupIds: [],
    readNoticeIds: [],
    ...partial,
  }
}

const surfaces = (n: Notice, u: UserState, c: ServiceConfig = config) =>
  evaluateNotice(n, c, u).placements.map((p) =>
    p.serviceId ? `${p.surface}:${p.serviceId}` : p.surface,
  )

describe('기본 판정', () => {
  it('inScope: 스냅샷에 있거나 전체+차후 포함이면 포함', () => {
    expect(inScope({ ids: ['a'], all: false, includeFuture: false }, 'a')).toBe(true)
    expect(inScope({ ids: ['a'], all: true, includeFuture: false }, 'b')).toBe(false)
    expect(inScope({ ids: ['a'], all: true, includeFuture: true }, 'b')).toBe(true)
  })

  it('periodsOverlap: 경계가 맞닿아도 겹침', () => {
    expect(periodsOverlap({ start: 0, end: 10 }, { start: 10, end: 20 })).toBe(true)
    expect(periodsOverlap({ start: 0, end: 10 }, { start: 11, end: 20 })).toBe(false)
  })
})

describe('앱 공지', () => {
  const notice = publish({ type: 'app', countries: co('한국') })

  it('도시를 선택하지 않아도 Guide 탭과 알림 센터에 노출', () => {
    expect(surfaces(notice, user())).toEqual(['guide', 'notification'])
  })

  it('앱 국가가 scope에 없으면 미노출', () => {
    const e = evaluateNotice(notice, config, user({ countryId: countryId('일본') }))
    expect(e.placements).toEqual([])
    expect(e.hiddenReasons).toEqual(['사용자 앱 국가(일본)가 국가 scope에 없음'])
  })

  it('게시 기간 밖이면 미노출', () => {
    expect(evaluateNotice(notice, config, user({ now: NOW - 2 * DAY })).hiddenReasons).toEqual([
      '게시 기간 시작 전',
    ])
    expect(evaluateNotice(notice, config, user({ now: NOW + 2 * DAY })).hiddenReasons).toEqual([
      '게시 기간 종료',
    ])
  })

  it('복수 국가 선택', () => {
    const multi = publish({ type: 'app', countries: co('한국', '일본') })
    expect(surfaces(multi, user({ countryId: countryId('일본') }))).toEqual([
      'guide',
      'notification',
    ])
  })

  it('중요 공지는 팝업, "다시 보지 않기" 후에는 미표출', () => {
    const important = publish({ type: 'app', important: true, countries: co('한국') })
    expect(evaluateNotice(important, config, user()).popup?.show).toBe(true)
    expect(
      evaluateNotice(important, config, user({ dismissedPopupIds: [important.id] })).popup?.show,
    ).toBe(false)
    expect(evaluateNotice(notice, config, user()).popup).toBeNull()
  })
})

describe('이동 서비스 공지: 노출 위치', () => {
  const busNotice = publish({
    type: 'mobility',
    countries: co('한국'),
    cities: ci('서울', '부산'),
    services: sv('호출버스'),
  })

  it('특정 서비스 지정 → 해당 서비스 랜딩과 알림 센터', () => {
    expect(surfaces(busNotice, user({ cityIds: [cityId('서울')] }))).toEqual([
      `landing:${serviceId('호출버스')}`,
      'notification',
    ])
  })

  it('복수 서비스 지정 → 랜딩마다 각각, 알림 센터에는 1건', () => {
    const multi = publish({
      type: 'mobility',
      countries: co('한국'),
      cities: ci('서울'),
      services: sv('호출버스', '전담 기사'),
    })
    expect(surfaces(multi, user({ cityIds: [cityId('서울')] }))).toEqual([
      `landing:${serviceId('호출버스')}`,
      `landing:${serviceId('전담 기사')}`,
      'notification',
    ])
    const view = evaluateAll([multi], config, user({ cityIds: [cityId('서울')] }))
    expect(view.notifications).toHaveLength(1)
  })

  it('도시를 선택하지 않으면 미노출', () => {
    const e = evaluateNotice(busNotice, config, user())
    expect(e.placements).toEqual([])
    expect(e.hiddenReasons[0]).toContain('도시를 선택하지 않음')
  })

  it('선택한 도시가 도시 scope에 없으면 미노출', () => {
    const e = evaluateNotice(busNotice, config, user({ cityIds: [cityId('인천')] }))
    expect(e.hiddenReasons).toEqual(['선택한 도시(인천)가 도시 scope에 없음'])
  })

  it('선택한 도시에 해당 서비스가 없으면 미노출', () => {
    // 서울·인천 대상 호출버스 공지인데, 사용자는 호출버스가 없는 인천만 선택
    const notice = publish({
      type: 'mobility',
      countries: co('한국'),
      cities: ci('서울', '인천'),
      services: sv('호출버스'),
    })
    const e = evaluateNotice(notice, config, user({ cityIds: [cityId('인천')] }))
    expect(e.hiddenReasons).toEqual(['선택한 도시(인천)에 해당 서비스 미제공'])
  })

  it('다른 국가 사용자에게는 미노출', () => {
    const e = evaluateNotice(
      busNotice,
      config,
      user({ countryId: countryId('일본'), cityIds: [cityId('오사카')] }),
    )
    expect(e.placements).toEqual([])
  })
})

describe('이동 서비스 공지: 서비스 전체 판정', () => {
  const seoul = user({ cityIds: [cityId('서울')] })

  it('"전체 선택" 체크 → Ride 탭', () => {
    const notice = publish({ type: 'mobility', countries: co('한국'), cities: ci('서울'), services: ALL })
    expect(isServiceWide(notice, config)).toBe(true)
    expect(surfaces(notice, seoul)).toEqual(['ride', 'notification'])
  })

  it('선택 가능한 서비스를 전부 개별 선택해도 서비스 전체로 취급', () => {
    const notice = publish({
      type: 'mobility',
      countries: co('한국'),
      cities: ci('부산'),
      services: sv('호출버스', '공항 셔틀'), // 부산 제공 서비스 전부
    })
    expect(isServiceWide(notice, config)).toBe(true)
    expect(surfaces(notice, user({ cityIds: [cityId('부산')] }))).toEqual(['ride', 'notification'])
  })

  it('중요 공지는 특정 서비스 지정이어도 Ride 탭과 해당 랜딩에 모두 노출', () => {
    const notice = publish({
      type: 'mobility',
      important: true,
      countries: co('한국'),
      cities: ci('서울'),
      services: sv('호출버스'),
    })
    expect(surfaces(notice, seoul)).toEqual([
      'ride',
      `landing:${serviceId('호출버스')}`,
      'notification',
    ])
    // 사용자에게 유효하지 않으면(도시 미선택) Ride 탭에도 없다
    expect(surfaces(notice, user())).toEqual([])
  })

  it('서비스 랜딩은 지도에 보이는 도시별로 공지가 다르다', () => {
    const notice = publish({
      type: 'mobility',
      countries: co('한국'),
      cities: ci('부산'),
      services: sv('호출버스'),
    })
    const v = evaluateAll([notice], config, user({ cityIds: [cityId('서울'), cityId('부산')] }))
    const bus = v.landings.find((l) => l.service.id === serviceId('호출버스'))!
    expect(bus.cities.map((c) => [c.city.name, c.cards.length])).toEqual([
      ['서울', 0],
      ['부산', 1],
    ])
  })

  it('일부만 선택하면 서비스 랜딩으로', () => {
    const notice = publish({
      type: 'mobility',
      countries: co('한국'),
      cities: ci('서울'),
      services: sv('호출버스', '전담 기사'),
    })
    expect(isServiceWide(notice, config)).toBe(false)
  })

  it('서비스 전체라도 사용자가 그 도시를 선택하지 않았으면 Ride 탭에 미노출', () => {
    const notice = publish({ type: 'mobility', countries: co('한국'), cities: ci('부산'), services: ALL })
    expect(surfaces(notice, seoul)).toEqual([])
  })

  it('전체 선택(차후 미포함): 신규 서비스가 추가되면 Ride 탭에서 각 서비스 랜딩으로 바뀐다', () => {
    const notice = publish({ type: 'mobility', countries: co('한국'), cities: ci('부산'), services: ALL })
    const busan = user({ cityIds: [cityId('부산')] })
    expect(surfaces(notice, busan)).toEqual(['ride', 'notification'])

    const later = addService(config, '관광 택시', true)
    expect(isServiceWide(notice, later)).toBe(false)
    // 기존 서비스 랜딩에만 보이고, 신규 서비스 랜딩에는 없다
    expect(surfaces(notice, busan, later)).toEqual([
      `landing:${serviceId('호출버스')}`,
      `landing:${serviceId('공항 셔틀')}`,
      'notification',
    ])
    // 알림 센터 배지도 서비스 전체가 아니므로 서비스 배지가 붙는다
    expect(evaluateNotice(notice, later, busan).badges.services).toEqual(['공항 셔틀', '호출버스'])
  })

  it('전체 선택 + 차후 포함: 신규 서비스가 추가돼도 Ride 탭 유지', () => {
    const notice = publish({
      type: 'mobility',
      countries: co('한국'),
      cities: ci('부산'),
      services: ALL_FUTURE,
    })
    const later = addService(config, '관광 택시', true)
    expect(surfaces(notice, user({ cityIds: [cityId('부산')] }), later)).toEqual([
      'ride',
      'notification',
    ])
  })

  it('전부 개별 선택한 공지도 신규 서비스가 추가되면 랜딩으로 바뀐다', () => {
    const notice = publish({
      type: 'mobility',
      countries: co('한국'),
      cities: ci('부산'),
      services: sv('호출버스', '공항 셔틀'),
    })
    const later = addService(config, '관광 택시', true)
    expect(surfaces(notice, user({ cityIds: [cityId('부산')] }), later)).toEqual([
      `landing:${serviceId('호출버스')}`,
      `landing:${serviceId('공항 셔틀')}`,
      'notification',
    ])
  })

  it('공지 대상 도시에서 제공하지 않는 신규 서비스는 서비스 전체 여부에 영향이 없다', () => {
    const notice = publish({ type: 'mobility', countries: co('한국'), cities: ci('부산'), services: ALL })
    // 관광 택시는 서울에서만 제공
    let later = addService(config, '관광 택시')
    later = {
      ...later,
      cities: later.cities.map((c) =>
        c.id === cityId('서울') ? { ...c, serviceIds: [...c.serviceIds, serviceId('관광 택시')] } : c,
      ),
    }
    expect(surfaces(notice, user({ cityIds: [cityId('부산')] }), later)).toEqual([
      'ride',
      'notification',
    ])
  })
})

describe('전체 선택 + 차후 추가 포함', () => {
  it('국가: 차후 포함이면 신규 국가에도 노출, 아니면 스냅샷만', () => {
    const future = publish({ type: 'app', countries: ALL_FUTURE })
    const snapshot = publish({ type: 'app', countries: ALL })
    expect(snapshot.countries.ids).toEqual([countryId('한국'), countryId('일본')])

    const later = addCountry(config, '태국')
    const thai = user({ countryId: countryId('태국') })
    expect(surfaces(future, thai, later)).toEqual(['guide', 'notification'])
    expect(surfaces(snapshot, thai, later)).toEqual([])
    // 기존 국가에는 둘 다 노출
    expect(surfaces(snapshot, user(), later)).toEqual(['guide', 'notification'])
  })

  it('도시: 차후 포함이면 신규 도시에도 노출', () => {
    const base = { type: 'mobility' as const, countries: co('한국'), services: ALL_FUTURE }
    const future = publish({ ...base, cities: ALL_FUTURE })
    const snapshot = publish({ ...base, cities: ALL })

    const later = addCity(config, countryId('한국'), '대구', [serviceId('호출버스')])
    const daegu = user({ cityIds: [cityId('대구')] })
    expect(surfaces(future, daegu, later)).toEqual(['ride', 'notification'])
    expect(surfaces(snapshot, daegu, later)).toEqual([])
  })

  it('서비스: 차후 포함이면 신규 서비스만 있는 도시에도 노출', () => {
    const base = { type: 'mobility' as const, countries: co('한국'), cities: ALL_FUTURE }
    const future = publish({ ...base, services: ALL_FUTURE })
    const snapshot = publish({ ...base, services: ALL })

    let later = addService(config, '관광 택시')
    later = addCity(later, countryId('한국'), '제주', [serviceId('관광 택시')])
    const jeju = user({ cityIds: [cityId('제주')] })
    expect(surfaces(future, jeju, later)).toEqual(['ride', 'notification'])
    expect(evaluateNotice(snapshot, later, jeju).hiddenReasons).toEqual([
      '선택한 도시(제주)에 해당 서비스 미제공',
    ])
  })

  it('신규 국가의 도시는 도시 scope도 차후 포함이어야 노출', () => {
    const notice = publish({
      type: 'mobility',
      countries: ALL_FUTURE,
      cities: ALL,
      services: ALL_FUTURE,
    })
    let later = addCountry(config, '태국')
    later = addCity(later, countryId('태국'), '방콕', [serviceId('호출버스')])
    const e = evaluateNotice(
      notice,
      later,
      user({ countryId: countryId('태국'), cityIds: [cityId('방콕')] }),
    )
    expect(e.hiddenReasons).toEqual(['선택한 도시(방콕)가 도시 scope에 없음'])
  })
})

describe('중요 이동 서비스 공지 팝업', () => {
  const notice = publish({
    type: 'mobility',
    important: true,
    countries: co('한국'),
    cities: ci('서울'),
    services: sv('호출버스'),
  })
  const reservation = (service: string, start: number, end: number, city = '서울') => ({
    id: `${city}-${service}-${start}`,
    cityId: cityId(city),
    serviceId: serviceId(service),
    start,
    end,
  })
  const checks = (u: UserState) =>
    Object.fromEntries(
      evaluateNotice(notice, config, u).popup!.checklist.map((c) => [c.label, c.ok]),
    )

  it('대상 서비스를 예약했고 기간이 겹치면 팝업', () => {
    const u = user({
      cityIds: [cityId('서울')],
      reservations: [reservation('호출버스', NOW + HOUR, NOW + 2 * HOUR)],
    })
    expect(evaluateNotice(notice, config, u).popup?.show).toBe(true)
  })

  it('예약이 없으면 팝업 없음 (공지 자체는 랜딩에 노출)', () => {
    const u = user({ cityIds: [cityId('서울')] })
    const e = evaluateNotice(notice, config, u)
    expect(e.popup?.show).toBe(false)
    expect(e.placements.length).toBeGreaterThan(0)
    expect(checks(u)['대상 서비스 예약/이용 중']).toBe(false)
  })

  it('다른 서비스 예약이면 팝업 없음', () => {
    const u = user({ reservations: [reservation('전담 기사', NOW, NOW + HOUR)] })
    expect(checks(u)['대상 서비스 예약/이용 중']).toBe(false)
    expect(evaluateNotice(notice, config, u).popup?.show).toBe(false)
  })

  it('예약 기간이 게시 기간과 겹치지 않으면 팝업 없음', () => {
    const u = user({ reservations: [reservation('호출버스', NOW + 3 * DAY, NOW + 4 * DAY)] })
    expect(checks(u)).toMatchObject({
      '대상 서비스 예약/이용 중': true,
      '예약/이용일이 게시 기간과 겹침': false,
    })
    expect(evaluateNotice(notice, config, u).popup?.show).toBe(false)
  })

  it('서비스는 같아도 예약 도시가 도시 scope에 없으면 팝업 없음', () => {
    // 서울 호출버스 공지, 사용자는 부산 호출버스 예약
    const u = user({ reservations: [reservation('호출버스', NOW, NOW + HOUR, '부산')] })
    expect(checks(u)).toMatchObject({
      '대상 서비스 예약/이용 중': true,
      '예약/이용 도시가 도시 scope에 포함': false,
      '예약/이용일이 게시 기간과 겹침': false,
    })
    expect(evaluateNotice(notice, config, u).popup?.show).toBe(false)
  })

  it('도시·서비스·기간이 한 예약에서 모두 맞아야 한다', () => {
    // 부산 호출버스는 기간이 겹치고, 서울 호출버스는 기간이 안 겹침
    const u = user({
      reservations: [
        reservation('호출버스', NOW, NOW + HOUR, '부산'),
        reservation('호출버스', NOW + 3 * DAY, NOW + 4 * DAY, '서울'),
      ],
    })
    expect(checks(u)).toMatchObject({
      '예약/이용 도시가 도시 scope에 포함': true,
      '예약/이용일이 게시 기간과 겹침': false,
    })
  })

  it('도시 scope가 전체+차후 포함이면 신규 도시 예약에도 팝업', () => {
    const wide = publish({
      type: 'mobility',
      important: true,
      countries: co('한국'),
      cities: ALL_FUTURE,
      services: sv('호출버스'),
    })
    const later = addCity(config, countryId('한국'), '대구', [serviceId('호출버스')])
    const u = user({ reservations: [reservation('호출버스', NOW, NOW + HOUR, '대구')] })
    expect(evaluateNotice(wide, later, u).popup?.show).toBe(true)
  })

  it('사용자가 도시를 선택하지 않았어도 예약이 맞으면 팝업 (알림 센터에는 없음)', () => {
    const u = user({ reservations: [reservation('호출버스', NOW, NOW + HOUR)] })
    const e = evaluateNotice(notice, config, u)
    expect(e.placements).toEqual([])
    expect(e.popup?.show).toBe(true)
  })

  it('앱 국가가 scope에 없으면 예약이 있어도 팝업 없음', () => {
    const u = user({
      countryId: countryId('일본'),
      reservations: [reservation('호출버스', NOW, NOW + HOUR)],
    })
    expect(evaluateNotice(notice, config, u).popup?.show).toBe(false)
  })

  it('게시 기간이 끝나면 팝업 없음', () => {
    const u = user({
      now: NOW + 2 * DAY,
      reservations: [reservation('호출버스', NOW, NOW + HOUR)],
    })
    expect(evaluateNotice(notice, config, u).popup?.show).toBe(false)
  })

  it('"다시 보지 않기" 후에는 팝업 없음', () => {
    const u = user({
      reservations: [reservation('호출버스', NOW, NOW + HOUR)],
      dismissedPopupIds: [notice.id],
    })
    expect(evaluateNotice(notice, config, u).popup?.show).toBe(false)
  })
})

describe('알림 센터', () => {
  it('도시 배지는 사용자가 선택한 도시만 가나다순, 서비스 배지는 그 뒤에 가나다순', () => {
    const notice = publish({
      type: 'mobility',
      countries: co('한국'),
      cities: ci('인천', '서울', '부산'),
      services: sv('호출버스', '공항 셔틀'),
    })
    const e = evaluateNotice(notice, config, user({ cityIds: [cityId('인천'), cityId('부산')] }))
    expect(e.badges).toEqual({ cities: ['부산', '인천'], services: ['공항 셔틀', '호출버스'] })
  })

  it('공지 대상 서비스를 제공하지 않는 도시는 도시 배지에서 빠진다', () => {
    // 인천에는 호출버스가 없다. 발행 폼에서는 서울·인천 선택 후 호출버스를 고를 수 있다.
    expect(serviceOptions(config, co('한국'), ci('서울', '인천')).map((s) => s.name)).toContain(
      '호출버스',
    )
    const notice = publish({
      type: 'mobility',
      countries: co('한국'),
      cities: ci('서울', '인천'),
      services: sv('호출버스'),
    })
    const e = evaluateNotice(notice, config, user({ cityIds: [cityId('서울'), cityId('인천')] }))
    expect(e.badges).toEqual({ cities: ['서울'], services: ['호출버스'] })
    expect(e.trace).toContain('인천에는 대상 서비스가 없어 제외')
  })

  it('서비스 전체 공지는 도시 배지만, 앱 공지는 배지 없음', () => {
    const wide = publish({ type: 'mobility', countries: co('한국'), cities: ci('서울'), services: ALL })
    const app = publish({ type: 'app', countries: co('한국') })
    const u = user({ cityIds: [cityId('서울')] })
    expect(evaluateNotice(wide, config, u).badges).toEqual({ cities: ['서울'], services: [] })
    expect(evaluateNotice(app, config, u).badges).toEqual({ cities: [], services: [] })
  })

  it('중요 공지가 최상단, 그다음 게시 시작 최신순', () => {
    const old = publish({ type: 'app', title: 'old', countries: co('한국'), start: NOW - 3 * DAY })
    const recent = publish({ type: 'app', title: 'recent', countries: co('한국'), start: NOW - HOUR })
    const important = publish({
      type: 'app',
      title: 'important',
      important: true,
      countries: co('한국'),
      start: NOW - 5 * DAY,
    })
    const view = evaluateAll([old, recent, important], config, user())
    expect(view.notifications.map((n) => n.notice.title)).toEqual(['important', 'recent', 'old'])
  })

  it('미노출 공지는 hidden 목록에 이유와 함께 모인다', () => {
    const jp = publish({ type: 'app', countries: co('일본') })
    const kr = publish({ type: 'app', countries: co('한국') })
    const view = evaluateAll([jp, kr], config, user())
    expect(view.hidden.map((e) => e.notice.id)).toEqual([jp.id])
    expect(view.guide.map((c) => c.notice.id)).toEqual([kr.id])
  })
})

describe('발행 폼의 계층 의존', () => {
  it('국가 선택에 따라 도시 옵션이, 도시 선택에 따라 서비스 옵션이 좁혀진다', () => {
    expect(cityOptions(config, co('일본')).map((c) => c.name)).toEqual(['오사카'])
    expect(cityOptions(config, ALL)).toHaveLength(4)
    expect(serviceOptions(config, co('한국'), ci('부산')).map((s) => s.name)).toEqual([
      '호출버스',
      '공항 셔틀',
    ])
  })

  it('상위 scope가 바뀌면 더는 선택할 수 없는 하위 항목이 제거된다', () => {
    const draft = normalizeDraft(
      {
        ...emptyDraft(NOW, 'mobility'),
        countries: co('일본'),
        cities: ci('서울', '오사카'),
        services: sv('공항 셔틀', '호출버스'),
      },
      config,
    )
    expect(draft.cities.ids).toEqual([cityId('오사카')])
    expect(draft.services.ids).toEqual([serviceId('호출버스')])
  })

  it('제목/본문을 비우면 placeholder 문구로 발행된다', () => {
    const notice = publish({ type: 'app', countries: co('한국') })
    expect(notice.title).toBe('[시범] 앱 공지')
    expect(notice.body).not.toBe('')
  })
})

describe('프리셋 시나리오', () => {
  const presets = Object.fromEntries(buildPresets(NOW).map((p) => [p.id, p]))
  const view = (id: string) => evaluateAll(presets[id].notices, presets[id].config, presets[id].user)

  it('한국 전체 앱 공지: Guide 2건, 팝업 1건, 미노출 2건', () => {
    const v = view('app-korea')
    expect(v.guide).toHaveLength(2)
    expect(v.popups).toHaveLength(1)
    expect(v.hidden).toHaveLength(2)
  })

  it('인천 호출버스 공지: 호출버스·공항 셔틀 랜딩에 각각 노출, Ride 탭에는 없음', () => {
    const v = view('incheon-bus')
    expect(v.ride).toHaveLength(0)
    const landing = (name: string) =>
      v.landings.find((l) => l.service.name === name)?.cities[0]?.cards
    expect(landing('호출버스')).toHaveLength(2)
    expect(landing('공항 셔틀')).toHaveLength(1)
    expect(v.notifications).toHaveLength(2)
    expect(v.hidden.map((e) => e.hiddenReasons[0])).toEqual([
      '선택한 도시(인천)가 도시 scope에 없음',
      '선택한 도시(인천)에 해당 서비스 미제공',
    ])
  })

  it('중요 공지 팝업과 예약 기간: 기간이 겹치는 1건만 팝업', () => {
    const v = view('popup-overlap')
    expect(v.popups.map((e) => e.notice.title)).toEqual(['서울 호출버스 노선 긴급 변경'])
    expect(v.popupMisses).toHaveLength(3)
  })

  it('도시 미선택 + 예약: 팝업만 뜨고 알림 센터에는 앱 공지만', () => {
    const v = view('no-city')
    expect(v.popups).toHaveLength(1)
    expect(v.notifications.map((n) => n.notice.type)).toEqual(['app'])
  })
})
