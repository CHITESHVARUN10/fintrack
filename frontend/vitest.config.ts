// Force the development React build in tests — resolving production React
// breaks @testing-library (`React.act is not a function`).
process.env.NODE_ENV = 'test'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
