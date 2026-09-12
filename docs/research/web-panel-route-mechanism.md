# Web panel route mechanism (ticket 01)

**Verdict: SERVER ROUTE — fully supported, zero shell changes.** A Cordis plugin in the web profile registers named HTTP routes on the harness's own web server (the one serving http://127.0.0.1:3080) through the `webServer` service. The GUI client is same-origin, so the plugin's routes are reachable as `http://127.0.0.1:3080/<path>` from any browser tab. A plugin-owned map view needs no `apps/web` rebuild: it can be a standalone page served by the plugin's route, or — via index taps — a script injected into the GUI page itself.

Source: inline inspection of the DSH checkout v0.1.0-rc.8, 2025.

## Findings

1. **The `webServer` service is the harness's HTTP server.**
   - `@deepseek-ai/dsh-host-webserver` is "a node:http server plus the `webServer` service (HTTP and upgrade route registries, index transform taps, and the single fallback seat for everything no route claims). Knows no harness concepts" — package docstring, `dsh-host-webserver/lib/index.js:5-13`.
   - The service registers itself under the name `"webServer"` (`super(ctx, "webServer")`, `lib/index.js:36`), config `{host, port}` (`lib/index.js:23-26`). The shell configures port 3080; the service exposes `.port`/`.host` getters (`lib/index.js:40-46`).

2. **Route registration API (all methods return disposers; duplicates throw).**
   - `register({kind: "exact" | "prefix", path, handler})` — named routes; a `(kind, path)` collision is a composition error (`lib/index.js:53-60`). Prefix matching is longest-prefix-wins (`lib/index.js:197-202`).
   - `registerUpgrade({path, handler})` — websocket upgrade routes (`lib/index.js:67-73`).
   - `registerFallback(handler)` — exactly ONE owner answers everything no route claims; second registration throws (`lib/index.js:82-88`).
   - `tapIndex(transform)` — index.html transform taps, applied in registration order by the fallback owner to every index response (`lib/index.js:95-100`; applied via `applyIndexTaps`, `lib/index.js:210-214`).

3. **The shipped web composition holds the fallback seat — plugins use named routes, not the fallback.**
   - `@deepseek-ai/dsh-host-frontend-static` injects `["webServer"]` (`dsh-host-frontend-static/lib/index.js:18-20`) and claims the seat: `ctx.webServer.registerFallback(...)` serving the SPA dist, with traversal-403, SPA-fallback-to-index semantics (`lib/index.js:69-83`).
   - Every index response runs through the taps: `ctx.webServer.applyIndexTaps(await readFile(distIndex, "utf8"))` (`lib/index.js:72`). Its docstring calls this "boot-manifest injection" (`lib/index.js:5-16`).

4. **How a new plugin joins: the bundle-patch composition.**
   - Packages declare `dsh.bundle.patch: ./cordis.patch.yml` in their package.json (e.g. `dsh-web-app/package.json` `dsh.bundle` block), and the CLI plugin installer reconciles installed bundles into the profile layer list — `dsh/lib/bin.js:91-105`, `dsh/lib/plugin-9h8shc4d.js:8-15, 35-77` (per archived research `dsh-orchestration-landscape.md` §"DSH CLI plugin management").
   - A plugin adds itself to the web profile (`~/.dsh/profiles/web/`) via `dsh plugin add`; its patch row injects `webServer` and registers its routes at startup. No frontend rebuild involved for server-side routes.

5. **Client reachability: same origin.**
   - The GUI at 3080 is served by this same server; a plugin route is same-origin, fetchable by the GUI and by any browser tab. No CORS/port juggling (server binds the port the GUI lives on; `WebServer` listen behavior `lib/index.js:102-170`).

6. **Two delivery shapes for the map view.**
   - (a) **Standalone page**: plugin registers `prefix` route `/dsh-wayfinder/` serving its own HTML+JS; the user opens http://127.0.0.1:3080/dsh-wayfinder/ in a tab. Laziest — zero client-shell coupling.
   - (b) **Embedded panel**: plugin serves a JS bundle from its route and `tapIndex`-injects a `<script src="/dsh-wayfinder/panel.js">`; the script mounts UI into the GUI DOM. Feasible but couples to the client runtime's DOM/theme; treat as enhancement, not v1.

## Bottom line

Smallest mechanism: a Cordis plugin in the web profile with `inject: ["webServer"]`, registering one `prefix` route for the map view. Files touched: the plugin's own package (`cordis.patch.yml` + route handler + HTML/JS assets). Nothing in `apps/web`, `dsh-host-frontend-static`, or the profile composition needs modification; the fallback seat stays with `frontend-static`.
