# Selector robustness — hashed rows vs stable hooks

**Verdict: ship proof behind flag; gate GA on upstream `data-session-id` (Option 3). Title fallback (Option 2) is a cheap in-repo stopgap with narrow limits; client-module conversion (Option 4) is durable but outsized for this ticket.**

Sources: installed DSH `v0.1.0-rc.8` under `~/.npm-global/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/`, repo `lib/index.js` / `lib/panel.js` / `lib/state.js`, live `http://127.0.0.1:3080` probe 2026-08-20/21.

## How the row is found today

- Injection: `lib/index.js:283` appends `<script src="/dsh-wayfinder/panel.js">` via `ctx.webServer.tapIndex` (`dsh-host-webserver/lib/index.js:95` / `applyIndexTaps` at `:210`). Same `document` — `lib/panel.js:103-104` appends style + drawer to host `document`; existing precedent `lib/panel.js:189-207` mutates rows outside the drawer via `document.querySelectorAll`.
- Host row: `dsh-client-ui-workspace/lib/client.js:693` `SessionNodeItem` builds `className` at `:719` as `clsx(Rows_module_css_default.sessionRow …)` whose runtime value is `YDXeBa_sessionRow` (`:334` CSS string, `:373` hash map `sessionRow: "YDXeBa_sessionRow"`). No `data-session-id` / `data-workspace-id` emitted (`grep data-` in that build hits only `data-plugin-css` at `:336`/`:801`/`:971`). Sidebar shell is `dsh-client-ui-sidebar/lib/client.js:26` (`hHd-Xa_root` etc.) — unrelated to row identity.
- Identity today is positional: `node.id` is compared at `:696` (`selected = node.id === currentId`) and used as `onOpen(node.id)` at `:723`, but never serialized to DOM. Only `role="treeitem"` + `"aria-selected": selected` at `:721` / `role` adjacent line are stable attributes — neither carries the id.
- Poll + state: `lib/panel.js:407-417` fetches `/dsh-wayfinder/state.json` every 5 s; handler at `lib/index.js:263-275` returns `derive({workspaces: ctx.workspaceRegistry.list(), sessions: ctx.sessions.list(), …})`. `lib/state.js:302-309` emits `tasks[].{id,title,sessionId,children,…}` where `sessionId` is `session.id` at `:308`; the *session* display title (`node.title` at `:695` via `displayTitle(node,t)` at `:389-390`) never leaves the server.

## Ranked options

| Rank | Option | Durability | Scope | Breaks when |
|------|--------|------------|-------|-------------|
| 1 | **Brittle hashed selector** (today) | None — breaks per build | Zero diff | Any `dsh-client-ui-workspace` rebuild changes `YDXeBa_` hash |
| 2 | **Title fallback via `sessionTitle` in `state.json`** | Low — upgrades to duplicate-title failures only | In-repo only (`lib/state.js` + `lib/panel.js`) | Duplicate/ i18n titles, truncation, renames |
| 3 | **`data-session-id` attribute** — recommended | High — id-stable, no DOM scraping | 1-line host PR | Never for selection; `row.click()` still relies on handler |
| 4 | **Client-module conversion** | Highest — no DOM at all (`ctx.sessions.open`) | New bundle + manifest + `inject` wiring | Module-loader contract change |

### 1) Brittle hashed selector — what ships today

- Selector: `document.querySelectorAll('.YDXeBa_sessionRow')` (`dsh-client-ui-workspace/lib/client.js:334` + `:373`), optionally filtered by `.YDXeBa_title` text (`:376`) and workspace group.
- Why brittle: `YDXeBa_` is the CSS-module content hash emitted at `:334` and mapped at `:372-377` (`selected: "YDXeBa_selected"` etc.). Any CSS edit or rebuild rehashes it. No stable `data-*` or id in the JSX at `:719-730`; the only other stable hook is `aria-selected` (`:721`) which is boolean, not identifying.
- Scope: 0 lines changed — demo only. Gate GA on Option 3; log `console.warn` when hash absent.

### 2) Title fallback via `sessionTitle` in `state.json`

- What changes in repo (no host build):
  - `lib/state.js:286-325` `buildWorkspaceBoard` — alongside `...(session ? {sessionId: session.id} : {})` at `:308`, add `sessionTitle: session.title ?? session.displayTitle` (source is `sessions` snapshot already available at `lib/index.js:264` `ctx.sessions.list()`). Also `lib/state.js:22` `seedFor`/`SEED_MESSAGE` path is unchanged — `mapSessionsToTasks` at `:76-87` already resolves `session` by `header.cwd + seed` (`:79-81`).
  - `lib/panel.js:158-162` currently renders `task.sessionId` for copy; fallback selector becomes `Array.from(document.querySelectorAll('.YDXeBa_sessionRow')).find(r => r.querySelector('.YDXeBa_title')?.textContent.trim() === task.sessionTitle)`.
