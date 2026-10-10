# Matrix theme

- Full Astro project. Public site configuration: `src/matrix/config/site.js`.
- Personalize title, owner, brand, canonical URL, filing number, introduction and projects through configuration; avoid hardcoded identity in components.
- Keep this template free of personal posts, credentials, deployment caches and generated build output. An empty article collection must render normally.
- Theme UI: `src/matrix`; Astro/SEO wrapper: `src/layouts/MatrixLayout.astro`.
- Preserve procedural rain, local glyph-ring deformation, beam transitions and illustrated characters. About/Projects use their own backgrounds.
- White archive uses document scrolling, pagination and a draggable desktop tag cloud; mobile hides the cloud and stops its animation.
- Reader width is at most 1200px. Keep syntax highlighting, copy controls, attribution and adjacent article titles.
- First paint shares MatrixBoot; keep SSR text hidden until no-script fallback. Do not flash a second layout.
- Server-only AI core: `server/chat`; thin platform adapters: `edge-functions`, `functions`, `api`.
- Keys belong in ignored `.env.local` or platform secrets, never in client config or PUBLIC_ variables.
- Local browser 50-round counter persists when chat history is cleared. This is a convenience limit, not server-enforced abuse prevention.
- Bound article cache at 8. Dispose scene, audio, observers, listeners and timers. At most one animation callback per scene; stop hidden/inactive animations.
- Validate meaningful changes with `pnpm check`, `pnpm build`, `pnpm test`; inspect rendered UI when changing theme startup or layout.
