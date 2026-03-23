# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0-beta.1] - 2026-03-23

Full TDD rewrite (v3) — cleaner architecture, improved test coverage, new features.

### Added

- `AutoSkeletonList` component with count persistence and width/height distribution tracking
- Seeded PRNG (Mulberry32 + FNV-1a) for deterministic, varied skeleton text widths in lists
- `usePersistedHeights` and height distribution hooks for vertical dimension persistence
- `SkeletonCookieSync` client component for Next.js App Router cookie sync
- `vitest.config.browser.ts` with Playwright/Chromium for pixel-accurate CSS tests
- `refCompatibility` utility to handle React 18/19 ref forwarding differences
- `isValidId` utility with strict ID format validation
- `CaptureConfig` type and `configureCapture` function for custom dev server URL
- Dev server host validation and CORS security
- `bootstrap-registry` logic to initialize registry on CLI startup
- Full integration tests for the CLI capture pipeline

### Changed

- Source reorganized: `src/hooks/` → `src/storage/`, `src/server/` + `src/client/` → `src/snapshot/`
- `collect-text-widths` renamed to `collect-text-dimensions` (now handles heights too)
- CLI restructured: `src/cli.ts` → `src/cli/main.ts`, `src/config.ts` → `src/cli/load-config.ts`
- `StoragePayload` v2 schema with shortened keys (`c`, `w`, `h`, `wd`, `hd`)
- `AutoSkeleton` in dev mode renders children off-screen to detect layout changes and re-capture

### Removed

- Toast notification system (`src/notifications/`)
- Old HTTP server (`src/server/http-server.ts`) replaced by the new dev server
- Benchmark suite (`src/perf/`)

## [1.0.0-beta.0] - 2025

Initial public release.

### Added

- `AutoSkeleton` component with DOM capture, code generation, and registry lookup
- `LoadedProvider` context provider for registry and SSR snapshot
- `SkeletonContext` and `useIsSkeletonMode` hook
- CLI (`autoskeleton dev` / `autoskeleton reset`) with `defineConfig`
- localStorage persistence for text widths and item counts
- SSR cookie snapshot via `syncSnapshotToCookie` and `getServerSnapshot`
- `compactPersistedSnapshot` and `serializePersistedSnapshot` utilities
- CSS stylesheet with shimmer animation, CSS variables, dark mode
- JSR publishing support (`@vd/react-loaded`)
