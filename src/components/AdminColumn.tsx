import { useEffect, useState } from 'react'
import { formatPeriod } from '../domain/format'
import {
  PLACEHOLDER_BODY,
  TYPE_LABEL,
  buildNotice,
  cityOptions,
  draftFromNotice,
  emptyDraft,
  isDraftServiceWide,
  normalizeDraft,
  placeholderTitle,
  publishError,
  serviceOptions,
} from '../domain/publish'
import type { NoticeDraft, ScopeDraft } from '../domain/publish'
import type { Id, Notice, NoticeType, Scope, ServiceConfig } from '../domain/types'

import type { Evaluation } from '../domain/visibility'
import { BlockDivider, Button, Check, Chip, Column, DateTimeInput, Empty, Group, Switch, inputClass } from './ui'

interface ScopeOption {
  id: Id
  name: string
  group?: string
}

function ScopePicker({
  unit,
  options,
  value,
  onChange,
  emptyText,
}: {
  unit: string
  options: ScopeOption[]
  value: ScopeDraft
  onChange: (value: ScopeDraft) => void
  emptyText: string
}) {
  const groups = [...new Set(options.map((o) => o.group))]
  const toggle = (id: Id) =>
    onChange({
      ...value,
      ids: value.ids.includes(id) ? value.ids.filter((i) => i !== id) : [...value.ids, id],
    })

  return (
    <div className="rounded-lg border border-slate-200 p-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-100 pb-1.5">
        <span className="text-[14px] font-semibold text-slate-700">발행 대상 {unit}</span>
        <Check
          className="!text-[14px]"
          label={`${unit} 전체 선택`}
          checked={value.all}
          onChange={(all) => onChange({ ...value, all, includeFuture: all && value.includeFuture })}
        />
        {value.all && (
          <Check
            className="rounded bg-amber-50 px-1.5 py-0.5 !text-[14px] !text-amber-900"
            label={`차후 추가되는 ${unit} 포함`}
            checked={value.includeFuture}
            onChange={(includeFuture) => onChange({ ...value, includeFuture })}
          />
        )}
      </div>
      <div className="mt-1.5 space-y-1">
        {options.length === 0 && <p className="text-[14px] text-slate-400">{emptyText}</p>}
        {groups.map((group) => (
          <div key={group ?? ''} className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {group && <span className="w-12 shrink-0 text-[13px] text-slate-400">{group}</span>}
            {options
              .filter((o) => o.group === group)
              .map((o) => (
                <Check
                  key={o.id}
                  label={o.name}
                  checked={value.all || value.ids.includes(o.id)}
                  disabled={value.all}
                  onChange={() => toggle(o.id)}
                />
              ))}
          </div>
        ))}
      </div>
    </div>
  )
}

/** 발행 scope를 배지로 나열. 전체 선택이면 "전체" (+ "차후 추가 포함") */
function ScopeBadges({ scope, nameOf }: { scope: Scope; nameOf: (id: Id) => string | undefined }) {
  const names = scope.all
    ? ['전체', ...(scope.includeFuture ? ['차후 추가 포함'] : [])]
    : scope.ids.map(nameOf).filter((n): n is string => !!n)
  return (
    <div className="flex flex-wrap gap-1">
      {names.length === 0 && <span className="leading-6 text-slate-400">(삭제된 항목)</span>}
      {names.map((name) => (
        <span key={name} className="rounded-full bg-slate-100 px-2 leading-6 text-slate-700">
          {name}
        </span>
      ))}
    </div>
  )
}

function periodStatus(notice: Notice, now: number) {
  if (now < notice.period.start) return <Chip tone="amber">게시 전</Chip>
  if (now > notice.period.end) return <Chip>게시 종료</Chip>
  return <Chip tone="green">게시 중</Chip>
}

