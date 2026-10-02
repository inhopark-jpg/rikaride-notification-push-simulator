/**
 * 개발 서버(npm run dev)에 붙는 자동 저장 API.
 * 브라우저는 로컬 폴더에 직접 쓸 수 없으므로, 이 API가 대신 presets/_autosave.json 을 읽고 쓴다.
 *
 *   GET    /api/autosave         자동 저장된 작업 상태
 *   PUT    /api/autosave         작업 상태 자동 저장
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import type { Plugin } from 'vite'

export const AUTOSAVE_FILE = '_autosave.json'
const MAX_BODY = 10 * 1024 * 1024

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY) reject(new Error('저장할 데이터가 너무 큽니다'))
      else chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

async function readJson(file: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

async function writeJson(file: string, raw: string) {
  const data: unknown = JSON.parse(raw) // JSON이 아니면 여기서 실패
  await writeFile(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

async function handle(dir: string, req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const method = req.method ?? 'GET'
  await mkdir(dir, { recursive: true })

  if (url.pathname === '/autosave') {
    const file = path.join(dir, AUTOSAVE_FILE)
    if (method === 'GET') {
      const data = await readJson(file)
      return (data === null ? send(res, 404, { error: '자동 저장 없음' }) : send(res, 200, data), true)
    }
    if (method === 'PUT') {
      await writeJson(file, await readBody(req))
      return (send(res, 200, { ok: true }), true)
    }
  }

  return false
}

export function presetStore(dir: string): Plugin {
  return {
    name: 'autosave-store',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api', (req, res, next) => {
        handle(dir, req, res)
          .then((handled) => {
            if (!handled) next()
          })
          .catch((error: unknown) =>
            send(res, 500, { error: error instanceof Error ? error.message : String(error) }),
          )
      })
    },
  }
}
