import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
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
    useTypeScriptCli: true,
    serverActions: {
      bodySizeLimit: '6mb',
    },
  },
  /**
   * Routes that have moved.
   *
   * These are declared here rather than as `redirect()` calls in a page
   * component on purpose. A `redirect()` from an App Router page under a
   * `force-dynamic` layout does not produce an HTTP 3xx — the response has
   * already begun streaming, so Next answers 200 and instructs the client
   * router to navigate instead. That path is currently broken: the router
   * state becomes a promise, `useActionQueue` calls `use()` conditionally on
   * exactly that, the hook count changes between renders, and React throws
   * "Rendered more hooks than during the previous render." The merchant sees
   * "This page couldn't load" and the redirect never happens.
   *
   * See https://github.com/vercel/next.js/issues/78396 — it is a bug in Next's
   * own client router (confirmed on 16.2.12), not in anything we wrote, and it
   * takes down every pure path-to-path redirect page in this app.
   *
   * Declared here, a redirect is served by the routing layer before React is
   * involved at all: a real 307, no render, no hydration, and immune to that
   * class of bug. Query strings are carried over automatically.
   *
   * `permanent: false` deliberately — a 308 is cached by browsers indefinitely,
   * which is a poor trade for an internal route that may move again.
   */
  async redirects() {
    return [
      // The editor moved from `/builder?page=<id>` to `/pages/<id>`. The
      // page id was a query parameter and is now a path segment, so this pair
      // has to match on the query and lift it — the second rule catches a
      // request with no `page` at all, which resolves to the home page.
      {
        source: "/dashboard/website/builder",
        has: [{ type: "query", key: "page", value: "(?<pageId>[^&]+)" }],
        destination: "/dashboard/website/pages/:pageId",
        permanent: false,
      },
      {
        source: "/dashboard/website/builder",
        destination: "/dashboard/website/pages/home",
        permanent: false,
      },
      // The design workspace became `/style`, matching what the button that
      // opens it has always been called.
      {
        source: "/dashboard/website/design",
        destination: "/dashboard/website/style",
        permanent: false,
      },
      // `/dashboard/website` was an overview screen. The rebuild has no
      // overview — the page list is the landing screen.
      {
        source: "/dashboard/website",
        destination: "/dashboard/website/pages",
        permanent: false,
      },
    ];
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
