# Client slot registry & the right-dock seam (ticket 01)

**Verdict: NO NATIVE RIGHT-DOCK SLOT EXISTS — REGISTER INTO `shell.overlay` AND SELF-POSITION AS AN ABSOLUTE RIGHT RAIL.** The client slot registry (`ctx.slots`) exposes ~40 named slots; none is a resizable/docked right panel. The only true right column (`details`) is a *single* slot permanently occupied by the host's tool-details panel — registering there shadows shipped UI. `shell.overlay` is the registry's own documented answer for "a surface of your own that floats over the whole app": additive (fresh `id`s sit beside shipped entries), always mounted, spanning every column, click-through until your entry opts into pointer events. An entry that absolutely positions itself `top:0;right:0;bottom:0` inside the overlay layer *is* a right rail.

Source: inline inspection of the DSH checkout `@deepseek-ai/dsh@0.1.1-rc.2` (rc.8+ line), 2025. All paths relative to `…/@deepseek-ai/dsh/node_modules/@deepseek-ai/`.

## Findings

1. **The registration API is exactly what `lib/client.js` already uses.**
   - `ctx.slots.inject(key, callback)` — install an effect per declaration lifetime of a slot; callback runs sync if declared, else inside the declaring `register()`; disposal rides the caller's fiber (`dsh-cordis-client-runner/lib/client.js:1316-1326`).
   - `ctx.slots.register(declaration, component)` — "The single registration API" (`lib/client.js:1306-1315`). List slots take `{name, id, order?, label?}`; a fresh `id` adds beside shipped entries, a shipped `id` REPLACES that cell (`shell.overlay` registerOptions doc, `lib/client.js:3378-3396`).

2. **Full slot inventory** (registry doc block `dsh-cordis-client-runner/lib/client.js:1116-3609`; keys at the cited lines):
   - Services (inject faces, not UI seams): `layout` (:1116), `locale` (:1138), `sessions` (:1223), `slots` (:1306), `theme` (:1328), `timer` (:1370), `workspaces` (:1407).
   - Conversation/session scope: `conversation` (:2123), `.chat.assistant-actions` (:2150), `.chat.commandview` (:2196), `.chat.node` (:2228), `.chat.turnTail` (:2280), `.composer` (:2312), `.composer.bar` (:2348), `.composer.dock` (:2375), `.details.tool` (:2421), `.hero.agentPreset` (:2448), `.hero.brand.mark` (:2467), `.hero.workspace` (:2486), `.hero.workspace.directoryFlow` (:2505), `.input.attachments` (:2524), `.input.dock` (:2551), `.input.left` (:2601), `.input.model` (:2647), `.input.overlay` (:2674), `.input.plan` (:2720), `.input.right` (:2747), `.message.images` (:2793), `.session` (:2820), `.session.header` (:2847), `.session.header.actions` (:2874), `.session.header.lineage` (:2920), `.session.header.utilities` (:2947), `.view` (:2993).
   - Frame/layout scope: `details` (:3039), `root` (:3066), `settings.action` (:3085), `settings.close` (:3123), `settings.general.item` (:3142), `settings.header` (:3186), `settings.onboarding` (:3205), `settings.plugin.item` (:3243), `settings.plugins.tab` (:3271), `settings.section` (:3309), `settings.trigger` (:3352), **`shell.overlay` (:3371)**, `sidebar` (:3409), `sidebar.brand.mark` (:3428), `sidebar.brand.name` (:3447), `sidebar.footer.action` (:3466), `sidebar.settings` (:3504), `sidebar.workspaces` (:3523), `sidebar.workspaces.directoryFlow` (:3542), `tool.call.toolview` (:3561), `tool.view.cordis` (:3609).
   - Grep for `rail`, `aside`, `side-panel`, `right-dock` across all packages: no such slot name exists. Every "dock" slot is a horizontal strip around the composer (`conversation.input.dock` = "A full-width row of its own, stacked above the composer card", :2553-2555).

3. **How the host's own right side works — and why neither candidate fits.**
   - The frame is a CSS grid: `gridTemplateColumns: sidebar | 1fr | details` (`dsh-client-ui-layout/lib/client.js:158-245`, esp. :220-233). The right column renders `renderSlot("details", {})`.
   - `details` is `kind: "single"`, OCCUPIED by ui-conversation's `DetailsPanel` (registration at `dsh-client-ui-conversation/lib/client.js:10231-10242`); `replaceRisk: "shadows-shipped-ui"` — "registering here replaces the column and takes that seat with it" (`dsh-cordis-client-runner/lib/client.js:3042-3050`). Also only opens when the layout opens it (`ctx.layout.openDetails()`, wired to non-blank sessions; service face :1125-1134, store `dsh-client-ui-layout/lib/types/client/stores.d.ts:18-35`). Rejected.
   - The host's To-dos strip is NOT a rail: `todoDockEntry` registers into `conversation.input.dock` (`dsh-client-ui-conversation/lib/client.js:6662-6677`) — same slot our card uses. Fine for strips, wrong shape for a tall map panel.
   - `root` is explicitly forbidden: a dynamic registration wins priority and would render our component alone with every seat gone (:3070-3076). `sidebar.*` seats are the LEFT column. `conversation.view` adds a tab inside the session body, not a dock (:2995-2998).

