/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Архив отвечает с CORS `*`, так что прямые запросы тоже сработали бы,
// но проксируем: один origin в dev и в проде (nginx), никаких абсолютных URL в коде.
const ARCHIVE = process.env.ARCHIVE_URL ?? 'http://localhost:8080'

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
