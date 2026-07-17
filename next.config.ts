import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Dev-only: allow the local network host so a phone on the same Wi-Fi can load
  // dev resources (HMR, fonts, CSS) when testing the QR guest flow off-device.
  // Ignored in production builds.
  allowedDevOrigins: ["192.168.1.115"],
  turbopack: {
    root: process.cwd(),
    resolveAlias: {
      // Turbopack follows the exports map `import` condition and resolves
      // `zustand/vanilla` → `./esm/vanilla.mjs` which doesn't exist in zustand 5.
      // A `./`-prefixed path is resolved from the project root by Turbopack
      // directly as a file path, bypassing the exports map entirely.
      'zustand/vanilla': './node_modules/zustand/vanilla.js',
      'zustand/vanilla/shallow': './node_modules/zustand/vanilla/shallow.js',
    },
  },
  transpilePackages: ["zustand"],
  serverExternalPackages: ["resend", "twilio", "telnyx"],
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '6mb',
    },
  },
};

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "appflow-studios",

  project: "dexapos-web",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/api/ingest",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});
