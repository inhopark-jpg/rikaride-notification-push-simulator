/**
 * 이용자 앱 화면 목업. 공지와 화면 골격 외에는 옅은 스켈레톤으로 채운다.
 * 아이콘: IBM Carbon (@carbon/icons-react, Apache-2.0)
 * 휴대폰 안 글자는 12px 이상 (화면 크기 0.85배에서도 10px 이상)
 */
import {
  AddAlt,
  ArrowLeft,
  Bookmark,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Close,
  Location,
  LocationCurrent,
  LocationFilled,
  Menu,
  Notebook,
  Notification,
  Search,
  Van,
  WarningAlt,
} from '@carbon/icons-react'
import { createContext, useContext, useRef, useState } from 'react'
import type { ComponentType, PointerEvent, ReactNode } from 'react'
import { layoutCtas } from '../domain/ctaLayout'
import type { CtaSpan } from '../domain/ctaLayout'
import type { City, Notice, Service } from '../domain/types'
import type { Card, NotificationEntry } from '../domain/visibility'
import { NotificationListItem } from './NotificationListItem'

type Icon = ComponentType<{ size?: number | string; className?: string }>

/** 랜딩 레이아웃: 출발/도착 입력형(전담 기사·호출버스) vs 노선·정류장 선택형(공항 셔틀·광역 호출버스) */
const ROUTE_LAYOUT = new Set(['공항 셔틀', '광역 호출버스'])

export const PHONE_WIDTH = 390
const PHONE_HEIGHT = 844

// ── 공통 ───────────────────────────────────────────────────

/** 옅은 스켈레톤 블록 */
function Sk({ className = '' }: { className?: string }) {
  return <div className={`shrink-0 bg-[#f0f2f4] ${className}`} />
}

type Shape = 'circle' | 'triangle' | 'square' | 'diamond'
const SHAPE_COLOR = '#c4c9d0'

/** 16×16 안에 그리는 스켈레톤 도형. 모든 도형이 같은 크기로 보이도록 맞춘 좌표 */
function ShapePath({ shape, y = 0 }: { shape: Shape; y?: number }) {
  switch (shape) {
    case 'circle':
      return <circle cx="8" cy={8 + y} r="6" />
    case 'triangle':
      return <path d={`M8 ${1.8 + y} L14.6 ${13.6 + y} H1.4 Z`} />
    case 'square':
      return <rect x="2.5" y={2.5 + y} width="11" height="11" rx="1.5" />
    case 'diamond':
      return <path d={`M8 ${1 + y} L15 ${8 + y} L8 ${15 + y} L1 ${8 + y} Z`} />
  }
}

function ShapeIcon({ shape }: { shape: Shape }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill={SHAPE_COLOR} className="shrink-0">
      <ShapePath shape={shape} />
    </svg>
  )
}

/** 출발지(●)–도착지(▲)를 세로선으로 잇는 마커. 입력칸 50px 두 개 + 간격 12px 높이에 맞춘 한 장의 SVG */
function PickupDropoffMarker() {
  return (
    <svg width="16" height="112" viewBox="0 0 16 112" fill={SHAPE_COLOR} className="shrink-0">
      <ShapePath shape="circle" y={17} />
      <line x1="8" y1="35" x2="8" y2="77" stroke={SHAPE_COLOR} strokeWidth="2" strokeLinecap="round" />
      <ShapePath shape="triangle" y={79} />
    </svg>
  )
}

/** 휴대폰 배율. 마우스 이동량(화면 px)을 휴대폰 안 px로 바꿀 때 쓴다. */
const ZoomContext = createContext(1)

/** 휴대폰 틀. 터치 흉내(동그라미 커서, 끌어서 스크롤)는 열 4 본문 전체에 걸려 있다. */
export function Phone({ zoom, children }: { zoom: number; children: ReactNode }) {
  return (
    <div style={{ zoom }} className="shrink-0">
      <div
        style={{ width: PHONE_WIDTH, height: PHONE_HEIGHT }}
        className="relative overflow-hidden rounded-[48px] border border-slate-200 bg-white font-sans text-[#121619] shadow-[0_8px_30px_rgba(15,23,42,0.08)]"
      >
        <ZoomContext.Provider value={zoom}>{children}</ZoomContext.Provider>
      </div>
    </div>
  )
}

