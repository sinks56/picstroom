import { defineConfig } from 'vitest/config'

export default defineConfig({
  define: { __APP_VERSION__: '"test"', __CAP_BUILD__: 'false' },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'happy-dom'
  }
})
