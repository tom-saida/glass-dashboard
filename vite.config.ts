import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Vibe renders CustomSvgIcon only for an SVG given by URL: `<Icon type="src">` and an
 * AvatarBadge with `src` (fetched and sanitised with DOMPurify via react-inlinesvg). The dashboard
 * uses neither; every icon is a component from @vibe/icons. Resolving that one module to a null
 * component keeps DOMPurify, react-inlinesvg and react-from-dom (about 48 KB raw, 16 KB gzipped)
 * out of the bundle. Those two forms would render nothing.
 */
function vibeNoSrcIcons(): Plugin {
  const STUB = '\0katie:vibe-custom-svg-icon-stub'
  return {
    name: 'katie:vibe-no-src-icons',
    enforce: 'pre',
    resolveId(source, importer) {
      if (
        importer &&
        /[\\/]@vibe[\\/]core[\\/]/.test(importer) &&
        /CustomSvgIcon[\\/]CustomSvgIcon\.js$/.test(source)
      ) {
        return STUB
      }
      return null
    },
    load(id) {
      return id === STUB ? 'export default function CustomSvgIcon() { return null }\n' : null
    },
  }
}

// The dashboard is served by the backend server at /dash/, same origin as /api/dash/*; the built
// app reads no environment at runtime and holds no credential.
//
// Development against a real API goes through this proxy. DASH_API_TARGET (default the box),
// DASH_USER and DASH_PASS come from the process environment or a git-ignored .env.local (the
// process environment wins). The Authorization header is added here, server side, and never
// reaches the client bundle. Without the pair nothing is proxied: use ?mock=1, or the stand-in
// box in scripts/fake-api.mjs:
//   DASH_API_TARGET=http://127.0.0.1:5190 DASH_USER=demo DASH_PASS=<dummy> npx vite
export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.DASH_API_TARGET || 'http://127.0.0.1:5190'
  // The closers' demo (npm run dev:demo / build:demo) has no backend: nothing is proxied.
  const demoBuild = env.VITE_DEMO_DEFAULT === '1'
  const auth =
    !demoBuild && env.DASH_USER && env.DASH_PASS
      ? 'Basic ' + Buffer.from(`${env.DASH_USER}:${env.DASH_PASS}`).toString('base64')
      : undefined
  if (command === 'serve' && !auth && !demoBuild) {
    console.info('[katie] DASH_USER / DASH_PASS not set: /api/dash is not proxied. Open /dash/?mock=1 for the fixtures.')
  }

  return {
    base: '/dash/',
    plugins: [react(), vibeNoSrcIcons()],
    build: {
      // DASH_SOURCEMAP=1 npm run build writes .map files (bundle analysis only; never deployed).
      sourcemap: process.env.DASH_SOURCEMAP === '1',
      rolldownOptions: {
        output: {
          codeSplitting: {
            // React, the router and TanStack Query change least: one named, long-cached chunk.
            // The Vibe parts the shell shares with lazy pages get a named chunk too; Vibe parts
            // that one lazy page alone uses (Calls' Dropdown and downshift) stay in that page.
            // Everything else splits by import (Katie, Calls, Settings, the playground, mock).
            groups: [
              {
                name: 'react',
                test: /[\\/]node_modules[\\/](react|react-dom|scheduler|react-router|@tanstack[\\/](query-core|react-query))[\\/]/,
              },
              {
                name: 'vibe',
                test: /[\\/]node_modules[\\/](@vibe|@floating-ui|react-transition-group|classnames|es-toolkit|@babel[\\/]runtime)[\\/]/,
                minShareCount: 2,
              },
            ],
          },
        },
      },
    },
    server: {
      proxy: auth
        ? {
            '/api/dash': {
              target,
              changeOrigin: true,
              secure: true,
              headers: { Authorization: auth },
              configure: (proxy) => {
                proxy.on('proxyRes', (res) => {
                  // A 401 must not make the browser prompt for the dev server's own sign-in;
                  // the app shows one line instead (shell/SessionLine).
                  delete res.headers['www-authenticate']
                  // Server-Sent Events: no buffering on the way through.
                  if (String(res.headers['content-type'] ?? '').startsWith('text/event-stream')) {
                    res.headers['cache-control'] = 'no-cache'
                    res.headers['x-accel-buffering'] = 'no'
                  }
                })
              },
            },
          }
        : undefined,
    },
  }
})