function Bell({ unread }: { unread: boolean }) {
  return (
    <span className="relative">
      <Notification size={28} />
      {unread && <span className="absolute -right-0.5 top-0 size-[9px] rounded-full bg-[#ed3c3f]" />}
    </span>
  )
}

function BottomNav({ active }: { active: 'Guide' | 'Ride' | 'My' }) {
  const items: [typeof active, Icon][] = [
    ['Guide', Notebook],
    ['Ride', Van],
    ['My', Bookmark],
  ]
  return (
    <div className="absolute inset-x-5 bottom-[26px] grid h-[64px] grid-cols-3 items-center rounded-full bg-white px-1.5 shadow-[0_4px_24px_rgba(15,23,42,0.12)]">
      {items.map(([label, IconCmp]) => (
        <span
          key={label}
          className={`flex h-[54px] flex-col items-center justify-center gap-0.5 rounded-full text-[12px] ${
            label === active ? 'bg-[#202325] text-[#a2d5f7]' : 'text-[#121619]'
          }`}
        >
          <IconCmp size={24} />
          {label}
        </span>
      ))}
    </div>
  )
}

/** 카드에 마우스를 올리면 보이는 "왜 여기에 보이는가" */
const whyTitle = (card: Card) => [`왜 여기에: ${card.reason}`, ...card.trace.map((t) => `✓ ${t}`)].join('\n')

/** 공지 카드: 가로로 쌓이고 좌우로 스크롤된다. 배지는 붙이지 않는다. */
function NoticeCarousel({
  cards,
  onClose,
  className = '',
}: {
  cards: Card[]
  onClose: (noticeId: string) => void
  className?: string
}) {
  if (cards.length === 0) return null
  return (
    <div
      className={`flex snap-x snap-mandatory scroll-px-5 gap-2.5 overflow-x-auto px-5 [scrollbar-width:none] ${className}`}
    >
      {cards.map((card) => (
        <NoticeCard
          key={card.notice.id}
          card={card}
          single={cards.length === 1}
          onClose={() => onClose(card.notice.id)}
        />
      ))}
      {/* 스크롤 끝에서도 오른쪽 여백이 남도록 */}
      {cards.length > 1 && <span className="w-2.5 shrink-0" />}
    </div>
  )
}

function NoticeCard({ card, single, onClose }: { card: Card; single: boolean; onClose: () => void }) {
  const notice: Notice = card.notice
  return (
    <article
      title={whyTitle(card)}
      className={`relative shrink-0 snap-start rounded-[20px] border py-3.5 pl-4 pr-10 ${
        single ? 'w-full' : 'w-[296px]'
      } ${notice.important ? 'border-[#f7c9ca] bg-[#fff5f5]' : 'border-[#e3e6ea] bg-white'}`}
    >
      <button
        type="button"
        aria-label="공지 닫기"
        className="absolute right-2.5 top-2.5 flex size-7 items-center justify-center rounded-full text-[#878d96] hover:bg-black/5"
        onClick={onClose}
      >
        <Close size={18} />
      </button>
      <div className="flex items-start gap-2.5">
        {/* 공지임을 알리는 아이콘: 일반은 벨, 중요는 경고 */}
        {notice.important ? (
          <WarningAlt size={22} aria-label="중요 공지" className="mt-[2.5px] shrink-0 text-[#ed3c3f]" />
        ) : (
          <Notification size={22} aria-label="공지" className="mt-[2.5px] shrink-0 text-[#121619]" />
        )}
        <p
          className={`min-w-0 break-words text-[18px] font-semibold leading-[27px] ${
            notice.important ? 'text-[#ed3c3f]' : 'text-[#121619]'
          }`}
        >
          {notice.title}
        </p>
      </div>
    </article>
  )
}

// ── Guide 탭 ───────────────────────────────────────────────

export function GuideScreen({
  cards,
  unread,
  onClose,
}: {
  cards: Card[]
  unread: boolean
  onClose: (noticeId: string) => void
}) {
  return (
    <>
      <div className="h-full overflow-y-auto pb-[110px] [scrollbar-width:none]">
        <div className="flex items-center gap-5 px-5 pt-[60px]">
          <Sk className="h-[30px] w-[140px] rounded-full" />
          <span className="ml-auto">
            <Bell unread={unread} />
          </span>
          <Menu size={28} />
        </div>
        <div className="mx-5 mt-7 flex h-[52px] items-center justify-end rounded-full border border-[#e3e6ea] pr-5 text-[#b0b6bd]">
          <Search size={24} />
        </div>
        <NoticeCarousel cards={cards} onClose={onClose} className="mt-6" />
        <div className="mt-7 grid grid-cols-2 gap-x-3 gap-y-6 px-5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-2.5">
              <Sk className="h-[180px] rounded-[22px]" />
              <Sk className="h-3.5 w-[80%] rounded-full" />
              <Sk className="h-3.5 w-[50%] rounded-full" />
            </div>
          ))}
        </div>
      </div>
      <BottomNav active="Guide" />
    </>
  )
}

