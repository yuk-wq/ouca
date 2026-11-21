import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const { version } = JSON.parse(
  readFileSync(resolve(import.meta.dirname, 'package.json'), 'utf8'),
) as {
  version: string;
};

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
  },
});
