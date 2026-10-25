import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      src: fileURLToPath(new URL('./src', import.meta.url)),
      react: fileURLToPath(
        new URL('../../../../node_modules/react', import.meta.url),
      ),
      'react-dom': fileURLToPath(
        new URL('../../../../node_modules/react-dom', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'jsdom',
    include: [
      'packages/twenty-apps/internal/katfit-studio/src/front-components/components/__tests__/*.test.tsx',
    ],
  },
});