4. **`shell.overlay` is the sanctioned floating-layer seam** (`dsh-cordis-client-runner/lib/client.js:3371-3407`).
   - Its own doc: "This is the additive seat for a frame-wide surface of your own: a fresh `id` is added beside the shipped entries instead of replacing them." And `root`'s doc redirects floaters here by name (:3076-3078). Current occupants: none. `replaceRisk: "none"`.
   - Render site: `AppFrame` mounts it as the last child of the frame grid — `<div className=overlayLayer data-shell-overlay>{renderSlot("shell.overlay", {})}</div>` (`dsh-client-ui-layout/lib/client.js:234-238`).
   - Layer CSS: `.overlayLayer{z-index:20;pointer-events:none;position:absolute;inset:0}` with `.overlayLayer>*{pointer-events:auto}` (`dsh-client-ui-layout/lib/client.js:56`). So the layer spans the whole frame above both columns (drag handles are z-index 2); an entry is invisible-to-input except where it actually paints — a null render when the settings checkbox is off costs nothing and blocks nothing.
   - Exact registration (drop-in replacement shape for our current `wayfinderDockEntry`):

     ```js
     const wayfinderRailEntry = {
         name: "conversation-wayfinder-rail",
         inject: ["slots"],
         apply(ctx) {
             ctx.slots.inject("shell.overlay", () => ctx.slots.register({
                 name: "shell.overlay",
                 id: "wayfinder-rail",
                 order: 100,
             }, WayfinderRail));
         },
     };
     ```

   - Component posture: return `null` when the localStorage checkbox is off; otherwise one absolutely positioned `<aside>` pinned to the right edge (`position:absolute; top:0; right:0; bottom:0; width:320px` plus theme vars/border-left), sized independently of the composer CSS vars.

5. **The one real cost: root scope gets fewer standard props.**
   - Standard kit by scope (`dsh-client-ui-renderer/lib/client.js:533-569`): `root` entries receive only `useSessions` / `useWorkspaces` (:7-10); `useProjection` is attached only to session-scoped provide bundles (:563-564, hook impl :227-239). Our current `WayfinderDock({ useProjection })` shortcut does not exist at `shell.overlay`.
   - Per-session projection values remain reachable imperatively: `ctx.sessions.binding(sessionId)` → `SessionBinding.session` (`ISession & ObservableSnapshot<ConversationSnapshot>`, :1872-1874) → `.projections.faceOf("wayfinder")` (`ProjectionsFace`, :1821; `binding()` on the sessions face :1294-1301). Pattern: `useSessions((s) => s.current)` for the id, then subscribe the face (e.g. `useSyncExternalStore`); blank/unbound sessions yield `undefined`.
   - Alternative consistent with the map's "one shared data source" decision: fetch/poll the plugin's own data (reuse `lib/state.js` mapping) instead of tapping host projections at all — then the overlay entry needs only `useSessions` for the active-session highlight, or nothing.

## Tradeoffs of the recommended seam

- **Floats over, not beside**: an open rail overlays the center column/composer instead of squeezing it via the frame grid (only `details` participates in `computeColumns`). Mitigate with a narrow width, translucent backdrop choice, or auto-collapse while composing.
- **Self-owned geometry**: position, width, scroll, drag-resize (if wanted) are our CSS/JS; the host guarantees only the spanning layer, stacking (z-20), and click-through semantics. In exchange we never touch host layout state.
- **No free `useProjection`**: data access needs the `sessions.binding(...).projections.faceOf(...)` hop (or a plugin-owned source). Small constant wiring cost, paid once in the shared data-source module tickets 02/03 also consume.
- **Always mounted, session-independent**: survives session switches without remount flapping (good for an ambient panel), but the component must itself handle "no current session".
- **Stability**: this is a first-class documented contract with a worked example aimed at exactly this use case — not a DOM hack; upgrade risk tracks the documented slot API, not internal markup.

## Bottom line

Register `{name: "shell.overlay", id: "wayfinder-rail", order: 100}` via the same `ctx.slots.inject(...) => ctx.slots.register(...)` two-step the card already uses, and render an absolutely positioned right-edge `<aside>` inside the overlay layer (null when toggled off). Feed it through one shared client-side data source (host projections via `ctx.sessions.binding(...).session.projections.faceOf("wayfinder")`, or plugin-fetched map state) since root-scope slots get no `useProjection`. Avoid `details` (shadowing) and `root` (forbidden).
