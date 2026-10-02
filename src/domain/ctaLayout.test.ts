import { describe, expect, it } from 'vitest'
import { layoutCandidates, layoutCtas } from './ctaLayout'

describe('서비스 CTA 배치', () => {
  it('우선순위는 Figma와 같다: third 많은 순 → half 많은 순 → 전부 full', () => {
    expect(layoutCandidates(3)).toEqual([
      { full: 0, half: 0, third: 3 },
      { full: 1, half: 2, third: 0 },
      { full: 3, half: 0, third: 0 },
    ])
    expect(layoutCandidates(5)[0]).toEqual({ full: 0, half: 2, third: 3 })
    expect(layoutCandidates(6)[0]).toEqual({ full: 0, half: 0, third: 6 })
  })

  it('이름이 짧으면 3열로 가로 배치', () => {
    expect(layoutCtas(['호출버스', '전담 기사', '공항 셔틀'])).toEqual(['third', 'third', 'third'])
  })

  it('3열에 안 들어가는 이름이 있으면 다음 우선순위로', () => {
    expect(layoutCtas(['호출버스', '광역 호출버스', '전담 기사'])).toEqual(['full', 'half', 'half'])
  })

  it('이름이 아주 길면 전부 세로로 쌓는다', () => {
    const long = '아주 긴 서비스 이름 예시입니다'
    expect(layoutCtas([long, long, long])).toEqual(['full', 'full', 'full'])
  })

  it('1개는 full, 2개는 반반', () => {
    expect(layoutCtas(['호출버스'])).toEqual(['full'])
    expect(layoutCtas(['호출버스', '공항 셔틀'])).toEqual(['half', 'half'])
  })
})
