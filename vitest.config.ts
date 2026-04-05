import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    resolve: {
        alias: {
            '@': path.resolve(__dirname, '.'),
        },
    },
    test: {
        globals: true,
        environment: 'node',
        // Environment variables will be read from process.env
        // You can set them in your shell or create a .env.test file
        // 
        // Required:
        // NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 (or your Supabase URL)
        //
        // Recommended for tests (bypasses RLS):
        // SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
        //
        // Alternative (if service role key not available):
        // NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-anon-key
        //
        // Note: Service role key bypasses Row Level Security (RLS) policies,
        // which is typically what you want for tests. You can find it in your
        // Supabase dashboard under Settings > API > service_role key
    },
});

