import { defineConfig } from 'vitest/config'

// Tests ciblent uniquement les fonctions pures (utils/) — pas de rendu React, pas besoin de jsdom.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    reporters: ['verbose'],
  },
})
