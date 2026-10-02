/**
 * 서비스 Configuration(국가 → 도시 → 서비스) 편집 연산과 목업 데이터.
 */
import type { Id, ServiceConfig } from './types'

export const EMPTY_CONFIG: ServiceConfig = { countries: [], cities: [], services: [] }

// 이름에서 id를 만든다. 프리셋에서 같은 id를 참조할 수 있고, 같은 이름은 중복 추가되지 않는다.
export const countryId = (name: string): Id => `co-${name}`
export const cityId = (name: string): Id => `ci-${name}`
export const serviceId = (name: string): Id => `sv-${name}`

// ── 목업 풀 ────────────────────────────────────────────────
export const BASE_SERVICES = ['호출버스', '광역 호출버스', '전담 기사', '공항 셔틀']
const EXTRA_SERVICES = ['관광 택시', '심야 셔틀', '수상 택시']

const COUNTRY_POOL: { name: string; cities: string[] }[] = [
  { name: '한국', cities: ['서울', '부산', '인천', '대구', '제주'] },
  { name: '일본', cities: ['도쿄', '오사카', '후쿠오카', '삿포로'] },
  { name: '태국', cities: ['방콕', '치앙마이', '푸켓'] },
  { name: '베트남', cities: ['하노이', '호치민', '다낭'] },
  { name: '대만', cities: ['타이베이', '가오슝', '타이중'] },
]

// ── 편집 연산 (모두 새 객체를 반환) ─────────────────────────
export function addCountry(config: ServiceConfig, name: string): ServiceConfig {
  const id = countryId(name)
  if (!name || config.countries.some((c) => c.id === id)) return config
  return { ...config, countries: [...config.countries, { id, name }] }
}

export function addCity(
  config: ServiceConfig,
  country: Id,
  name: string,
  serviceIds: Id[] = [],
): ServiceConfig {
  const id = cityId(name)
  if (!name || config.cities.some((c) => c.id === id)) return config
  return { ...config, cities: [...config.cities, { id, name, countryId: country, serviceIds }] }
}

export function addService(
  config: ServiceConfig,
  name: string,
  offerInAllCities = false,
): ServiceConfig {
  const id = serviceId(name)
  if (!name || config.services.some((s) => s.id === id)) return config
  return {
    ...config,
    services: [...config.services, { id, name }],
    cities: offerInAllCities
      ? config.cities.map((c) => ({ ...c, serviceIds: [...c.serviceIds, id] }))
      : config.cities,
  }
}

export function removeCountry(config: ServiceConfig, id: Id): ServiceConfig {
  return {
    ...config,
    countries: config.countries.filter((c) => c.id !== id),
    cities: config.cities.filter((c) => c.countryId !== id),
  }
}

export function removeCity(config: ServiceConfig, id: Id): ServiceConfig {
  return { ...config, cities: config.cities.filter((c) => c.id !== id) }
}

export function removeService(config: ServiceConfig, id: Id): ServiceConfig {
  return {
    ...config,
    services: config.services.filter((s) => s.id !== id),
    cities: config.cities.map((c) => ({
      ...c,
      serviceIds: c.serviceIds.filter((s) => s !== id),
    })),
  }
}

export function toggleCityService(config: ServiceConfig, city: Id, service: Id): ServiceConfig {
  return {
    ...config,
    cities: config.cities.map((c) =>
      c.id !== city
        ? c
        : {
            ...c,
            serviceIds: c.serviceIds.includes(service)
              ? c.serviceIds.filter((s) => s !== service)
              : [...c.serviceIds, service],
          },
    ),
  }
}

/** [[국가, [[도시, [서비스...]], ...]], ...] 형태의 스펙으로 구성을 만든다 */
export type ConfigSpec = [country: string, cities: [city: string, services: string[]][]][]

export function configFromSpec(spec: ConfigSpec, services: string[] = BASE_SERVICES): ServiceConfig {
  let config = EMPTY_CONFIG
  for (const name of services) config = addService(config, name)
  for (const [country, cities] of spec) {
    config = addCountry(config, country)
    for (const [city, cityServices] of cities) {
      config = addCity(config, countryId(country), city, cityServices.map(serviceId))
    }
  }
  return config
}

// ── 랜덤 생성 / 신규 추가 시뮬레이션 ─────────────────────────
type Rng = () => number

function shuffle<T>(items: T[], rng: Rng): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

const between = (min: number, max: number, rng: Rng) => min + Math.floor(rng() * (max - min + 1))

/** 도시마다 서로 다른 1~3개의 서비스를 뽑는다 */
function randomServices(pool: string[], rng: Rng): string[] {
  const picked = new Set(shuffle(pool, rng).slice(0, between(1, Math.min(3, pool.length), rng)))
  return pool.filter((s) => picked.has(s))
}

export function randomConfig(rng: Rng = Math.random): ServiceConfig {
  const spec: ConfigSpec = shuffle(COUNTRY_POOL, rng)
    .slice(0, between(2, 4, rng))
    .map((country) => [
      country.name,
      shuffle(country.cities, rng)
        .slice(0, between(2, Math.min(4, country.cities.length), rng))
        .map((city) => [city, randomServices(BASE_SERVICES, rng)]),
    ])
  return configFromSpec(spec)
}

/** 풀에서 아직 쓰지 않은 이름 중 하나를 무작위로 고르고, 다 썼으면 "○○ N"을 만든다 */
function suggestName(pool: string[], taken: (name: string) => boolean, fallback: string, rng: Rng): string {
  const unused = pool.filter((name) => !taken(name))
  if (unused.length > 0) return unused[Math.floor(rng() * unused.length)]
  for (let n = 1; ; n++) {
    if (!taken(`${fallback} ${n}`)) return `${fallback} ${n}`
  }
}

/** "국가 추가" 입력칸에 보여줄 이름 */
export function suggestCountryName(config: ServiceConfig, rng: Rng = Math.random): string {
  return suggestName(
    COUNTRY_POOL.map((c) => c.name),
    (n) => config.countries.some((c) => c.id === countryId(n)),
    '신규 국가',
    rng,
  )
}

/** "도시 추가" 입력칸에 보여줄 이름 (그 국가의 도시 풀에서) */
export function suggestCityName(config: ServiceConfig, country: Id, rng: Rng = Math.random): string {
  const countryName = config.countries.find((c) => c.id === country)?.name ?? ''
  return suggestName(
    COUNTRY_POOL.find((c) => c.name === countryName)?.cities ?? [],
    (n) => config.cities.some((c) => c.id === cityId(n)),
    `${countryName} 신도시`,
    rng,
  )
}

/** "서비스 추가" 입력칸에 보여줄 이름 */
export function suggestServiceName(config: ServiceConfig, rng: Rng = Math.random): string {
  return suggestName(
    [...BASE_SERVICES, ...EXTRA_SERVICES],
    (n) => config.services.some((s) => s.id === serviceId(n)),
    '신규 서비스',
    rng,
  )
}
