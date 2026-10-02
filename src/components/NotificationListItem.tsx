import chevronRight from '../assets/figma/chevron-right.svg'
import indicator from '../assets/figma/indicator.svg'
import { formatNoticeDate } from '../domain/format'
import type { NotificationEntry } from '../domain/visibility'

// Figma: RIKARIDE - Rider App > 공지 표출 규칙 > announcement-list-tiem (node 17588:82332 외)

type BadgeKind = 'important' | 'city' | 'service'

const BADGE_STYLE: Record<BadgeKind, string> = {
  important: 'bg-[#ed3c3f] text-white',
  city: 'bg-black text-white',
  service: 'bg-[#f2f4f8] text-[#121619]',
}

function BadgeCapsule({ kind, text }: { kind: BadgeKind; text: string }) {
  return (
    <span
      className={`flex min-w-[10px] shrink-0 items-center justify-center whitespace-nowrap rounded-full px-[8px] py-[2px] text-center text-[14px] font-normal leading-[22px] ${BADGE_STYLE[kind]}`}
    >
      {text}
    </span>
  )
}

export function NotificationListItem({
  entry,
  divider,
  onRead,
}: {
  entry: NotificationEntry
  /** 첫 항목이 아니면 상단 구분선을 그린다 */
  divider: boolean
  onRead: () => void
}) {
  const { notice, badges, read } = entry
  const hasBadges = notice.important || badges.cities.length > 0 || badges.services.length > 0

  return (
    <button
      type="button"
      onClick={onRead}
      className="flex w-full flex-col items-start bg-white text-left"
    >
      {divider && <div className="mx-[14px] h-px self-stretch bg-[rgba(14,15,17,0.1)]" />}
      <div className="flex w-full items-center overflow-clip pr-[16px]">
        <div className="flex min-w-px flex-1 items-center gap-[8px] px-[16px] py-[10px]">
          <div className="flex min-w-px flex-1 flex-col items-start gap-[4px]">
            <div className="flex w-full flex-col items-start justify-center break-words">
              <p
                className={`w-full text-[18px] font-medium leading-[28px] ${
                  notice.important ? 'text-[#ed3c3f]' : 'text-[#121619]'
                }`}
              >
                {notice.title}
              </p>
              <p className="w-full truncate text-[15px] font-normal leading-[24px] text-[#878d96]">
                {formatNoticeDate(notice.period.start)}
              </p>
            </div>
            {hasBadges && (
              <div className="flex w-full flex-wrap content-center items-center gap-[8px]">
                {notice.important && <BadgeCapsule kind="important" text="중요" />}
                {badges.cities.map((city) => (
                  <BadgeCapsule key={city} kind="city" text={city} />
                ))}
                {badges.services.map((service) => (
                  <BadgeCapsule key={service} kind="service" text={service} />
                ))}
              </div>
            )}
          </div>
          {!read && <img alt="읽지 않음" className="size-[10px] shrink-0" src={indicator} />}
        </div>
        <div className="flex h-[28px] w-[12px] shrink-0 items-center justify-center pt-px">
          <img alt="" className="h-[24px] w-[12px]" src={chevronRight} />
        </div>
      </div>
    </button>
  )
}
