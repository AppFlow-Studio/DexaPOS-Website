import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    resolve: {
        alias: {
            '@': path.resolve(__dirname, '.'),
            // `server-only` throws on import outside a React Server Component,
            // which is the point of it — but Vitest is neither a server nor a
            // client bundle, so any module graph that reaches a server module
            // fails to load rather than failing an assertion. Next enforces the
            // boundary at build time through the bundler; this shim only stops
            // the marker package from breaking test collection.
            //
            // It does not weaken `render.test.tsx`, which guards the render
            // graph by grepping source imports rather than by loading modules.
            'server-only': path.resolve(__dirname, 'test/stubs/server-only.ts'),
        },
    },
    test: {
        globals: true,
        environment: 'node',
    },
});