// ── Ride 탭 ────────────────────────────────────────────────

const SPAN_CLASS: Record<CtaSpan, string> = {
  full: 'col-span-6',
  half: 'col-span-3',
  third: 'col-span-2',
}

function ServiceCta({ service, span }: { service: Service; span: CtaSpan }) {
  return (
    <div
      className={`${SPAN_CLASS[span]} flex flex-col justify-end rounded-[24px] bg-[#e3f2fd] px-4 py-4 ${
        span === 'full' ? 'min-h-[120px]' : span === 'half' ? 'h-[115px]' : 'h-[100px] pb-3 text-center'
      }`}
    >
      <p
        className={`truncate font-semibold ${
          span === 'full'
            ? 'text-[20px] leading-[26px]'
            : span === 'half'
              ? 'text-[18px] leading-[22px]'
              : 'text-[14px] leading-[17px]'
        }`}
      >
        {service.name}
      </p>
      {span === 'full' && <Sk className="mt-2 h-3.5 w-[55%] rounded-full !bg-white/70" />}
    </div>
  )
}

/** "다가오는 여정"에 보여줄 예약 1건 */
export interface UpcomingTrip {
  serviceName: string
  cityName: string
  /** 이용일 00:00 */
  day: number
}

const DAY_MS = 24 * 60 * 60 * 1000

/** 다가오는 예약 카드. 하단 탭의 선택 색(짙은 회색 + 하늘색)과 맞춘 간결한 카드 */
function TripCard({ trip, now }: { trip: UpcomingTrip; now: number }) {
  const today = new Date(now)
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const days = Math.round((trip.day - todayStart) / DAY_MS)
  const d = new Date(trip.day)
  const weekday = '일월화수목금토'[d.getDay()]
  return (
    <div className="mx-5 flex items-center gap-4 rounded-[24px] bg-[#202325] py-4 pl-5 pr-4">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[18px] font-semibold leading-[26px] text-white">{trip.serviceName}</p>
        <p className="truncate text-[14px] leading-[22px] text-[#a0a5ab]">
          {trip.cityName} · {d.getMonth() + 1}월 {d.getDate()}일 ({weekday})
        </p>
      </div>
      <span className="shrink-0 rounded-full bg-[#a2d5f7] px-3 py-1 text-[15px] font-bold leading-6 text-[#121619]">
        {days <= 0 ? '오늘' : `D-${days}`}
      </span>
      <ChevronRight size={20} className="shrink-0 text-[#6f757c]" />
    </div>
  )
}