export function AdminColumn({
  config,
  now,
  notices,
  evaluations,
  onSave,
  onDelete,
  onReset,
  onPreview,
}: {
  config: ServiceConfig
  now: number
  notices: Notice[]
  evaluations: Evaluation[]
  onSave: (notice: Notice) => void
  onDelete: (id: Id) => void
  /** 발행된 공지를 모두 지운다 */
  onReset: () => void
  /** 작성 중인 공지. 발행 전에도 열 4에 바로 반영된다 */
  onPreview: (notice: Notice) => void
}) {
  const [rawDraft, setRawDraft] = useState<NoticeDraft>(() => emptyDraft(now))
  const [editing, setEditing] = useState<Notice | null>(null)
  // 미리보기와 발행 공지가 같은 id를 쓰도록 미리 정해 둔다 (읽음·닫기 상태가 이어짐)
  const [draftId, setDraftId] = useState(() => crypto.randomUUID())
  /** 조건이 덜 채워진 채로 발행을 눌렀는지 */
  const [tried, setTried] = useState(false)

  // 상위 scope나 구성이 바뀌면 하위 선택이 자연스럽게 정리되도록 매 렌더마다 정규화한다
  const draft = normalizeDraft(rawDraft, config)
  const update = (patch: Partial<NoticeDraft>) => setRawDraft({ ...draft, ...patch })

  const countryName = (id: Id) => config.countries.find((c) => c.id === id)?.name
  const cityName = (id: Id) => config.cities.find((c) => c.id === id)?.name
  const serviceName = (id: Id) => config.services.find((s) => s.id === id)?.name

  const cityOpts = cityOptions(config, draft.countries)
  const serviceOpts = serviceOptions(config, draft.countries, draft.cities)
  const serviceWide = isDraftServiceWide(draft.services, serviceOpts.length)
  const error = publishError(draft)
  const hasCountries = draft.countries.all || draft.countries.ids.length > 0
  const hasCities = draft.cities.all || draft.cities.ids.length > 0

  const preview = buildNotice(draft, config, {
    id: editing?.id ?? draftId,
    publishedAt: editing?.publishedAt ?? now,
  })
  const previewKey = JSON.stringify(preview)
  useEffect(() => {
    onPreview(JSON.parse(previewKey) as Notice)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey])

  const submit = () => {
    if (error) {
      setTried(true)
      return
    }
    onSave({ ...preview, publishedAt: editing?.publishedAt ?? Date.now() })
    setEditing(null)
    setDraftId(crypto.randomUUID())
    setTried(false)
    setRawDraft({ ...emptyDraft(now, draft.type), start: draft.start, end: draft.end })
  }

  const startEdit = (notice: Notice) => {
    setTried(false)
    setEditing(notice)
    setRawDraft(draftFromNotice(notice))
  }

  const cancelEdit = () => {
    setTried(false)
    setEditing(null)
    setRawDraft(emptyDraft(now))
  }

  return (
    <Column
      step={2}
      title="어드민 공지 발행"
      hint="발행 대상 설정을 바꿔 여러 공지를 발행해 비교"
      onReset={() => {
        cancelEdit()
        onReset()
      }}
      aside={
        <>
          <Group title={`발행된 공지 (${notices.length})`}>
            {notices.length === 0 && <Empty>아직 발행된 공지가 없습니다.</Empty>}
            {evaluations.map((evaluation) => {
              const { notice } = evaluation
              return (
                <article
                  key={notice.id}
                  className={`space-y-1 rounded-lg border p-2 ${
                    editing?.id === notice.id ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <p className="min-w-0 flex-1 text-[15px] font-medium leading-6 text-slate-900">{notice.title}</p>
                    <span className="shrink-0">{periodStatus(notice, now)}</span>
                  </div>
                  <dl className="grid grid-cols-[auto_1fr] items-start gap-x-2 gap-y-1 text-[13px] leading-5 text-slate-600">
                    <dt className="leading-6 text-slate-400">유형</dt>
                    <dd className="flex flex-wrap gap-1">
                      <Chip tone={notice.type === 'app' ? 'blue' : 'teal'}>{TYPE_LABEL[notice.type]}</Chip>
                      {notice.important && <Chip tone="red">중요</Chip>}
                    </dd>
                    <dt className="text-slate-400">기간</dt>
                    <dd>{formatPeriod(notice.period)}</dd>
                    <dt className="leading-6 text-slate-400">국가</dt>
                    <dd>
                      <ScopeBadges scope={notice.countries} nameOf={countryName} />
                    </dd>
                    {notice.cities && (
                      <>
                        <dt className="leading-6 text-slate-400">도시</dt>
                        <dd>
                          <ScopeBadges scope={notice.cities} nameOf={cityName} />
                        </dd>
                      </>
                    )}
                    {notice.services && (
                      <>
                        <dt className="leading-6 text-slate-400">서비스</dt>
                        <dd>
                          <ScopeBadges scope={notice.services} nameOf={serviceName} />
                        </dd>
                      </>
                    )}
                  </dl>
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" onClick={() => startEdit(notice)}>
                      수정
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => {
                        if (editing?.id === notice.id) cancelEdit()
                        onDelete(notice.id)
                      }}
                    >
                      삭제
                    </Button>
                  </div>
                </article>
              )
            })}
          </Group>
        </>
      }
    >
      <div
        className="space-y-3"
      >
        {editing && (
          <p className="rounded-lg bg-blue-50 px-3 py-2 text-[14px] font-medium text-blue-800 ring-1 ring-blue-200">
            "{editing.title}" 수정 중. 저장하면 scope 스냅샷이 현재 구성 기준으로 다시 만들어집니다.
          </p>
        )}

        <Group title="공지 유형">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
            {(['app', 'mobility'] as NoticeType[]).map((type) => (
              <button
                key={type}
                type="button"
                className={`rounded-md py-1.5 text-[15px] font-medium ${
                  draft.type === type
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                onClick={() => update({ type })}
              >
                {TYPE_LABEL[type]}
              </button>
            ))}
          </div>
        </Group>

        <Group title="게시 기간">
          <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1">
            <span className="text-[14px] text-slate-500">시작</span>
            <DateTimeInput value={draft.start} onChange={(start) => update({ start })} />
            <span className="text-[14px] text-slate-500">종료</span>
            <DateTimeInput value={draft.end} onChange={(end) => update({ end })} />
          </div>
        </Group>

        <BlockDivider />

        <Group title="제목 · 본문 (선택)">
          <input
            className={inputClass}
            value={draft.title}
            placeholder={placeholderTitle(draft.type)}
            onChange={(e) => update({ title: e.target.value })}
          />
          <textarea
            className={`${inputClass} resize-none`}
            rows={2}
            value={draft.body}
            placeholder={PLACEHOLDER_BODY}
            onChange={(e) => update({ body: e.target.value })}
          />
        </Group>

        <div className="rounded-lg border border-slate-200 p-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[15px] font-semibold text-slate-800">중요 공지</span>
            <Switch
              label="중요 공지"
              checked={draft.important}
              onChange={(important) => update({ important })}
            />
          </div>
          <p className="mt-1 text-[13px] leading-5 text-slate-500">
            {draft.type === 'app'
              ? '대상 국가 사용자에게 앱 실행 시 팝업이 뜹니다.'
              : '대상 서비스를 예약했거나 이용 중이고, 그 기간이 게시 기간과 겹치는 사용자에게 팝업이 뜹니다.'}
          </p>
        </div>

        <BlockDivider />

        <ScopePicker
          unit="국가"
          options={config.countries}
          value={draft.countries}
          onChange={(countries) => update({ countries })}
          emptyText="열 1에서 국가를 먼저 설정하세요."
        />

        {draft.type === 'mobility' && hasCountries && (
          <>
            <ScopePicker
              unit="도시"
              options={cityOpts.map((c) => ({ ...c, group: countryName(c.countryId) }))}
              value={draft.cities}
              onChange={(cities) => update({ cities })}
              emptyText="선택한 국가에 도시가 없습니다."
            />
            {hasCities && (
              <ScopePicker
                unit="서비스"
                options={serviceOpts}
                value={draft.services}
                onChange={(services) => update({ services })}
                emptyText="선택한 도시에서 제공되는 서비스가 없습니다."
              />
            )}
            {hasCities && (draft.services.all || draft.services.ids.length > 0) && (
              <p
                className={`rounded-md px-2 py-1.5 text-[14px] leading-5 ${
                  serviceWide ? 'bg-teal-50 text-teal-800' : 'bg-blue-50 text-blue-800'
                }`}
              >
                {serviceWide
                  ? `"서비스 전체" 공지 → Ride 탭에 노출${draft.services.all ? '' : ' (선택 가능한 서비스를 전부 골랐기 때문)'}`
                  : '특정 서비스 지정 공지 → 각 서비스 랜딩에 노출'}
              </p>
            )}
          </>
        )}

        <div className="flex items-center gap-2">
          <Button variant="primary" size="lg" className="flex-1" onClick={submit}>
            {editing ? '수정 저장' : '발행'}
          </Button>
          {editing && (
            <Button size="lg" onClick={cancelEdit}>
              취소
            </Button>
          )}
        </div>
        {error && <p className={`text-[14px] ${tried ? 'font-medium text-red-600' : 'text-slate-500'}`}>{error}</p>}
      </div>

    </Column>
  )
}
