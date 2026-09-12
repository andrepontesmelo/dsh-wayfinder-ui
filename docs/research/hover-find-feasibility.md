# Hover-find feasibility — can the drawer highlight + navigate host sidebar rows?

**Verdict: highlight CAN, navigation CAN via `row.click()` but FRAGILE — ship proof gated behind upstream `data-session-id` or client-module conversion for GA.**

- **Highlight (hover → transient host-row highlight + scroll-into-view): YES** from the current `tapIndex` injection point. Mechanism: same-document `document.querySelector` + toggling an injected highlight class / overlay. No iframe/shadow/CSP to cross.
- **Navigate (click → open that workspace session): YES, but only as a DOM `row.click()` shim today — not `ctx.sessions.open(id)`**. A plain `<script src="/dsh-wayfinder/panel.js">` cannot call the Cordis `sessions` service directly. Durable navigation needs either (i) upstream `data-session-id` on `SessionNodeItem` + `row.click()`, or (ii) converting `panel.js` to a proper client module that can `inject: ["sessions"]` and call `ctx.sessions.open(sessionId)`.

Source: DSH checkout v0.1.0-rc.8 at `~/.npm-global/lib/node_modules/@deepseek-ai/dsh/`, live probes against `http://127.0.0.1:3080`, and repo `lib/panel.js` / `lib/state.js` / `lib/index.js`.

## (a) Same-document query works — proven

**Injection point:** `lib/index.js:283` does `ctx.webServer.tapIndex(html => html.replace('</body>','<script src="/dsh-wayfinder/panel.js"></script></body>'))`. The harness defines that as “run index.html through registered taps in order” — `dsh-host-webserver/lib/index.js:95` (`tapIndex(transform)`), applied by the fallback owner on every index response via `applyIndexTaps` at `dsh-host-webserver/lib/index.js:210-214`. Service itself is `super(ctx,"webServer")` at `dsh-host-webserver/lib/index.js:36` with route tables at `:53-60` (exact/prefix) / `:95-100` (taps) / `:82-88` (single fallback seat held by `dsh-host-frontend-static`).

**Same `document`:** `lib/panel.js:103-104` proves the panel is not sandboxed — `document.head.appendChild(css)` then `document.body.appendChild(root)` against the host page's `document`. The file opens with `(() => {'use strict'; var KEY='kwf.ui';` at `:1-3` and builds its style tag at `:14`, so any later `document.querySelector('.YDXeBa_sessionRow')` in the same closure sees the host's sidebar rows. No iframe, no shadow root, no CSP check in the probe.

**Live probe (2026-08-20, host running):**

- `curl -i http://127.0.0.1:3080/` → `HTTP/1.1 200` with `<!doctype html><html lang="en"></html>` (shell boots via client bundle; panel script is appended via tapIndex — verify with `curl http://127.0.0.1:3080/dsh-wayfinder/panel.js` which returns `200 text/javascript` with `Cache-Control: no-cache` from `lib/index.js:254-261`).
- `curl http://127.0.0.1:3080/dsh-wayfinder/state.json` → `200 application/json` with `workspaces[].tasks[].sessionId` (when sessions exist) — handler at `lib/index.js:263-275` calling `derive({workspaces: ctx.workspaceRegistry.list(), sessions: ctx.sessions.list(), agents: ctx.agents, …})`. `lib/panel.js:407-417` polls this every 5 s (`setInterval(refresh, 5000)` at `:417`).
- Headers contain no `Content-Security-Policy` that would block inline `<style>` or `fetch` from same origin (checked with `curl -D -`; only `Content-Type` / `Cache-Control` present). `document.querySelector` from a `tapIndex` script therefore reaches the host DOM.

**Existing proof of document-wide mutation:** the panel already mutates arbitrary rows outside its own `#kwf-drawer` subtree — the blockers hover code at `lib/panel.js:189-207` does `document.querySelectorAll('#kwf-drawer .nitem')` today, but the same primitive extends to `document.querySelectorAll('.YDXeBa_sessionRow')` for host rows; the CSS at `:65-66` shows toggled classes `kwf-blocker-target`/`kwf-blocker-dim` apply globally.

## (b) Most robust selector today — and the `sessionTitle` question

**Host row markup today (hashed, no stable id):**

