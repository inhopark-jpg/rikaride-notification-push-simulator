import { useState } from 'react'
import type { ReactNode } from 'react'
import { formatShort } from '../domain/format'
import type { Id, ServiceConfig, UserState } from '../domain/types'
import type { AppView, Card, Evaluation } from '../domain/visibility'
import {
  GuideScreen,
  LandingScreen,
  NotificationScreen,
  PHONE_WIDTH,
  Phone,
  PopupScreen,
  RideScreen,
} from './AppScreens'
import { Button, Column } from './ui'

// 휴대폰 화면 배율. 휴대폰 안 최소 글자 12px × 0.85 ≈ 10px
const ZOOM = 0.85

/** 휴대폰 화면 1개 + 위쪽 화면 이름 */
function ScreenSlot({
  title,
  count,
  zoom,
  control,
  children,
}: {
  title: string
  count?: number
  zoom: number
  control?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="shrink-0 space-y-2" style={{ width: PHONE_WIDTH * zoom }}>
      <header className="flex min-h-9 items-center gap-2">
        <h3 className="text-[20px] font-bold text-slate-900">{title}</h3>
        {count !== undefined && (
          <span
            className={`rounded-full px-2.5 text-[14px] font-semibold leading-6 ${
              count > 0 ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-500'
            }`}
          >
            {count}
          </span>
        )}
        <span className="ml-auto">{control}</span>
      </header>
      {children}
    </section>
  )
}

const checklistTooltip = (e: Evaluation) =>
  [
    `팝업 조건: ${e.popup?.reason ?? ''}`,
    ...(e.popup?.checklist ?? []).map((c) => `${c.ok ? '✓' : '✗'} ${c.label}${c.detail ? ` (${c.detail})` : ''}`),
  ].join('\n')

