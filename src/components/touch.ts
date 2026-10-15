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
/** 스냅 영역에서 놓은 뒤 카드에 맞춰지는 애니메이션 길이(ms). 던진 속도에 맞춰 이 범위에서 정한다 */
const SNAP_DURATION = 320
const SNAP_DURATION_MIN = 180
const SNAP_DURATION_MAX = 450
/** 이보다 빠르게(px/ms) 던지면 끌기 시작한 카드에서 한 칸 넘어간다 */
const FLICK_VELOCITY = 0.3

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3

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
      /** 끌기 시작할 때 스크롤 위치 (던지기는 여기서 한 칸만 넘긴다) */
      startScroll: number
    } | null = null
    let suppressClick = false
    let momentum = 0

    // 스냅 애니메이션·관성 중에 다시 누르면 그 자리에서 멈춘다.
    // 스냅 영역은 스냅을 끈 채(data-snap-off)로 두고, 다음 놓기에서 직접 맞춘 뒤 되살린다.
    const stopMomentum = () => {
      cancelAnimationFrame(momentum)
      momentum = 0
    }

    /** 놓은 뒤 스냅 위치(카드 시작점)까지 직접 부드럽게 이동하고, 도착하면 CSS 스냅을 되살린다 */
    const snapTo = (el: HTMLElement, axis: Axis, velocity: number, startScroll: number) => {
      const zoom = zoomOf(el)
      const style = getComputedStyle(el)
      const padding = parseFloat(axis === 'x' ? style.scrollPaddingLeft : style.scrollPaddingTop) || 0
      const box = el.getBoundingClientRect()
      const from = axis === 'x' ? el.scrollLeft : el.scrollTop
      const max = axis === 'x' ? el.scrollWidth - el.clientWidth : el.scrollHeight - el.clientHeight
      const points = [...el.children]
        .filter((c) => getComputedStyle(c).scrollSnapAlign !== 'none')
        .map((c) => {
          const r = c.getBoundingClientRect()
          const offset = (axis === 'x' ? r.left - box.left : r.top - box.top) / zoom + from
          return Math.min(max, Math.max(0, offset - padding))
        })
      const restore = () => {
        el.style.scrollSnapType = ''
        delete el.dataset.snapOff
      }
      if (points.length === 0) return restore()

      // 같은 위치로 겹치는 스냅 지점(끝 카드들이 max로 모임)은 하나로
      const stops = [...new Set(points.map((p) => Math.round(p)))].sort((a, b) => a - b)
      const nearestIndex = (pos: number) =>
        stops.reduce((best, p, i) => (Math.abs(p - pos) < Math.abs(stops[best] - pos) ? i : best), 0)
      // 천천히 놓으면 가장 가까운 카드, 던지면 끌기 시작한 카드에서 던진 방향으로 정확히 한 칸
      let index = nearestIndex(from)
      if (Math.abs(velocity) >= FLICK_VELOCITY) {
        const base = nearestIndex(startScroll)
        index = Math.max(0, Math.min(stops.length - 1, base + (velocity < 0 ? 1 : -1)))
      }
      const to = stops[index]
      const distance = to - from
      if (Math.abs(distance) < 0.5) return restore()

      // 손을 뗄 때의 속도로 이어서 미끄러지도록 길이를 정한다 (easeOutCubic 시작 속도 = 3 × 거리 / 길이)
      const speed = Math.abs(velocity) / zoom
      const sameDirection = Math.sign(-velocity) === Math.sign(distance)
      const duration =
        speed > 0.05 && sameDirection
          ? Math.min(SNAP_DURATION_MAX, Math.max(SNAP_DURATION_MIN, (3 * Math.abs(distance)) / speed))
          : SNAP_DURATION

      // rAF 시각은 이 함수 호출보다 앞설 수 있으므로 첫 프레임 시각을 시작으로 삼는다 (뒤로 튀는 현상 방지)
      let start = -1
      const step = (now: number) => {
        // 첫 프레임에서도 한 프레임만큼 진행해 멈칫하지 않게
        if (start < 0) start = now - 16
        const t = Math.min(1, (now - start) / duration)
        const pos = from + distance * easeOutCubic(t)
        if (axis === 'x') el.scrollLeft = pos
        else el.scrollTop = pos
        if (t < 1) momentum = requestAnimationFrame(step)
        else {
          momentum = 0
          restore()
        }
      }
      momentum = requestAnimationFrame(step)
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
        const dt = Math.max(0, Math.min(now - last, 32))
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
        startScroll: 0,
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
          drag.snap =
            drag.scroller.dataset.snapOff === 'true' ||
            getComputedStyle(drag.scroller).scrollSnapType !== 'none'
          drag.scroller.style.scrollSnapType = 'none'
          if (drag.snap) drag.scroller.dataset.snapOff = 'true'
          drag.startScroll = first === 'x' ? drag.scroller.scrollLeft : drag.scroller.scrollTop
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
            snapTo(scroller, axis, velocity, drag.startScroll)
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
