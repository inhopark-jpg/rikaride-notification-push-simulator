/**
 * 프리셋 시나리오. 버튼 하나로 열 1~3과 발행 공지를 한꺼번에 채운다.
 */
import { cityId, configFromSpec, countryId, serviceId } from './config'
import { dayRange } from './format'
import { buildNotice, emptyDraft } from './publish'
import type { NoticeDraft, ScopeDraft } from './publish'
import type { Notice, ServiceConfig, UserState } from './types'

export interface Preset {
  id: string
  label: string
  description: string
  config: ServiceConfig
  notices: Notice[]
  user: UserState
}

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

const ALL: ScopeDraft = { all: true, includeFuture: false, ids: [] }
const ALL_FUTURE: ScopeDraft = { all: true, includeFuture: true, ids: [] }
const pick = (ids: string[]): ScopeDraft => ({ all: false, includeFuture: false, ids })
const countries = (...names: string[]) => pick(names.map(countryId))
const cities = (...names: string[]) => pick(names.map(cityId))
const services = (...names: string[]) => pick(names.map(serviceId))

/** 기본 프리셋 공통 구성: 한국(인천, 서울), 태국(치앙마이) */
function baseConfig(): ServiceConfig {
  return configFromSpec([
    [
      '한국',
      [
        ['인천', ['공항 셔틀', '호출버스']],
        ['서울', ['전담 기사', '호출버스', '광역 호출버스']],
      ],
    ],
    ['태국', [['치앙마이', ['전담 기사']]]],
  ])
}

