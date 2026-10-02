/**
 * Ride 탭 서비스 CTA 배치.
 * Figma ".unpub_service-cta-layout"(node 12806:169247) 규칙:
 * - 6열 그리드에서 카드가 full(6) / half(3) / third(2) 너비를 차지한다.
 * - 위에서부터 full 줄 → half 줄(2개씩) → third 줄(3개씩) 순서.
 * - layout-priority 1st가 가장 촘촘한 배치(third 많은 순 → half 많은 순), 마지막이 전부 full.
 * 서비스 이름이 해당 너비에 한 줄로 들어가는 가장 앞선 우선순위를 고른다.
 */

export type CtaSpan = 'full' | 'half' | 'third'

/** 휴대폰 너비 390, 좌우 여백 20, 카드 간격 8 기준 카드 안 글자 영역 너비와 글자 크기 */
export const CTA_TEXT: Record<CtaSpan, { width: number; fontSize: number }> = {
  full: { width: 350 - 32, fontSize: 20 },
  half: { width: (350 - 8) / 2 - 32, fontSize: 18 },
  third: { width: (350 - 16) / 3 - 32, fontSize: 14 },
}

/** 한 줄 글자 폭 추정: 한글 1em, 공백 0.3em, 그 외 0.6em */
export function estimateTextWidth(text: string, fontSize: number): number {
  let em = 0
  for (const ch of text) {
    if (/\s/.test(ch)) em += 0.3
    else if (/[\u3131-\u318E\uAC00-\uD7A3\u4E00-\u9FFF]/.test(ch)) em += 1
    else em += 0.6
  }
  return em * fontSize
}

export const fitsSpan = (name: string, span: CtaSpan) =>
  estimateTextWidth(name, CTA_TEXT[span].fontSize) <= CTA_TEXT[span].width

/** 항목 수 n에 대해 가능한 배치를 우선순위 순서로 (third 많은 순, 그다음 half 많은 순) */
export function layoutCandidates(n: number): { full: number; half: number; third: number }[] {
  const out: { full: number; half: number; third: number }[] = []
  for (let third = n - (n % 3); third >= 0; third -= 3) {
    const rest = n - third
    for (let half = rest - (rest % 2); half >= 0; half -= 2) {
      out.push({ full: rest - half, half, third })
    }
  }
  return out
}

/** 순서를 유지한 채 각 서비스의 카드 너비를 정한다 */
export function layoutCtas(names: string[]): CtaSpan[] {
  for (const { full, half } of layoutCandidates(names.length)) {
    const spans = names.map((_, i): CtaSpan => (i < full ? 'full' : i < full + half ? 'half' : 'third'))
    if (names.every((name, i) => fitsSpan(name, spans[i]))) return spans
  }
  return names.map(() => 'full')
}