export function ResultColumn({
  config,
  view,
  user,
  onChangeUser,
}: {
  config: ServiceConfig
  view: AppView
  user: UserState
  onChangeUser: (user: UserState) => void
}) {
  const zoom = ZOOM
  /** 서비스 랜딩마다 지도에 보고 있는 도시 (가상의 지도 드래그) */
  const [mapCity, setMapCity] = useState<Record<Id, Id>>({})
  /** 이번 앱 실행에서 "확인"으로 닫은 팝업 */
  const [closedPopups, setClosedPopups] = useState<Id[]>([])

  const country = config.countries.find((c) => c.id === user.countryId)
  const selectedCities = config.cities.filter(
    (c) => c.countryId === user.countryId && user.cityIds.includes(c.id),
  )
  const unread = view.notifications.some((n) => !n.read)
  const closedCards = user.closedCards ?? []

  // x로 닫은 카드는 그 화면에서만 숨긴다 (알림 센터에는 그대로 남음)
  const visible = (screen: string, cards: Card[]) =>
    cards.filter((c) => !closedCards.includes(`${screen}:${c.notice.id}`))
  const closer = (screen: string) => (noticeId: string) =>
    onChangeUser({ ...user, closedCards: [...closedCards, `${screen}:${noticeId}`] })

  const read = (id: Id) => {
    if (!user.readNoticeIds.includes(id)) {
      onChangeUser({ ...user, readNoticeIds: [...user.readNoticeIds, id] })
    }
  }

  // 끝나지 않은 예약 중 가장 이른 것 1건만 보여준다 (앞 예약이 끝나야 다음 예약이 보임)
  const nextReservation = user.reservations
    .filter((r) => r.end >= user.now)
    .sort((a, b) => a.start - b.start)[0]
  const upcomingTrip = nextReservation && {
    serviceName: config.services.find((s) => s.id === nextReservation.serviceId)?.name ?? '',
    cityName: config.cities.find((c) => c.id === nextReservation.cityId)?.name ?? '',
    day: nextReservation.start,
  }

  const remaining = view.popups.filter((e) => !closedPopups.includes(e.notice.id))
  const guideCards = visible('guide', view.guide)

  return (
    <Column
      touch
      step={4}
      title="이용자 앱 표출 결과"
      hint={`${country?.name ?? '국가 미설정'} · ${selectedCities.map((c) => c.name).join(', ') || '도시 미선택'} · 현재 ${formatShort(user.now)}`}
      // 앱 안에서 일어난 일(읽음, 카드 닫기, 팝업 닫기/다시 보지 않기, 지도 위치)을 되돌린다
      onReset={() => {
        setClosedPopups([])
        setMapCity({})
        onChangeUser({ ...user, closedCards: [], readNoticeIds: [], dismissedPopupIds: [] })
      }}
    >
      {closedCards.length > 0 && (
        <div>
          <Button variant="ghost" onClick={() => onChangeUser({ ...user, closedCards: [] })}>
            닫은 공지 복원 ({closedCards.length})
          </Button>
        </div>
      )}

      {/* 1행: 팝업 · Guide · Ride · 알림 센터 */}
      <div className="-mx-2 flex items-start gap-5 overflow-x-auto px-2 pb-10">
        <ScreenSlot
          title="중요 공지 팝업"
          count={view.popups.length}
          zoom={zoom}
          control={
            user.dismissedPopupIds.length > 0 && (
              <Button variant="ghost" onClick={() => onChangeUser({ ...user, dismissedPopupIds: [] })}>
                다시 보지 않기 초기화
              </Button>
            )
          }
        >
          <Phone zoom={zoom}>
            <PopupScreen
              background={<GuideScreen cards={guideCards} unread={unread} onClose={() => {}} />}
              items={remaining.map((e) => ({ notice: e.notice, tooltip: checklistTooltip(e) }))}
              closedAll={view.popups.length > 0 && remaining.length === 0}
              onConfirm={(dismissIds) => {
                setClosedPopups([...closedPopups, ...remaining.map((e) => e.notice.id)])
                if (dismissIds.length > 0) {
                  onChangeUser({ ...user, dismissedPopupIds: [...user.dismissedPopupIds, ...dismissIds] })
                }
              }}
              onRelaunch={() => setClosedPopups([])}
            />
          </Phone>
        </ScreenSlot>

        <ScreenSlot title="Guide 탭" count={guideCards.length} zoom={zoom}>
          <Phone zoom={zoom}>
            <GuideScreen cards={guideCards} unread={unread} onClose={closer('guide')} />
          </Phone>
        </ScreenSlot>

        <ScreenSlot title="Ride 탭" count={visible('ride', view.ride).length} zoom={zoom}>
          <Phone zoom={zoom}>
            <RideScreen
              cards={visible('ride', view.ride)}
              country={country?.name}
              cities={selectedCities}
              services={view.ctaServices}
              trip={upcomingTrip}
              now={user.now}
              unread={unread}
              onClose={closer('ride')}
            />
          </Phone>
        </ScreenSlot>

        <ScreenSlot
          title="알림 센터"
          count={view.notifications.length}
          zoom={zoom}
          control={
            user.readNoticeIds.length > 0 && (
              <Button variant="ghost" onClick={() => onChangeUser({ ...user, readNoticeIds: [] })}>
                읽음 초기화
              </Button>
            )
          }
        >
          <Phone zoom={zoom}>
            <NotificationScreen entries={view.notifications} onRead={read} />
          </Phone>
        </ScreenSlot>
      </div>

      {/* 2행: 서비스 랜딩 */}
      {view.landings.length > 0 && (
        <div className="-mx-2 flex items-start gap-5 overflow-x-auto px-2 pb-10">
        {view.landings.map(({ service, cities }) => {
          const screen = `landing:${service.id}`
          const selected = cities.find((c) => c.city.id === mapCity[service.id]) ?? cities[0]
          const cards = visible(screen, selected?.cards ?? [])
          return (
            <ScreenSlot key={service.id} title={`${service.name} 랜딩`} count={cards.length} zoom={zoom}>
              <Phone zoom={zoom}>
                <LandingScreen
                  service={service}
                  cities={cities.map((c) => c.city)}
                  city={selected?.city}
                  onSelectCity={(cityId) => setMapCity({ ...mapCity, [service.id]: cityId })}
                  cards={cards}
                  onClose={closer(screen)}
                />
              </Phone>
            </ScreenSlot>
          )
        })}
        </div>
      )}

    </Column>
  )
}
