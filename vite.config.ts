import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

// Configuración única para Vite (dev/build) y Vitest (tests), de modo que
// ambos siempre comparten el alias `@` y el plugin de Vue.
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // jsdom simula el DOM para poder montar componentes Vue en los tests.
    environment: 'jsdom',
    globals: true,
    // Se usa el pool de hilos y no el de procesos: en Node v25 el pool de
    // forks no consigue arrancar el worker y Vitest agota el tiempo de espera.
    pool: 'threads',
    include: ['src/**/*.spec.ts'],
    setupFiles: ['./src/test/setup.ts'],
  },
})