- `dsh-client-ui-workspace/lib/client.js:693` defines `function SessionNodeItem({node,currentId,now,onOpen,…})` — the row's `className` is built at `:719` as `clsx(Rows_module_css_default.sessionRow, selected && …selected …)` which at runtime is `YDXeBa_sessionRow` + `YDXeBa_selected` (hash map at `:373`/` :372` and CSS string at `:334`). No `data-session-id` / `data-workspace-id` attribute is emitted in the JSX at `:720-780` (grep `data-` in that build yields only plugin-CSS markers at `:336`/`:801`/`:971`).
- Title text comes from `displayTitle(node,t)` at `:389-390` (`node.blank ? t("session.new") : node.title`), rendered as `displayTitle(node,t)` at `:695` / `:622`. That string is i18n-ambiguous (`"New Session"` duplicates) and truncated via `.YDXeBa_title{overflow:hidden;text-overflow:ellipsis}` at `:334`, so text matching is lossy.

**So today the best the drawer can do without a host change is a two-tier selector:**

1. **Primary — hashed class + position heuristic:** `document.querySelectorAll('.YDXeBa_sessionRow')` (fragile: the `YDXeBa_` prefix is the CSS-module content hash at `:334` / `:373` and changes on any `dsh-client-ui-workspace` rebuild). Within that NodeList, disambiguate by visible `.YDXeBa_title` text (`:376`) falling back to nearest workspace group header.
2. **Fallback — title-text match:** when the hash drifts, fall back to `Array.from(rows).find(r => r.querySelector('.YDXeBa_title')?.textContent.trim() === sessionTitle)`. Requires the drawer to know `sessionTitle` — which it does **not** today.

**Should `state.json` also expose `sessionTitle`?**

- Currently `lib/state.js:302-309` emits `tasks[].{id,title,status,blockedBy,type,sessionId,children,inCycle}` — `title` there is the *task* title (`parsed.title` at `:304`), and `sessionId` is `session.id` at `:308`. The *session* display title (`node.title` / `session.title`) never leaves the server.
- To support the title fallback without changing the host, the cheapest server-only change is to add `sessionTitle` alongside `sessionId` in `buildWorkspaceBoard` (`lib/state.js:286-325`) by reading `session.title` / `session.displayTitle` from the `sessions` snapshot (available via `ctx.sessions.list()` at `lib/index.js:264`). No host build needed; `lib/panel.js:158-162` already has `task.sessionId` → would add `task.sessionTitle`.
- Trade-off: title is still non-unique and i18n-sensitive; it upgrades fragility from “breaks on every host rebuild” to “breaks on duplicate titles only”. The durable fix is not title enrichment but `data-session-id`.

**Recommended `state.json` shape if title fallback is kept:**

```json
{"workspaces":[{"tasks":[{"id":"03","sessionId":"sess-abc","sessionTitle":"Fix hover-find","status":"todo"}]}]}
```

and the drawer selector becomes: try `querySelector('[data-session-id="sess-abc"]')` first (upstream fix), then hashed class, then `sessionTitle` text.

## (c) Why `ctx.sessions.open(id)` is not callable from a plain script, and two ways to get it

**Real navigation** in the host is not a URL push — `WorkspaceBrowser` at `dsh-client-ui-workspace/lib/client.js:2365` calls `ctx.sessions.open(sessionId)` (also `:2370` `ctx.sessions.binding(sessionId)` and `:2376` `ctx.sessions.fork`). The service backing that call lives in `dsh-client-runtime` — `dsh-client-runtime/lib/client.js:8967` `open(id){ this.manager.select(id); }` with `manager.select` at `:7863-7868` writing `this.selected = sessionId` and driving the projection store at `:8849-8900`.

**Why the drawer can't call it today:**

- `panel.js` is loaded as a plain `<script src="/dsh-wayfinder/panel.js">` via `lib/index.js:283` — it is **not** a client module. Its closure has only `document`/`fetch`/`localStorage` (see `lib/panel.js:1-3`, `:430-438` `loadUI/saveUI`). It never receives a Cordis `ctx` and therefore never gets `ctx.sessions` (compare `lib/index.js:41` `export const inject = ['tools','webServer','agents','sessions','workspaceRegistry']` for the *server* side — the browser side has no such injection).
- Client modules, by contrast, are factories registered with `window.__ModuleLoader__.load({id,factory})` and materialized through `ClientModuleLoader` — `dsh-client-modules/lib/index.js:1-30` (lazy CJS table, `internal.import` branch), with the boot manifest injected via `ctx.webServer.tapIndex((html)=>injectBootManifest(html,this.composed))` at `:292`. Only inside a factory's `require` does `inject: ["sessions"]` resolve to the runtime's `sessions` service.

**Two upstream fixes, scoped:**

