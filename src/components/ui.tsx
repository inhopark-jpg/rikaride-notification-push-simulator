import { useRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { useTouchEmulation } from './touch'

const NO_REF = { current: null }
import { fromInputValue, toInputValue } from '../domain/format'

export const inputClass =
  'w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-[15px] text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-400'

export function Column({
  step,
  title,
  hint,
  onReset,
  resetDisabled,
  aside,
  touch,
  children,
}: {
  step: number
  title: string
  hint: string
  /** 헤더 아래 "초기화" 버튼 */
  onReset?: () => void
  resetDisabled?: boolean
  /** 있으면 본문을 좌우 두 열로 나누고 오른쪽 열에 놓는다. 각 열은 따로 스크롤된다. */
  aside?: ReactNode
  /** 본문(헤더 제외)에서 마우스를 손가락처럼: 동그라미 커서, 누른 채 끌어 스크롤 */
  touch?: boolean
  children: ReactNode
}) {
  const bodyRef = useRef<HTMLDivElement>(null)
  useTouchEmulation(touch ? bodyRef : NO_REF)
  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
      <header className="shrink-0 bg-slate-900 px-3 py-2.5">
        <div className="flex min-h-7 items-center gap-2">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white text-[13px] font-semibold text-slate-900">
            {step}
          </span>
          <h2 className="min-w-0 flex-1 text-[16px] font-semibold text-white">{title}</h2>
        </div>
        <p className="pl-8 text-[13px] leading-5 text-slate-400">{hint}</p>
        {onReset && (
          <div className="mt-2 pl-8">
            <Button variant="inverse" onClick={onReset} disabled={resetDisabled}>
              초기화
            </Button>
          </div>
        )}
      </header>
      {aside ? (
        <div className="grid min-h-0 flex-1 grid-cols-2 divide-x divide-slate-200">
          <div className="min-h-0 space-y-4 overflow-y-auto p-3">{children}</div>
          <div className="min-h-0 space-y-4 overflow-y-auto bg-slate-100 p-3">{aside}</div>
        </div>
      ) : (
        <div
          ref={bodyRef}
          className={`min-h-0 flex-1 space-y-4 overflow-y-auto p-3 ${touch ? 'touch-surface select-none' : ''}`}
        >
          {children}
        </div>
      )}
    </section>
  )
}

/** 섹션 사이 회색 띠 구분선. 열 본문 좌우 여백(p-3)까지 꽉 채운다. */
export function BlockDivider() {
  return <div role="separator" className="-mx-3 h-4 bg-slate-100" />
}

export function Group({
  title,
  aside,
  children,
}: {
  title: string
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[14px] font-semibold text-slate-700">{title}</h3>
        {aside}
      </div>
      {children}
    </div>
  )
}

type ButtonVariant = 'default' | 'primary' | 'ghost' | 'danger' | 'inverse'

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  default: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
  primary: 'border border-blue-600 bg-blue-600 text-white hover:bg-blue-700',
  ghost: 'text-slate-500 hover:bg-slate-100 hover:text-slate-800',
  danger: 'text-slate-400 hover:bg-red-50 hover:text-red-600',
  /** 어두운 배경 위 outline 버튼 */
  inverse: 'border border-white/40 bg-transparent text-white hover:bg-white/10',
}

export function Button({
  variant = 'default',
  className = '',
  size = 'md',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'md' | 'lg' }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-1 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        size === 'lg' ? 'h-10 rounded-lg px-4 text-[15px]' : 'px-2 py-1 text-[14px]'
      } ${BUTTON_VARIANT[variant]} ${className}`}
      {...props}
    />
  )
}

export function Check({
  label,
  checked,
  onChange,
  disabled,
  className = '',
}: {
  label: ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  className?: string
}) {
  return (
    <label
      className={`inline-flex items-center gap-1.5 text-[15px] text-slate-800 ${disabled ? 'cursor-not-allowed opacity-60' : ''} ${className}`}
    >
      <input
        type="checkbox"
        className="size-4 accent-blue-600"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  )
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
        checked ? 'bg-blue-600' : 'bg-slate-300'
      }`}
    >
      <span
        className={`inline-block size-5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-[22px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

type ChipTone = 'neutral' | 'blue' | 'teal' | 'red' | 'amber' | 'green'

const CHIP_TONE: Record<ChipTone, string> = {
  neutral: 'bg-slate-100 text-slate-600',
  blue: 'bg-blue-50 text-blue-700',
  teal: 'bg-teal-50 text-teal-700',
  red: 'bg-red-50 text-red-700',
  amber: 'bg-amber-50 text-amber-800',
  green: 'bg-emerald-50 text-emerald-700',
}

export function Chip({ tone = 'neutral', children }: { tone?: ChipTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[13px] font-medium leading-5 ${CHIP_TONE[tone]}`}
    >
      {children}
    </span>
  )
}

export function DateTimeInput({
  value,
  onChange,
}: {
  value: number
  onChange: (ms: number) => void
}) {
  return (
    <input
      type="datetime-local"
      className={inputClass}
      value={toInputValue(value)}
      onChange={(e) => {
        const ms = fromInputValue(e.target.value)
        if (ms !== null) onChange(ms)
      }}
    />
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md border border-dashed border-slate-300 px-3 py-3 text-center text-[14px] text-slate-400">
      {children}
    </p>
  )
}
