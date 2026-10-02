import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { presetStore } from './server/presetStore.ts'

const presetsDir = fileURLToPath(new URL('./presets', import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), presetStore(presetsDir)],
  server: {
    // 프리셋/자동 저장 파일이 바뀌어도 페이지를 새로고침하지 않는다
    watch: { ignored: ['**/presets/**'] },
  },
})
