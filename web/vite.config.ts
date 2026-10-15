/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Архив отвечает с CORS `*`, так что прямые запросы тоже сработали бы,
// но проксируем: один origin в dev и в проде (nginx), никаких абсолютных URL в коде.
const ARCHIVE = process.env.ARCHIVE_URL ?? 'http://localhost:8080'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // cornerstone3D: загрузчик кадров создаёт воркер через new URL(…, import.meta.url) —
  // после pre-bundle путь ломается, поэтому пакет исключён. А вот его зависимости — CommonJS
  // (dicom-parser, pako, WASM-кодеки Emscripten), их наоборот надо пред-собрать, иначе
  // в браузере у них нет `export default`. Воркеры — ES-модули (в них import кодеков).
  optimizeDeps: {
    exclude: ['@cornerstonejs/dicom-image-loader'],
    include: [
      'dicom-parser',
      'pako',
      '@cornerstonejs/codec-libjpeg-turbo-8bit/decodewasmjs',
      '@cornerstonejs/codec-charls/decodewasmjs',
      '@cornerstonejs/codec-openjpeg/decodewasmjs',
      '@cornerstonejs/codec-openjph/wasmjs',
      '@cornerstonejs/codec-libjxl/decodewasmjs',
    ],
  },
  worker: {
    format: 'es',
  },
  test: {
    // jsdom везде: чистым функциям он не мешает, а компонентным тестам нужен.
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    css: false,
  },
  server: {
    port: 5173,
    proxy: {
      '/dcm4chee-arc': { target: ARCHIVE, changeOrigin: true },
    },
  },
})
