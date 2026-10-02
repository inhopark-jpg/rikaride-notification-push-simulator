/**
 * 이용자 앱 표출 결과 열에서 마우스를 손가락처럼 쓰게 한다.
 * - 누른 채로 끌면 아래에 있는 스크롤 영역(세로 목록, 가로 카드)을 움직인다.
 * - 빠르게 끌고 놓으면 스마트폰처럼 관성으로 조금 더 미끄러지다 멈춘다.
 * - 끌었다 놓았을 때는 클릭으로 처리하지 않는다.
 * - data-swipe 영역은 자체 스와이프를 쓰므로 건드리지 않는다.
 * 커서 모양은 index.css의 .touch-surface가 맡는다.
 */
import { useEffect } from 'react'
import type { RefObject } from 'react'

/** 이만큼(화면 px) 움직여야 탭이 아닌 드래그로 본다 */
const DRAG_THRESHOLD = 6

type Axis = 'x' | 'y'

/** 관성: 16ms(한 프레임)마다 속도에 곱하는 값. 1에 가까울수록 오래 미끄러진다 */
const FRICTION = 0.95
/** 이보다 느리면(px/ms) 관성을 멈춘다 */
const MIN_VELOCITY = 0.02
/** 놓기 직전 이 시간(ms) 동안의 움직임으로 속도를 잰다 */
const VELOCITY_WINDOW = 100

function scrollable(el: HTMLElement, axis: Axis): boolean {
  const style = getComputedStyle(el)
  const overflow = axis === 'x' ? style.overflowX : style.overflowY
  if (overflow !== 'auto' && overflow !== 'scroll') return false
  return axis === 'x' ? el.scrollWidth > el.clientWidth : el.scrollHeight > el.clientHeight
}

function findScroller(from: HTMLElement, root: HTMLElement, axis: Axis): HTMLElement | null {
  for (let el: HTMLElement | null = from; el && root.contains(el); el = el.parentElement) {
    if (scrollable(el, axis)) return el
  }
  return null
}

/** CSS zoom이 걸린 휴대폰 안에서는 마우스 이동량을 배율로 나눠야 손을 정확히 따라온다 */
const zoomOf = (el: HTMLElement) => (el as HTMLElement & { currentCSSZoom?: number }).currentCSSZoom ?? 1

export function useTouchEmulation(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = ref.current
    if (!root) return

    let drag: {
      target: HTMLElement
      x: number
      y: number
      moved: boolean
      scroller: HTMLElement | null
      axis: Axis | null
      /** 스냅이 있는 영역(가로 카드 등)인지 */
      snap: boolean
      /** 최근 포인터 위치 기록 (속도 계산용) */
      samples: { t: number; pos: number }[]
    } | null = null
    let suppressClick = false
    let momentum = 0

    const stopMomentum = () => {
      cancelAnimationFrame(momentum)
      momentum = 0
    }

    const scrollBy = (el: HTMLElement, axis: Axis, delta: number) => {
      if (axis === 'x') el.scrollLeft += delta
      else el.scrollTop += delta
    }

    /** 놓은 뒤 관성 스크롤. velocity는 화면 px/ms (손가락 방향) */
    const glide = (el: HTMLElement, axis: Axis, velocity: number) => {
      const zoom = zoomOf(el)
      let v = velocity
      let last = performance.now()
      const step = (now: number) => {
        const dt = Math.min(now - last, 32)
        last = now
        const before = axis === 'x' ? el.scrollLeft : el.scrollTop
        scrollBy(el, axis, (-v * dt) / zoom)
        const after = axis === 'x' ? el.scrollLeft : el.scrollTop
        v *= FRICTION ** (dt / 16)
        // 끝에 닿았거나 충분히 느려지면 멈춘다
        if (Math.abs(v) < MIN_VELOCITY || before === after) {
          momentum = 0
          return
        }
        momentum = requestAnimationFrame(step)
      }
      momentum = requestAnimationFrame(step)
    }

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || e.pointerType !== 'mouse') return
      root.dataset.pressed = 'true'
      // 미끄러지는 중에 누르면 손가락으로 잡은 것처럼 멈춘다
      stopMomentum()
      const target = e.target as HTMLElement
      if (target.closest('[data-swipe]')) return
      // 글자 선택·이미지 끌기 대신 스크롤이 되도록
      e.preventDefault()
      drag = {
        target,
        x: e.clientX,
        y: e.clientY,
        moved: false,
        scroller: null,
        axis: null,
        snap: false,
        samples: [],
      }
    }

    const onMove = (e: PointerEvent) => {
      if (!drag) return
      const dx = e.clientX - drag.x
      const dy = e.clientY - drag.y
      if (!drag.moved) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return
        drag.moved = true
        // 처음 움직인 방향으로 축을 고정하고, 그 방향 스크롤 영역을 찾는다
        const first: Axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
        drag.axis = first
        drag.scroller = findScroller(drag.target, root, first)
        // 끄는 동안에는 스냅을 꺼야 손을 따라 움직인다
        if (drag.scroller) {
          drag.snap = getComputedStyle(drag.scroller).scrollSnapType !== 'none'
          drag.scroller.style.scrollSnapType = 'none'
        }
      }
      if (drag.scroller && drag.axis) {
        scrollBy(drag.scroller, drag.axis, -(drag.axis === 'x' ? dx : dy) / zoomOf(drag.scroller))
        const t = performance.now()
        drag.samples.push({ t, pos: drag.axis === 'x' ? e.clientX : e.clientY })
        drag.samples = drag.samples.filter((p) => t - p.t <= VELOCITY_WINDOW)
      }
      drag.x = e.clientX
      drag.y = e.clientY
    }

    const onUp = () => {
      delete root.dataset.pressed
      if (!drag) return
      if (drag.moved) {
        suppressClick = true
        window.setTimeout(() => (suppressClick = false), 0)
        const { scroller, axis, samples } = drag
        if (scroller && axis) {
          // 마지막으로 움직인 지 오래됐으면(멈췄다 놓음) 속도 0
          const t = performance.now()
          const recent = samples.filter((p) => t - p.t <= VELOCITY_WINDOW)
          const first = recent[0]
          const lastSample = recent[recent.length - 1]
          const velocity =
            first && lastSample && lastSample.t > first.t ? (lastSample.pos - first.pos) / (lastSample.t - first.t) : 0
          if (drag.snap) {
            // 스냅 영역은 스냅을 되살린 뒤 던진 방향으로 부드럽게 넘겨 가까운 카드에 맞춘다
            scroller.style.scrollSnapType = ''
            const distance = (-velocity * 200) / zoomOf(scroller)
            scroller.scrollBy({ [axis === 'x' ? 'left' : 'top']: distance, behavior: 'smooth' })
          } else if (Math.abs(velocity) >= MIN_VELOCITY) {
            glide(scroller, axis, velocity)
          }
        }
      }
      drag = null
    }

    const onClick = (e: MouseEvent) => {
      if (!suppressClick) return
      e.preventDefault()
      e.stopPropagation()
      suppressClick = false
    }

    root.addEventListener('pointerdown', onDown)
    root.addEventListener('click', onClick, true)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      stopMomentum()
      root.removeEventListener('pointerdown', onDown)
      root.removeEventListener('click', onClick, true)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [ref])
}