- Shape if kept: `{"workspaces":[{"tasks":[{"id":"03","sessionId":"sess-abc","sessionTitle":"Fix hover-find"}]}]}` (extends `lib/state.js:318-324` task mapping).
- Limits (why not durable):
  - Non-unique: `displayTitle` at `:389-390` returns `t("session.new")` / `"New Session"` (`:109` fallback) for blank sessions — duplicates break matching.
  - Lossy: `.YDXeBa_title{overflow:hidden;text-overflow:ellipsis}` at `:334` truncates long titles; i18n (`t("session.new")` at `:390`) makes string comparison locale-sensitive.
  - Still depends on hashed `.YDXeBa_title` at `:376` unless paired with Option 3.
- Verdict: cheap stopgap while awaiting host PR; keep only as second fallback after `data-session-id`.

### 3) `data-session-id` / `data-workspace-id` attribute — **recommended follow-up**

- Host patch (one attribute, zero behavior change):
  ```diff
  --- a/packages/dsh-client-ui-workspace/lib/client.js
  @@ -719 +719 @@
  -  className: clsx(Rows_module_css_default.sessionRow, ...)
  +  className: clsx(Rows_module_css_default.sessionRow, ...),
  +  "data-session-id": node.id,
  +  "data-workspace-id": workspaceId, // if in props, otherwise omit
  ```
  Applied at `dsh-client-ui-workspace/lib/client.js:719` inside the `HoverCard` anchor's `div` (`:719-730`). Rebuild that package only.
- Drawer usage: `document.querySelector('[data-session-id="'+CSS.escape(sessionId)+'"]')?.classList.add('kwf-hover-find-target')` and `?.click()` (or `scrollIntoView`). Real navigation already does `ctx.sessions.open(sessionId)` at `:2365` (also `:2370` `binding`, `:2376` `fork`), so `row.click()` → `onOpen(node.id)` at `:723` is the stable host contract.
- Scope: 1 line + rebuild; `dsh-client-ui-sidebar` (`hHd-Xa_root` at `lib/client.js:26`) untouched; `dsh-host-webserver` untouched.
- Durability: id-stable, survives CSS rehashes and i18n; no truncation. Only residual fragility is reliance on `click()` vs direct API — acceptable for GA (Option 4 removes even that).

### 4) Client-module conversion — `lib/panel.js` → proper client module

- Today `panel.js` is a plain script (`lib/index.js:283` `<script src>`), closure has only `document`/`fetch`/`localStorage` (`lib/panel.js:1-3`, `:430-438`). It never receives `ctx` and cannot call `ctx.sessions.open` — contrast server side `lib/index.js:41` `inject = ['tools','webServer','agents','sessions','workspaceRegistry']`.
- Client modules are factories via `window.__ModuleLoader__.load({id, factory})` (`dsh-client-modules/lib/client.js:1` comment), materialized through `ClientModuleLoader` with `inject: ["sessions"]` declared at `dsh-client-modules/lib/index.js:125` / `fields.inject` at `:157`. Boot manifest injected via `ctx.webServer.tapIndex(html=>injectBootManifest(html, composed))` at `:292` (`injectBootManifest` defined at `:215`). Only inside the factory does `inject` resolve to the runtime `sessions` service (`dsh-client-runtime/lib/client.js:8967` `open(id)` → `manager.select` at `:7863-7868`).
- Conversion scope:
  - Declare bundle in this repo's `cordis.patch.yml` / `package.json#dsh.bundle` (today only `cordis.patch.yml:3` inserts `id: wayfinder`); add `clientPath` + `inject: ["sessions"]`, expose slot like `dsh-client-ui-workspace/lib/client.js:2385-2395` `ctx.slots.inject("sidebar.workspaces", … WorkspaceBrowser)`.
  - Move `lib/panel.js` into `dsh-client-modules` build, replace `fetch('/dsh-wayfinder/state.json')` with direct `ctx.sessions` + `ctx.workspaceRegistry` if desired, call `ctx.sessions.open(sessionId)` instead of `row.click()`.
- Benefit: zero selector fragility, navigation matches host exactly (including `binding`/`history` at `dsh-client-runtime/lib/client.js:7928-7930`). Cost: new build step, manifest wiring, couples release to module-loader train (`dsh-client-modules/lib/index.js:292` / `dsh-client-runtime`). Out of scope for ticket 06's narrow fix — track as follow-up for copy-vs-jump affordance (session link does `copyText` at `lib/panel.js:158-162`).

## Live probe (2026-08-21)

- `GET /` → `200 <!doctype html>` shell; `GET /dsh-wayfinder/panel.js` → `200 text/javascript` (no-cache headers at `lib/index.js:254-261`); `GET /dsh-wayfinder/state.json` → `200 application/json` with `workspaces[].tasks[].sessionId` (handler at `lib/index.js:263-275`). No `Content-Security-Policy` / `X-Frame-Options` blocking same-document access (verified via `curl -D -`).

## Follow-up (single)

**File upstream PR: add `data-session-id` (and `data-workspace-id` if prop available) to `SessionNodeItem` at `dsh-client-ui-workspace/lib/client.js:719`.** One-line review, unblocks GA; keep title fallback as secondary defense only. Client-module conversion stays as separate follow-up — do not gate GA on it.