export function buildPresets(now: number): Preset[] {
  const config = baseConfig()
  const user = (partial: Partial<UserState>): UserState => ({
    countryId: null,
    cityIds: [],
    reservations: [],
    now,
    dismissedPopupIds: [],
    readNoticeIds: [],
    ...partial,
  })
  const publish = (presetId: string, drafts: Partial<NoticeDraft>[]): Notice[] =>
    drafts.map((draft, i) =>
      buildNotice(
        { ...emptyDraft(now), start: now - DAY, end: now + 7 * DAY, ...draft },
        config,
        { id: `${presetId}-${i + 1}`, publishedAt: now - i },
      ),
    )

  return [
    {
      id: 'app-korea',
      label: '한국 전체 앱 공지',
      description:
        '도시를 선택하지 않은 한국 사용자입니다. 앱 공지는 도시와 무관하게 Guide 탭과 알림 센터에 보이고, 중요 공지는 팝업으로도 뜹니다. 열 3에서 앱 국가를 태국으로 바꾸거나 가상 현재 시각을 옮겨 보세요.',
      config,
      user: user({ countryId: countryId('한국') }),
      notices: publish('app-korea', [
        {
          type: 'app',
          title: '서비스 이용약관 개정 안내',
          body: '10월 15일부터 개정된 이용약관이 적용됩니다.',
          important: true,
          countries: countries('한국'),
        },
        { type: 'app', title: '앱 업데이트 안내 (v3.2)', countries: countries('한국', '태국') },
        { type: 'app', title: '태국 연휴 기간 고객센터 운영 안내', countries: countries('태국') },
        {
          type: 'app',
          title: '추석 연휴 고객센터 운영 안내',
          countries: countries('한국'),
          start: now - 10 * DAY,
          end: now - 3 * DAY,
        },
      ]),
    },
    {
      id: 'incheon-bus',
      label: '인천 호출버스 공지',
      description:
        '인천만 선택한 한국 사용자입니다. 특정 서비스를 지정한 공지는 Ride 탭이 아니라 해당 서비스 랜딩에 보입니다. 여러 서비스를 지정한 공지는 랜딩마다 각각 보이지만 알림 센터에는 1건입니다. 열 3에서 서울도 선택해 보세요.',
      config,
      user: user({ countryId: countryId('한국'), cityIds: [cityId('인천')] }),
      notices: publish('incheon-bus', [
        {
          type: 'mobility',
          title: '인천 호출버스 운행 시간 변경',
          countries: countries('한국'),
          cities: cities('인천'),
          services: services('호출버스'),
        },
        {
          type: 'mobility',
          title: '호출버스·공항 셔틀 요금 조정',
          countries: countries('한국'),
          cities: cities('인천', '서울'),
          services: services('호출버스', '공항 셔틀'),
        },
        {
          type: 'mobility',
          title: '서울 광역 호출버스 노선 신설',
          countries: countries('한국'),
          cities: cities('서울'),
          services: services('광역 호출버스'),
        },
        {
          type: 'mobility',
          title: '전담 기사 배차 안내',
          countries: countries('한국'),
          cities: cities('인천', '서울'),
          services: services('전담 기사'),
        },
      ]),
    },
    {
      id: 'all-future',
      label: '서비스 전체 + 차후 추가 포함',
      description:
        '[차후 포함] 공지와 [스냅샷] 공지는 "차후 추가 포함" 체크 여부만 다릅니다. 열 1에서 서비스를 추가하고 서울에 제공으로 체크하면 [스냅샷] 이동 서비스 공지는 더 이상 서비스 전체가 아니므로 Ride 탭에서 각 서비스 랜딩으로 옮겨집니다. 한국에 도시를 추가해 열 3에서 그 도시만 선택하거나, 국가를 추가해 앱 국가로 설정해 보세요.',
      config,
      user: user({ countryId: countryId('한국'), cityIds: [cityId('서울')] }),
      notices: publish('all-future', [
        {
          type: 'mobility',
          title: '[차후 포함] 한국 전 서비스 요금 개편',
          countries: countries('한국'),
          cities: ALL_FUTURE,
          services: ALL_FUTURE,
        },
        {
          type: 'mobility',
          title: '[스냅샷] 한국 전 서비스 점검 안내',
          countries: countries('한국'),
          cities: ALL,
          services: ALL,
        },
        { type: 'app', title: '[차후 포함] 개인정보 처리방침 변경', countries: ALL_FUTURE },
        { type: 'app', title: '[스냅샷] 앱 정기 점검 안내', countries: ALL },
      ]),
    },
    {
      id: 'popup-overlap',
      label: '중요 공지 팝업과 예약 기간',
      description:
        '중요 이동 서비스 공지 4건과 서울 예약 2건입니다. 팝업은 공지 대상 도시의 대상 서비스를 예약/이용 중이고 그 기간이 게시 기간과 겹칠 때만 뜹니다. 인천 호출버스 공지는 서비스는 같지만 예약 도시(서울)가 달라 뜨지 않습니다. 팝업 패널의 체크리스트를 확인하고, 열 3에서 예약의 도시·서비스·기간을 바꿔 보세요.',
      config,
      user: user({
        countryId: countryId('한국'),
        cityIds: [cityId('서울')],
        reservations: [
          {
            id: 'r1',
            cityId: cityId('서울'),
            serviceId: serviceId('호출버스'),
            ...dayRange(now + DAY),
          },
          {
            id: 'r2',
            cityId: cityId('서울'),
            serviceId: serviceId('전담 기사'),
            ...dayRange(now + 5 * DAY),
          },
        ],
      }),
      notices: publish('popup-overlap', [
        {
          type: 'mobility',
          title: '서울 호출버스 노선 긴급 변경',
          important: true,
          countries: countries('한국'),
          cities: cities('서울'),
          services: services('호출버스'),
          end: now + 3 * DAY,
        },
        {
          type: 'mobility',
          title: '전담 기사 배차 지연 안내',
          important: true,
          countries: countries('한국'),
          cities: cities('서울'),
          services: services('전담 기사'),
          end: now + 2 * DAY,
        },
        {
          type: 'mobility',
          title: '서울 광역 호출버스 운행 일시 중단',
          important: true,
          countries: countries('한국'),
          cities: cities('서울'),
          services: services('광역 호출버스'),
        },
        {
          type: 'mobility',
          title: '인천 호출버스 운행 중단',
          important: true,
          countries: countries('한국'),
          cities: cities('인천'),
          services: services('호출버스'),
        },
      ]),
    },
    {
      id: 'no-city',
      label: '도시 미선택 + 예약 있는 사용자',
      description:
        '도시를 선택하지 않았지만 인천 공항 셔틀 예약이 있는 사용자입니다. 이동 서비스 공지는 Ride 탭·랜딩·알림 센터에 보이지 않지만, 예약한 서비스의 중요 공지는 팝업으로 뜹니다. 열 3에서 인천을 선택하면 나머지 화면에도 나타납니다.',
      config,
      user: user({
        countryId: countryId('한국'),
        reservations: [
          {
            id: 'r1',
            cityId: cityId('인천'),
            serviceId: serviceId('공항 셔틀'),
            ...dayRange(now),
          },
        ],
      }),
      notices: publish('no-city', [
        {
          type: 'mobility',
          title: '인천 공항 셔틀 운행 중단',
          important: true,
          countries: countries('한국'),
          cities: cities('인천'),
          services: services('공항 셔틀'),
        },
        {
          type: 'mobility',
          title: '인천 호출버스 증차 안내',
          countries: countries('한국'),
          cities: cities('인천'),
          services: services('호출버스'),
        },
        { type: 'app', title: '앱 업데이트 안내 (v3.2)', countries: countries('한국') },
      ]),
    },
  ]
}
