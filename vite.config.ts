import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ command, mode }) => ({
  // `npm run dev` serves the demo; `npm run build` builds the library.
  // vitest also runs as 'serve' (with mode 'test') and needs the project root.
  root: command === 'serve' && mode !== 'test' ? 'demo' : '.',
  build: {
    emptyOutDir: false, // keep the .d.ts files emitted by tsc
    sourcemap: true,
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'Viewer360Lib',
      fileName: '360viewer',
      formats: ['es', 'umd'],
    },
    // index.ts has both named and default exports; UMD users get `Viewer360Lib.Viewer360`.
    rollupOptions: { output: { exports: 'named' } },
  },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.ts'],
  },
}));
