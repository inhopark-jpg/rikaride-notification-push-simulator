import { useState } from 'react'
import {
  EMPTY_CONFIG,
  addCity,
  addCountry,
  addService,
  removeCity,
  removeCountry,
  removeService,
  suggestCityName,
  suggestCountryName,
  suggestServiceName,
  toggleCityService,
} from '../domain/config'
import type { ServiceConfig } from '../domain/types'
import { BlockDivider, Button, Check, Column, Empty, Group, inputClass } from './ui'

/**
 * 새 항목 추가. 버튼을 누르면 이름 입력칸이 열리고, 무작위 이름이 placeholder로 제안된다.
 * 이름을 비워 두고 추가하면 제안된 이름으로 추가한다. Enter로 추가, Esc로 취소.
 */
function AddRow({
  label,
  variant,
  suggest,
  onAdd,
}: {
  label: string
  variant: 'primary' | 'default'
  suggest: () => string
  onAdd: (name: string) => void
}) {
  const [draft, setDraft] = useState<{ name: string; suggestion: string } | null>(null)
  const submit = () => {
    if (!draft) return
    onAdd(draft.name.trim() || draft.suggestion)
    setDraft(null)
  }
  if (!draft) {
    return (
      <Button
        variant={variant}
        size="lg"
        className="w-full"
        onClick={() => setDraft({ name: '', suggestion: suggest() })}
      >
        + {label}
      </Button>
    )
  }
  return (
    <div className="space-y-1.5 rounded-lg border border-blue-300 bg-blue-50/60 p-2">
      <input
        autoFocus
        className={inputClass}
        value={draft.name}
        placeholder={draft.suggestion}
        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return
          if (e.key === 'Enter') submit()
          if (e.key === 'Escape') setDraft(null)
        }}
      />
      <div className="flex justify-end gap-1">
        <Button variant="ghost" onClick={() => setDraft(null)}>
          취소
        </Button>
        <Button variant="primary" onClick={submit}>
          추가
        </Button>
      </div>
    </div>
  )
}

export function ConfigColumn({
  config,
  onChange,
}: {
  config: ServiceConfig
  onChange: (config: ServiceConfig) => void
}) {
  const isEmpty = config.countries.length === 0 && config.services.length === 0

  return (
    <Column
      step={1}
      title="서비스 Configuration"
      hint="국가 → 도시 → 제공 서비스 매핑"
      onReset={() => onChange(EMPTY_CONFIG)}
      resetDisabled={isEmpty}
    >
      <Group title={`제공되는 서비스 종류 (${config.services.length})`}>
        <div className="flex flex-wrap gap-1">
          {config.services.map((s) => (
            <span
              key={s.id}
              className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 py-0.5 pl-2 pr-1 text-[14px] text-slate-700"
            >
              {s.name}
              <button
                type="button"
                className="rounded-full px-1 text-slate-400 hover:bg-red-100 hover:text-red-600"
                aria-label={`${s.name} 삭제`}
                onClick={() => onChange(removeService(config, s.id))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <AddRow
          label="서비스 추가"
          variant="primary"
          suggest={() => suggestServiceName(config)}
          onAdd={(name) => onChange(addService(config, name))}
        />
      </Group>

      <BlockDivider />

      <Group title={`국가 (${config.countries.length})`}>
        {config.countries.length === 0 && (
          <Empty>비어 있습니다. 아래에서 국가를 추가하세요.</Empty>
        )}
        {config.countries.map((country) => {
          const cities = config.cities.filter((c) => c.countryId === country.id)
          return (
            <div key={country.id} className="rounded-lg border border-slate-200">
              <div className="flex items-center justify-between gap-2 rounded-t-lg bg-slate-50 px-2 py-1.5">
                <span className="text-[15px] font-semibold text-slate-900">{country.name}</span>
                <Button
                  variant="danger"
                  aria-label={`${country.name} 삭제`}
                  onClick={() => onChange(removeCountry(config, country.id))}
                >
                  삭제
                </Button>
              </div>
              <div className="space-y-2 p-2">
                {cities.length === 0 && (
                  <p className="text-[14px] text-slate-400">도시가 없습니다.</p>
                )}
                {cities.map((city) => (
                  <div key={city.id} className="rounded-md bg-slate-50 px-2 py-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[14px] font-medium text-slate-800">{city.name}</span>
                      <button
                        type="button"
                        className="rounded px-1 text-[14px] text-slate-400 hover:bg-red-100 hover:text-red-600"
                        aria-label={`${city.name} 삭제`}
                        onClick={() => onChange(removeCity(config, city.id))}
                      >
                        ×
                      </button>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                      {config.services.map((s) => (
                        <Check
                          key={s.id}
                          className="!text-[14px]"
                          label={s.name}
                          checked={city.serviceIds.includes(s.id)}
                          onChange={() => onChange(toggleCityService(config, city.id, s.id))}
                        />
                      ))}
                      {config.services.length === 0 && (
                        <span className="text-[13px] text-slate-400">서비스 종류를 먼저 추가하세요.</span>
                      )}
                    </div>
                  </div>
                ))}
                <AddRow
                  label={`${country.name}에 도시 추가`}
                  variant="default"
                  suggest={() => suggestCityName(config, country.id)}
                  onAdd={(name) => onChange(addCity(config, country.id, name))}
                />
              </div>
            </div>
          )
        })}
        <AddRow
          label="국가 추가"
          variant="primary"
          suggest={() => suggestCountryName(config)}
          onAdd={(name) => onChange(addCountry(config, name))}
        />
      </Group>
    </Column>
  )
}