export function RideScreen({
  cards,
  country,
  cities,
  services,
  trip,
  now,
  unread,
  onClose,
}: {
  cards: Card[]
  country?: string
  cities: City[]
  services: Service[]
  /** 가장 가까운 예약. 없으면 "다가오는 여정"을 숨긴다 */
  trip?: UpcomingTrip
  now: number
  unread: boolean
  onClose: (noticeId: string) => void
}) {
  const spans = layoutCtas(services.map((s) => s.name))
  return (
    <>
      <div className="h-full overflow-y-auto pb-[110px] [scrollbar-width:none]">
        <div className="flex items-center gap-4 px-4 pt-[52px]">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[#f2f4f8]">
            <LocationFilled size={22} />
          </span>
          <span className="flex min-w-0 items-center gap-1.5 text-[18px] font-semibold">
            <span className="truncate">{country ?? '국가 선택'}</span>
            <ChevronDown size={20} className="shrink-0" />
          </span>
          <span className="ml-auto">
            <Bell unread={unread} />
          </span>
          <Menu size={28} className="shrink-0" />
        </div>

        {/* 공지가 없을 때만 인사말을 보여준다 */}
        {cards.length === 0 && (
          <p className="mt-9 px-5 text-[34px] font-bold leading-[44px] tracking-[-0.02em]">
            안녕하세요,
            <br />
            어디로 갈까요?
          </p>
        )}

        {cities.length > 0 && (
        <div className="mt-6 flex gap-2.5 overflow-x-auto px-4 [scrollbar-width:none]">
          {cities.map((c) => (
            <span
              key={c.id}
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-black px-4 text-[16px] font-semibold text-white"
            >
              <Close size={18} />
              {c.name}
            </span>
          ))}
          <span className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-[#e3e6ea] px-4 text-[16px] font-semibold">
            <AddAlt size={20} />
            도시 추가
          </span>
        </div>
        )}

        <NoticeCarousel cards={cards} onClose={onClose} className="mt-5" />

        {trip && (
          <>
            <p className="mt-8 px-5 text-[20px] font-semibold">다가오는 여정</p>
            <div className="mt-3">
              <TripCard trip={trip} now={now} />
            </div>
          </>
        )}

        <p className="mt-8 px-5 text-[20px] font-semibold">서비스</p>
        <div className="mt-3 grid grid-cols-6 gap-2 px-5">
          {cities.length === 0 ? (
            // 도시를 선택하지 않은 사용자: 도시 선택 유도 카드
            <div className="relative col-span-6 flex min-h-[136px] flex-col justify-end rounded-[24px] bg-[#f2f4f8] px-4 py-4">
              <span className="absolute right-3.5 top-4 flex size-10 items-center justify-center rounded-full bg-white">
                <Location size={22} />
              </span>
              <p className="text-[20px] font-bold leading-[26px]">도시 선택</p>
              <p className="text-[14px] leading-[23px] text-[#878d96]">서비스 이용을 위해 도시를 선택해 주세요</p>
            </div>
          ) : (
            services.length === 0 && (
              <p className="col-span-6 rounded-[24px] bg-[#f6f7f9] px-4 py-8 text-center text-[14px] text-[#878d96]">
                선택한 도시에 이용 가능한 서비스가 없습니다
              </p>
            )
          )}
          {services.map((s, i) => (
            <ServiceCta key={s.id} service={s} span={spans[i]} />
          ))}
        </div>
      </div>
      <BottomNav active="Ride" />
    </>
  )
}

// ── 알림 센터 ──────────────────────────────────────────────

export function NotificationScreen({
  entries,
  onRead,
}: {
  entries: NotificationEntry[]
  onRead: (id: string) => void
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="relative flex h-[128px] shrink-0 items-end justify-center pb-5">
        <span className="absolute bottom-3 left-5 flex size-11 items-center justify-center rounded-full bg-white shadow-[0_2px_12px_rgba(15,23,42,0.12)]">
          <ChevronLeft size={24} />
        </span>
        <span className="text-[18px] font-semibold">알림</span>
      </div>
      <div className="flex shrink-0 gap-2 px-5 pb-3">
        <span className="inline-flex h-10 items-center rounded-full bg-black px-4 text-[16px] font-semibold text-white">
          공지 · {entries.length}
        </span>
        {[0, 1].map((i) => (
          <span
            key={i}
            className="inline-flex h-10 w-[104px] items-center justify-center rounded-full border border-[#e3e6ea]"
          >
            <Sk className="h-3 w-[56%] rounded-full" />
          </span>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:none]">
        {entries.length === 0 && (
          <p className="py-16 text-center text-[15px] text-[#878d96]">새로운 공지가 없습니다</p>
        )}
        {entries.map((entry, i) => (
          <NotificationListItem
            key={entry.notice.id}
            entry={entry}
            divider={i > 0}
            onRead={() => onRead(entry.notice.id)}
          />
        ))}
      </div>
    </div>
  )
}

// ── 서비스 랜딩 ────────────────────────────────────────────

function MapArea({
  cities,
  city,
  onSelectCity,
}: {
  cities: City[]
  city?: City
  onSelectCity: (cityId: string) => void
}) {
  return (
    <div className="relative min-h-0 flex-1 bg-[#f1f3f5] [background-image:radial-gradient(#dde1e6_1.5px,transparent_1.5px)] [background-size:16px_16px]"
    >
      <span className="absolute left-5 top-[56px] flex size-12 items-center justify-center rounded-full bg-white shadow-[0_2px_10px_rgba(15,23,42,0.08)]">
        <ArrowLeft size={24} />
      </span>
      {/* 지도를 드래그해 다른 도시로 옮기는 동작을 대신하는 가상 컨트롤 */}
      <div className="absolute inset-x-0 top-[54%] flex -translate-y-1/2 flex-wrap justify-center gap-2 px-6">
        {cities.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelectCity(c.id)}
            className={`inline-flex h-12 items-center gap-1.5 rounded-full px-5 text-[17px] font-semibold shadow-[0_4px_14px_rgba(15,23,42,0.12)] ${
              c.id === city?.id ? 'bg-[#202325] text-white' : 'bg-white text-[#121619] hover:bg-slate-50'
            }`}
          >
            <LocationFilled size={20} />
            {c.name} 보기
          </button>
        ))}
      </div>
      <span className="absolute bottom-12 right-4 flex size-11 items-center justify-center rounded-full bg-white shadow-[0_2px_10px_rgba(15,23,42,0.1)]">
        <LocationCurrent size={20} />
      </span>
    </div>
  )
}

export function LandingScreen({
  service,
  cities,
  city,
  onSelectCity,
  cards,
  onClose,
}: {
  service: Service
  cities: City[]
  city?: City
  onSelectCity: (cityId: string) => void
  cards: Card[]
  onClose: (noticeId: string) => void
}) {
  const route = ROUTE_LAYOUT.has(service.name)
  return (
    <div className="flex h-full flex-col">
      <MapArea
        cities={cities}
        city={city}
        onSelectCity={onSelectCity}
      />
      {/* 바텀시트는 내용만큼만: 입력칸 바로 아래에 버튼 */}
      <div className="relative -mt-8 flex shrink-0 flex-col rounded-t-[32px] bg-white pt-7 shadow-[0_-4px_20px_rgba(15,23,42,0.06)]">
        <NoticeCarousel cards={cards} onClose={onClose} className="mb-5" />
        {route ? (
          <div className="mx-5 rounded-[22px] border border-[#e3e6ea] px-6">
            {(['circle', 'triangle', 'square', 'diamond'] as const).map((shape, i) => (
              <div
                key={shape}
                className={`flex h-[54px] items-center gap-4 ${i < 3 ? 'border-b border-[#eef0f3]' : ''}`}
              >
                <ShapeIcon shape={shape} />
                <Sk className="h-3.5 w-[45%] rounded-full" />
              </div>
            ))}
          </div>
        ) : (
          // 출발지(●)와 도착지(▲)를 세로선으로 이어 승하차 입력으로 읽히게 한다
          <div className="mx-5 flex gap-4">
            <PickupDropoffMarker />
            <div className="flex-1 space-y-3">
              {[0, 1].map((i) => (
                <div key={i} className="flex h-[50px] items-center rounded-full border border-[#e3e6ea] px-5">
                  <Sk className="h-3.5 w-[45%] rounded-full" />
                </div>
              ))}
            </div>
          </div>
        )}
        <Sk className="mx-5 mb-[34px] mt-6 h-[54px] rounded-full !bg-[#e6e9ec]" />
      </div>
    </div>
  )
}

// ── 팝업 ───────────────────────────────────────────────────

export interface PopupItem {
  notice: Notice
  /** 마우스를 올리면 보이는 팝업 조건 체크리스트 */
  tooltip: string
}

/**
 * 중요 공지 바텀시트. 여러 건이면 좌우로 스와이프하거나 확인 버튼 위 ‹ 1 / 2 ›로 앞뒤 공지를 오간다.
 * "다시 보지 않기"는 공지마다 따로 체크하고, 확인을 누르면 시트 전체가 닫힌다.
 */
function PopupSheet({
  items,
  onConfirm,
}: {
  items: PopupItem[]
  onConfirm: (dismissIds: string[]) => void
}) {
  const zoom = useContext(ZoomContext)
  const [index, setIndex] = useState(0)
  const [checked, setChecked] = useState<string[]>([])
  /** 스와이프 중 손가락이 움직인 거리 (휴대폰 안 px). null이면 끌고 있지 않음 */
  const [dragX, setDragX] = useState<number | null>(null)
  const swipeStart = useRef(0)
  const trackRef = useRef<HTMLDivElement>(null)
  const { notice } = items[index]
  const multiple = items.length > 1
  const isChecked = checked.includes(notice.id)
  const go = (next: number) => setIndex(Math.max(0, Math.min(items.length - 1, next)))

  const onPointerDown = (e: PointerEvent) => {
    if (!multiple || e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    swipeStart.current = e.clientX
    setDragX(0)
  }
  const onPointerMove = (e: PointerEvent) => {
    if (dragX === null) return
    let dx = (e.clientX - swipeStart.current) / zoom
    // 처음/마지막 공지에서 바깥으로 끌면 덜 따라온다
    if ((index === 0 && dx > 0) || (index === items.length - 1 && dx < 0)) dx /= 3
    setDragX(dx)
  }
  const onPointerUp = () => {
    if (dragX === null) return
    const width = trackRef.current?.clientWidth ?? PHONE_WIDTH
    if (dragX < -width * 0.2) go(index + 1)
    else if (dragX > width * 0.2) go(index - 1)
    setDragX(null)
  }

  return (
    <div className="absolute inset-x-0 bottom-0 rounded-t-[32px] bg-white pb-[34px] pt-3 shadow-[0_-8px_30px_rgba(15,23,42,0.12)]">
      <div className="mx-auto h-1 w-10 rounded-full bg-[#dfe2e6]" />
      <div
        ref={trackRef}
        data-swipe
        className="mt-6 overflow-hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          className="flex"
          style={{
            transform: `translateX(calc(${-index * 100}% + ${dragX ?? 0}px))`,
            transition: dragX === null ? 'transform 250ms ease-out' : 'none',
          }}
        >
          {items.map((item) => (
            <div key={item.notice.id} title={item.tooltip} className="w-full shrink-0 space-y-2 px-6">
              <p className="text-[20px] font-bold leading-7">{item.notice.title}</p>
              <p className="text-[15px] leading-6 text-[#555b61]">{item.notice.body}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="px-6">
        {multiple && (
          <div className="mt-6 flex items-center justify-center gap-2">
            <button
              type="button"
              aria-label="이전 공지"
              disabled={index === 0}
              className="flex size-8 items-center justify-center rounded-full text-[#121619] disabled:text-[#c9cdd2]"
              onClick={() => go(index - 1)}
            >
              <ChevronLeft size={20} />
            </button>
            <span className="min-w-12 text-center text-[14px] font-medium tabular-nums text-[#555b61]">
              {index + 1} / {items.length}
            </span>
            <button
              type="button"
              aria-label="다음 공지"
              disabled={index === items.length - 1}
              className="flex size-8 items-center justify-center rounded-full text-[#121619] disabled:text-[#c9cdd2]"
              onClick={() => go(index + 1)}
            >
              <ChevronRight size={20} />
            </button>
          </div>
        )}
        <button
          type="button"
          className={`${multiple ? 'mt-3' : 'mt-7'} h-[54px] w-full rounded-full bg-black text-[16px] font-semibold text-white hover:bg-[#202325]`}
          onClick={() => onConfirm(checked)}
        >
          확인
        </button>
        <label className="mt-4 flex items-center justify-center gap-2 text-[15px] text-[#555b61]">
          <input
            type="checkbox"
            className="size-5 accent-black"
            checked={isChecked}
            onChange={(e) =>
              setChecked(e.target.checked ? [...checked, notice.id] : checked.filter((id) => id !== notice.id))
            }
          />
          {multiple ? '이 공지 다시 보지 않기' : '다시 보지 않기'}
        </label>
      </div>
    </div>
  )
}

export function PopupScreen({
  background,
  items,
  onConfirm,
  onRelaunch,
  closedAll,
}: {
  /** 팝업 뒤에 깔리는 화면 */
  background: ReactNode
  /** 지금 떠 있는 팝업들. 비어 있으면 표출 없음 */
  items: PopupItem[]
  /** 확인: 이번 실행에서 시트를 닫고, 체크한 공지는 다시 보지 않기 */
  onConfirm: (dismissIds: string[]) => void
  onRelaunch: () => void
  closedAll: boolean
}) {
  return (
    <>
      {background}
      <div className="absolute inset-0 bg-black/40">
        {items.length > 0 ? (
          <PopupSheet key={items.map((i) => i.notice.id).join()} items={items} onConfirm={onConfirm} />
        ) : (
          <div className="flex h-full items-center justify-center">
            {closedAll ? (
              <button
                type="button"
                className="rounded-full bg-white px-5 py-2.5 text-[15px] font-semibold"
                onClick={onRelaunch}
              >
                앱 다시 실행
              </button>
            ) : (
              <p className="rounded-full bg-white px-4 py-2 text-[14px] font-semibold text-[#121619]">
                표출되는 팝업 없음
              </p>
            )}
          </div>
        )}
      </div>
    </>
  )
}
