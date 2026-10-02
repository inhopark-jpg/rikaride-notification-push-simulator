import { useEffect, useMemo, useRef, useState } from 'react'
import { AdminColumn } from './components/AdminColumn'
import { ConfigColumn } from './components/ConfigColumn'
import { ResultColumn } from './components/ResultColumn'
import { UserColumn } from './components/UserColumn'
import { EMPTY_CONFIG } from './domain/config'
import { buildPresets } from './domain/presets'
import { SAVED_VERSION } from './domain/saved'
import type { Notice, ServiceConfig, UserState } from './domain/types'
import { evaluateAll, sanitizeUser } from './domain/visibility'
import { storage } from './storage'

const MINUTE = 60 * 1000
const AUTOSAVE_DELAY = 500
const currentMinute = () => Math.floor(Date.now() / MINUTE) * MINUTE

const emptyUser = (): UserState => ({
  countryId: null,
  cityIds: [],
  reservations: [],
  now: currentMinute(),
  dismissedPopupIds: [],
  readNoticeIds: [],
})

interface Scenario {
  config: ServiceConfig
  notices: Notice[]
  user: UserState
  /** 시나리오를 통째로 바꿀 때 발행 폼을 초기화하기 위한 key */
  formKey: number
}

/**
 * ?preset=<id> 로 열면 해당 예시 시나리오(domain/presets.ts)로 시작한다.
 * 이때는 자동 저장을 읽지도 쓰지도 않는다 (작업 중인 상태를 덮어쓰지 않도록).
 */
const urlPresetId = new URLSearchParams(window.location.search).get('preset')

function initialScenario(): Scenario {
  const preset = buildPresets(currentMinute()).find((p) => p.id === urlPresetId)
  return preset
    ? { config: preset.config, notices: preset.notices, user: preset.user, formKey: 0 }
    : { config: EMPTY_CONFIG, notices: [], user: emptyUser(), formKey: 0 }
}

export default function App() {
  const [scenario, setScenario] = useState(initialScenario)
  const { config, notices, formKey } = scenario

  const user = useMemo(() => sanitizeUser(scenario.user, config), [scenario.user, config])
  /** 열 2에서 작성 중인 공지 (발행 전 미리보기, 저장하지 않음) */
  const [preview, setPreview] = useState<Notice | null>(null)
  const shownNotices = useMemo(
    () => (preview ? [...notices.filter((n) => n.id !== preview.id), preview] : notices),
    [notices, preview],
  )
  const view = useMemo(() => evaluateAll(shownNotices, config, user), [shownNotices, config, user])
  // 발행된 공지 목록은 미리보기를 빼고 보여준다
  const published = useMemo(() => evaluateAll(notices, config, user).evaluations, [notices, config, user])

  const patch = (next: Partial<Scenario>) => setScenario((s) => ({ ...s, ...next }))

  // ── 자동 저장 (개발 서버에서만: presets/_autosave.json) ────────
  /** 자동 저장 복원이 끝나기 전에는 자동 저장하지 않는다 (빈 상태로 덮어쓰지 않도록) */
  const [canSave, setCanSave] = useState(false)
  const restoring = useRef(false)

  useEffect(() => {
    if (urlPresetId || restoring.current) return
    restoring.current = true
    storage
      .loadAutosave()
      .then((saved) => {
        if (saved) {
          setScenario((s) => ({
            config: saved.config,
            notices: saved.notices,
            user: saved.user,
            formKey: s.formKey + 1,
          }))
        }
        setCanSave(true)
      })
      // 저장 API가 없는 곳(정적 호스팅)에서는 저장 없이 쓴다
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!canSave) return
    const timer = window.setTimeout(() => {
      storage
        .saveAutosave({
          version: SAVED_VERSION,
          name: '자동 저장',
          description: '',
          savedAt: Date.now(),
          config,
          notices,
          user,
        })
        .catch(() => {})
    }, AUTOSAVE_DELAY)
    return () => window.clearTimeout(timer)
  }, [canSave, config, notices, user])

  return (
    <div className="flex h-screen flex-col bg-slate-300 text-slate-900">
      <header className="shrink-0 border-b border-slate-200 bg-white px-6 py-3">
        <h1 className="text-[18px] font-semibold">리카라이드 공지 발행 시뮬레이터</h1>
      </header>

      <main className="min-h-0 flex-1 overflow-x-auto">
        <div className="grid h-full min-w-[1980px] grid-cols-[280px_640px_520px_minmax(420px,1fr)] gap-5 p-6">
          <ConfigColumn config={config} onChange={(next) => patch({ config: next })} />
          <AdminColumn
            key={formKey}
            config={config}
            now={user.now}
            notices={notices}
            evaluations={published}
            onPreview={setPreview}
            onSave={(notice) =>
              patch({
                notices: notices.some((n) => n.id === notice.id)
                  ? notices.map((n) => (n.id === notice.id ? notice : n))
                  : [...notices, notice],
              })
            }
            onDelete={(id) => patch({ notices: notices.filter((n) => n.id !== id) })}
            onReset={() => patch({ notices: [] })}
          />
          <UserColumn
            config={config}
            user={user}
            onChange={(next) => patch({ user: next })}
            // 앱 설정·예약·현재 시각만 되돌린다 (읽음/닫기 상태는 열 4의 초기화)
            onReset={() =>
              patch({ user: { ...user, countryId: null, cityIds: [], reservations: [], now: currentMinute() } })
            }
          />
          <ResultColumn
            config={config}
            view={view}
            user={user}
            onChangeUser={(next) => patch({ user: next })}
          />
        </div>
      </main>
    </div>
  )
}
