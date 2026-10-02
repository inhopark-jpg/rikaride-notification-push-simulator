import { dayRange, fromDateInputValue, toDateInputValue } from '../domain/format'
import type { Reservation, ServiceConfig, UserState } from '../domain/types'
import { BlockDivider, Button, Check, Chip, Column, DateTimeInput, Empty, Group, inputClass } from './ui'

const DAY = 24 * 60 * 60 * 1000

/** 예약/이용은 하루 단위: 이용일 전이면 예약, 당일이면 오늘 이용 */
function reservationStatus(r: Reservation, now: number) {
  if (now < r.start) return <Chip tone="blue">예약</Chip>
  if (now > r.end) return <Chip>이용 종료</Chip>
  return <Chip tone="green">오늘 이용</Chip>
}

export function UserColumn({
  config,
  user,
  onChange,
  onReset,
}: {
  config: ServiceConfig
  user: UserState
  onChange: (user: UserState) => void
  onReset: () => void
}) {
  const cities = config.cities.filter((c) => c.countryId === user.countryId)
  const servicesIn = (cityId: string) => {
    const offered = config.cities.find((c) => c.id === cityId)?.serviceIds ?? []
    return config.services.filter((s) => offered.includes(s.id))
  }
  // 예약할 수 있는 도시 = 제공 서비스가 하나라도 있는 도시
  const bookableCities = config.cities.filter((c) => servicesIn(c.id).length > 0)
  // 새 예약의 기본 도시: 선택한 도시 → 앱 국가의 도시 → 아무 도시
  const defaultCity =
    bookableCities.find((c) => user.cityIds.includes(c.id)) ??
    bookableCities.find((c) => c.countryId === user.countryId) ??
    bookableCities[0]
  const shift = (delta: number) => onChange({ ...user, now: user.now + delta })
  const updateReservation = (id: string, patch: Partial<Reservation>) =>
    onChange({
      ...user,
      reservations: user.reservations.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    })

  return (
    <Column
      step={3}
      title="사용자 앱 Configuration"
      hint="가상 사용자의 앱 설정과 예약 상태"
      aside={
        <>
          <Group title={`예약 · 이용 중인 서비스 (${user.reservations.length})`}>
            {user.reservations.length === 0 && <Empty>예약/이용 중인 서비스가 없습니다.</Empty>}
            {user.reservations.map((r) => (
              <div key={r.id} className="space-y-1 rounded-lg border border-slate-200 bg-white p-2">
                <div className="flex items-center justify-between gap-1">
                  {reservationStatus(r, user.now)}
                  <Button
                    variant="danger"
                    aria-label="예약 삭제"
                    onClick={() =>
                      onChange({
                        ...user,
                        reservations: user.reservations.filter((x) => x.id !== r.id),
                      })
                    }
                  >
                    삭제
                  </Button>
                </div>
                <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1">
                  <span className="text-[14px] text-slate-500">도시</span>
                  <select
                    className={inputClass}
                    value={r.cityId}
                    onChange={(e) => {
                      // 도시를 바꾸면 그 도시에서 제공하는 서비스로 맞춘다
                      const offered = servicesIn(e.target.value)
                      updateReservation(r.id, {
                        cityId: e.target.value,
                        serviceId: offered.some((s) => s.id === r.serviceId)
                          ? r.serviceId
                          : offered[0].id,
                      })
                    }}
                  >
                    {config.countries.map((country) => (
                      <optgroup key={country.id} label={country.name}>
                        {bookableCities
                          .filter((c) => c.countryId === country.id)
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                      </optgroup>
                    ))}
                  </select>
                  <span className="text-[14px] text-slate-500">서비스</span>
                  <select
                    className={inputClass}
                    value={r.serviceId}
                    onChange={(e) => updateReservation(r.id, { serviceId: e.target.value })}
                  >
                    {servicesIn(r.cityId).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <span className="text-[14px] text-slate-500">이용일</span>
                  <input
                    type="date"
                    className={inputClass}
                    value={toDateInputValue(r.start)}
                    onChange={(e) => {
                      const day = fromDateInputValue(e.target.value)
                      if (day !== null) updateReservation(r.id, dayRange(day))
                    }}
                  />
                </div>
              </div>
            ))}
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              disabled={!defaultCity}
              onClick={() => {
                if (!defaultCity) return
                onChange({
                  ...user,
                  reservations: [
                    ...user.reservations,
                    {
                      id: crypto.randomUUID(),
                      cityId: defaultCity.id,
                      serviceId: servicesIn(defaultCity.id)[0].id,
                      ...dayRange(user.now),
                    },
                  ],
                })
              }}
            >
              + 예약/이용 추가
            </Button>
          </Group>
        </>
      }
      onReset={onReset}
    >
      <Group title="가상 현재 시각">
        <DateTimeInput value={user.now} onChange={(now) => onChange({ ...user, now })} />
        <div className="flex flex-wrap gap-1">
          <Button onClick={() => shift(-7 * DAY)}>−7일</Button>
          <Button onClick={() => shift(-DAY)}>−1일</Button>
          <Button onClick={() => shift(DAY)}>+1일</Button>
          <Button onClick={() => shift(7 * DAY)}>+7일</Button>
          <Button variant="ghost" onClick={() => onChange({ ...user, now: Date.now() })}>
            실제 시각
          </Button>
        </div>
      </Group>

      <BlockDivider />

      <Group title="앱 국가 설정">
        <select
          className={inputClass}
          value={user.countryId ?? ''}
          onChange={(e) => onChange({ ...user, countryId: e.target.value || null, cityIds: [] })}
        >
          <option value="">미설정</option>
          {config.countries.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Group>

      <BlockDivider />

      <Group title={`선택한 도시 (${user.cityIds.length})`}>
        {cities.length === 0 ? (
          <Empty>
            {user.countryId ? '이 국가에 도시가 없습니다.' : '앱 국가를 먼저 설정하세요.'}
          </Empty>
        ) : (
          <div className="space-y-1">
            {cities.map((city) => (
              <div key={city.id} className="rounded-md bg-slate-50 px-2 py-1">
                <Check
                  label={<span className="font-medium">{city.name}</span>}
                  checked={user.cityIds.includes(city.id)}
                  onChange={(checked) =>
                    onChange({
                      ...user,
                      cityIds: checked
                        ? [...user.cityIds, city.id]
                        : user.cityIds.filter((id) => id !== city.id),
                    })
                  }
                />
                <p className="pl-5 text-[13px] leading-5 text-slate-500">
                  {config.services
                    .filter((s) => city.serviceIds.includes(s.id))
                    .map((s) => s.name)
                    .join(' · ') || '제공 서비스 없음'}
                </p>
              </div>
            ))}
          </div>
        )}
      </Group>

    </Column>
  )
}