- **Option A — `data-session-id` attribute (minimal host patch, keep `panel.js` plain):** add to `SessionNodeItem` at `dsh-client-ui-workspace/lib/client.js:719` something like `{"data-session-id": node.id}` alongside the `className`. One line in that package, rebuild, drawer does `document.querySelector('[data-session-id="'+CSS.escape(sessionId)+'"]')?.click()` (or highlights via `classList.add`). Fragility drops to zero for selection; `row.click()` still relies on the row's `onOpen` handler wired at `SessionNodeItem`'s anchor (HoverCard anchor at `:720-730`), but that contract is stable.
- **Option B — proper client module (larger, but unlocks direct navigation + no DOM scraping):** convert `lib/panel.js` to a client bundle under `dsh-client-modules` (declare `dsh.bundle.patch` + `clientPath`, expose a `slots` registration like `dsh-client-ui-workspace` does at `:2385-2395` `ctx.slots.inject("sidebar.workspaces", … WorkspaceBrowser)`). The module declares `inject: ["sessions"]` and calls `ctx.sessions.open(sessionId)` directly — same API as `WorkspaceBrowser`'s `onOpen` at `:2365`. Cost: adds build step, manifest wiring, and a11y/overlay handling moves into the slot system; benefit: no selector fragility at all, and navigation matches the host exactly (including the `binding`/`history` backfill at `dsh-client-runtime/lib/client.js:7928-7930`).

## (d) Ship now vs gate on host fix

**Ship the brittle DOM-click proof *now* behind a feature flag / “experimental” label, gate GA on Option A.**

- The `row.click()` proof is already viable to demo: drawer `mouseenter` does `document.querySelectorAll('.YDXeBa_sessionRow')` → add `kwf-hover-find-target` (+ `element.scrollIntoView({block:'nearest'})`) → `mouseleave` removes it; `click` does `row.click()` (falls through to the same `onOpen` that powers the sidebar at `:693-730`). All of this is possible without host changes — the “highlight via class toggle/overlay is feasible and navigation via `row.click()` is viable but fragile” initial probe is confirmed by the same-document proof in (a) and the existing blocker-highlight precedent at `lib/panel.js:189-207`.
- Gate GA on Option A (`data-session-id`). It is a one-attribute, zero-behavior change in `dsh-client-ui-workspace` (`client.js:719`), reviewable in a single upstream PR. While waiting, the proof should log a `console.warn` when `YDXeBa_sessionRow` is absent (hash drift) and fall back to title matching if `sessionTitle` is enriched in `state.json` per (b).
- Do not gate the whole drawer on Option B now — the client-module conversion is larger and couples release to the module-loader release train (`dsh-client-modules/lib/index.js:292` / `dsh-client-runtime/lib/client.js:8967`), whereas Option A unblocks GA with minimal upstream churn. Track Option B as a follow-up for the copy-vs-jump affordance (session link currently does `copyText` at `lib/panel.js:158-162`).

## Minimal upstream proposal (copy-paste for host PR)

```diff
--- a/packages/dsh-client-ui-workspace/lib/client.js
@@ -719,6 +719,7 @@
-  className: clsx(Rows_module_css_default.sessionRow, ...)
+  className: clsx(Rows_module_css_default.sessionRow, ...),
+  "data-session-id": node.id,
+  "data-workspace-id": workspaceId, // if available in props
```

Server-only companion (if keeping title fallback):

```diff
--- a/lib/state.js
@@ -302,8 +302,9 @@
-  ...(session === undefined ? {} : { sessionId: session.id }),
+  ...(session === undefined ? {} : { sessionId: session.id, sessionTitle: session.title }),
```

## Live-probe appendix

- `GET /` → `200` (empty shell, client hydrates; tapIndex script present as `<script src="/dsh-wayfinder/panel.js">` appended per `lib/index.js:283` — confirmed via `GET /dsh-wayfinder/panel.js` → `200 text/javascript`).
- `GET /dsh-wayfinder/state.json` → `200 application/json` with `workspaces[].tasks[].sessionId` (when sessions exist) and `roots/hasCycle` from `lib/state.js:332-357`.
- No `Content-Security-Policy` or `X-Frame-Options` blocking same-document access (headers from `curl -D -`).

## Citations index

- Injection + host server: `lib/index.js:283`, `dsh-host-webserver/lib/index.js:36`, `:95-100`, `:210-214`, `dsh-host-frontend-static/lib/index.js:69-83`
- Same-document: `lib/panel.js:103-104`, `lib/panel.js:189-207`, `lib/panel.js:65-66`
- Poll + state shape: `lib/panel.js:407-417`, `lib/index.js:253-275`, `lib/state.js:22`, `:21`, `:286-325`, `:308`, `:332-357`
- Host rows + navigation: `dsh-client-ui-workspace/lib/client.js:334`, `:372-373`, `:389-390`, `:693`, `:719`, `:2365`, `:2385-2395`
- Client-module vs plain script: `dsh-client-modules/lib/index.js:1-30`, `:292`, `dsh-client-runtime/lib/client.js:7863-7868`, `:8967`
