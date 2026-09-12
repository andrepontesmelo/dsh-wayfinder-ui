window.__ModuleLoader__.load({
	id: "dsh-wayfinder-ui",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");

		const tagId = "dsh-wayfinder-ui/card.css";
		const css = ".kwf_card{box-sizing:border-box;width:calc(100% - var(--dsh-composer-side-clearance) - var(--dsh-composer-side-clearance) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset));max-width:calc(var(--dsh-composer-card-max-width) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset));border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-specific-tip);border-radius:12px;flex:none;margin:0 auto}.kwf_body{flex-direction:column;gap:8px;padding:6px 12px;display:flex}.kwf_headrow{align-items:center;gap:4px;display:flex;flex-direction:row}.kwf_header{text-align:left;cursor:pointer;background:none;border:none;align-items:center;gap:10px;min-width:0;flex:auto;padding:0;display:flex;font:inherit}.kwf_lead{color:var(--dsw-alias-label-tertiary);flex:none;place-items:center;display:grid}.kwf_title{color:var(--dsw-alias-label-primary);flex:none;font-size:13px;font-weight:500;line-height:24px;font-family:Inter,var(--dsw-font-family)}.kwf_progress{min-width:0;color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;flex:auto;font-size:13px;line-height:20px;overflow:hidden}.kwf_chevron{color:var(--dsw-alias-label-tertiary);flex:none;place-items:center;display:grid}.kwf_list{flex-direction:column;gap:8px;max-height:180px;margin:0;padding:0 0 4px;list-style:none;display:flex;overflow-y:auto}.kwf_item{min-width:0;color:var(--dsw-alias-label-secondary);align-items:center;gap:8px;font-size:13px;line-height:20px;display:flex}.kwf_glyph{flex:none;place-items:center;width:14px;height:14px;display:grid;border-radius:50%;box-sizing:border-box}.kwf_done{background:var(--dsw-alias-label-tertiary)}.kwf_blocked{border:2px solid var(--dsw-alias-state-error-primary)}.kwf_open_st{border:2px solid var(--dsw-alias-state-success-primary)}.kwf_type{flex:none;color:var(--dsw-alias-label-tertiary);font-size:11px;text-transform:uppercase;letter-spacing:.4px}.kwf_set_title{color:var(--dsw-alias-label-primary);margin:0 0 4px;font-size:13px;font-weight:500;line-height:24px;font-family:Inter,var(--dsw-font-family)}.kwf_set_desc{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px;margin:0 0 8px}.kwf_set_row{align-items:center;gap:6px;color:var(--dsw-alias-label-secondary);display:flex;font-size:13px;line-height:22px;cursor:pointer}.kwf_rail{position:absolute;top:0;right:0;bottom:0;width:320px;max-width:40vw;box-sizing:border-box;background:var(--dsw-specific-tip);border-left:1px solid var(--dsw-alias-border-l1);box-shadow:-12px 0 32px rgba(0,0,0,.25);display:flex;flex-direction:column;padding:10px 14px}.kwf_rail_title{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;font-family:Inter,var(--dsw-font-family);margin:0}.kwf_rail_head{align-items:center;gap:8px;display:flex;margin:0 0 4px}.kwf_close{flex:none;background:none;border:none;padding:0 2px;cursor:pointer;color:var(--dsw-alias-label-tertiary);font-size:16px;line-height:1}.kwf_close:hover{color:var(--dsw-alias-label-primary)}.kwf_launch{position:absolute;top:12px;right:12px;display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:99px;background:var(--dsw-specific-tip);color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:20px;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.18)}.kwf_launch:hover{color:var(--dsw-alias-label-primary)}.kwf_rail_progress{color:var(--dsw-alias-label-tertiary);font-size:12px;margin:0 0 8px}.kwf_rail_list{flex-direction:column;gap:10px;margin:0;padding:0;list-style:none;display:flex;overflow-y:auto}.kwf_rail_item{min-width:0;color:var(--dsw-alias-label-secondary);align-items:center;gap:8px;font-size:13px;line-height:20px;display:flex}.kwf_rail_empty{color:var(--dsw-alias-label-tertiary);font-size:12px}.kwf_open{flex:none;background:none;border:none;padding:0;margin:0;cursor:pointer;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:20px}.kwf_open:hover{color:var(--dsw-alias-label-primary)}.kwf_amb_row{border-left:3px solid var(--dsw-alias-state-business-primary)}.kwf_amb_subhead{font-size:10px;font-weight:900;letter-spacing:.12em;color:var(--dsw-alias-label-secondary);margin:10px 6px 4px;text-transform:uppercase;flex:none;grid-column:1/-1}.kwf_amb_st{font-size:9px;font-weight:800;border-radius:99px;padding:1px 7px;flex:none;margin-left:auto}.kwf_amb_st[data-st='running']{background:var(--dsw-alias-state-business-primary);color:var(--dsw-specific-tip)}.kwf_amb_st[data-st='waiting']{background:var(--dsw-alias-state-warning-primary, #fbbf24);color:#10161f}.kwf_amb_st[data-st='done']{background:var(--dsw-alias-state-success-primary);color:var(--dsw-specific-tip)}.kwf_amb_st[data-st='blocked']{background:var(--dsw-alias-state-error-primary);color:var(--dsw-specific-tip)}.kwf_amb_st[data-st='todo'],.kwf_amb_st[data-st='resolved']{background:var(--dsw-alias-label-tertiary);color:var(--dsw-specific-tip)}.kwf_flame{display:inline-block;vertical-align:-1px;line-height:1}.kwf_flame svg{display:block}.kwf_grill{display:inline-flex;align-items:center;gap:3px;color:var(--dsw-alias-state-warning-primary,#fbbf24);font-weight:600;font-size:13px;line-height:20px}.kwf_grill_pill{display:inline-flex;align-items:center;gap:4px;padding:1px 7px;border-radius:10px;background:rgba(251,191,36,.14);color:var(--dsw-alias-state-warning-primary,#fbbf24);font-size:11px;font-weight:600;line-height:16px}";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-wayfinder-ui";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}

		/**
		 * UI settings (ticket 02) — localStorage-backed four booleans.
		 * TWIN of lib/settings.js: the same parse/serialize semantics live
		 * here, pinned by the parity test in test/settings.test.js.
		 */
		const SETTINGS_KEY = "dsh-wayfinder-runner.ui";
		const DEFAULT_UI_SETTINGS = { rightPanel: false, sessionHighlight: true, inSessionPanel: true, autoShowPanel: false };
		function parseSettings(rawStringOrNull) {
			const settings = { ...DEFAULT_UI_SETTINGS };
			let parsed;
			try {
				parsed = rawStringOrNull === null ? undefined : JSON.parse(rawStringOrNull);
			} catch {
				return settings;
			}
			if (!parsed || typeof parsed !== "object")
				return settings;
			for (const key of Object.keys(DEFAULT_UI_SETTINGS))
				if (typeof parsed[key] === "boolean")
					settings[key] = parsed[key];
			return settings;
		}
		function serializeSettings(settings) {
			return JSON.stringify({
				rightPanel: settings.rightPanel === true,
				sessionHighlight: settings.sessionHighlight === true,
				inSessionPanel: settings.inSessionPanel === true,
				autoShowPanel: settings.autoShowPanel === true
			});
		}

		/**
		 * Shared settings store: ONE module-level snapshot + listener set feeds
		 * every useWayfinderUiSettings() caller, so any toggle re-renders them
		 * all in the same tab (the 'storage' event fires only in OTHER tabs,
		 * where refreshSettingsFromStorage re-reads and notifies too).
		 */
		/** localStorage can throw (blocked cookies/site-data), not just be absent — one safe accessor each way. */
		function readStoredSettings() {
			try {
				return typeof localStorage === "undefined" ? null : localStorage.getItem(SETTINGS_KEY);
			}
			catch (_e) { return null; }
		}
		let settingsSnapshot = parseSettings(readStoredSettings());
		const settingsSubscribers = new Set();
		function commitSettings(next) {
			settingsSnapshot = next;
			try { localStorage.setItem(SETTINGS_KEY, serializeSettings(next)); } catch (_e) { /* quota/blocked storage: keep in-memory settings */ }
			for (const notify of [...settingsSubscribers])
				notify();
		}
		function refreshSettingsFromStorage() {
			settingsSnapshot = parseSettings(readStoredSettings());
			for (const notify of [...settingsSubscribers])
				notify();
		}
		// Registered ONCE at module level (addEventListener dedupes identical
		// callbacks, so per-hook registration would let the first unmount kill
		// cross-tab sync for every remaining consumer).
		if (typeof window !== "undefined")
			window.addEventListener("storage", refreshSettingsFromStorage);
		function toggleWayfinderUiSetting(key) {
			commitSettings({ ...settingsSnapshot, [key]: !settingsSnapshot[key] });
		}
		function useWayfinderUiSettings() {
			const [settings, setSettings] = (0, react.useState)(settingsSnapshot);
			(0, react.useEffect)(() => {
				const sync = () => setSettings(settingsSnapshot);
				settingsSubscribers.add(sync);
				return () => {
					settingsSubscribers.delete(sync);
				};
			}, []);
			return [settings, toggleWayfinderUiSetting];
		}

		/** Global Settings dialog page ('settings.section' seat): title + description + the three checkbox rows, same store the card used to read. */
		function WayfinderSettingsSection() {
			const [settings, toggle] = useWayfinderUiSettings();
			return (0, react_jsx_runtime.jsxs)("div", {
				children: [
					(0, react_jsx_runtime.jsx)("h3", { className: "kwf_set_title", children: "Wayfinder" }),
					(0, react_jsx_runtime.jsx)("p", { className: "kwf_set_desc", children: "Show Wayfinder maps in the session view" }),
					(0, react_jsx_runtime.jsx)("label", { className: "kwf_set_row", children: [(0, react_jsx_runtime.jsx)("input", { type: "checkbox", checked: settings.rightPanel, onChange: () => toggle("rightPanel") }), "Right panel"] }),
					(0, react_jsx_runtime.jsx)("label", { className: "kwf_set_row", children: [(0, react_jsx_runtime.jsx)("input", { type: "checkbox", checked: settings.autoShowPanel, onChange: () => toggle("autoShowPanel") }), "Auto-show right panel"] }),
					(0, react_jsx_runtime.jsx)("label", { className: "kwf_set_row", children: [(0, react_jsx_runtime.jsx)("input", { type: "checkbox", checked: settings.sessionHighlight, onChange: () => toggle("sessionHighlight") }), "Session highlight"] }),
					(0, react_jsx_runtime.jsx)("label", { className: "kwf_set_row", children: [(0, react_jsx_runtime.jsx)("input", { type: "checkbox", checked: settings.inSessionPanel, onChange: () => toggle("inSessionPanel") }), "In-session panel"] })
				]
			});
		}

		function flameGlyph() {
			return (0, react_jsx_runtime.jsx)("span", { className: "kwf_flame", "aria-hidden": true, title: "Grilling batch awaiting input", children: (0, react_jsx_runtime.jsx)("svg", { width: 12, height: 12, viewBox: "0 0 24 24", fill: "currentColor", children: (0, react_jsx_runtime.jsx)("path", { d: "M12 2c.4 2.4-.9 3.9-2.5 5.4C7.8 9 6 10.6 6 14a6 6 0 0 0 12 0c0-2.2-.8-3.8-2-5.3-.6 1-.9 1.8-.9 2.8 0 .7.3 1.4.7 1.8-.4-4-1.6-7.6-3.8-11.3z" }) }) });
		}

		function statusGlyph(status) {
			return (0, react_jsx_runtime.jsx)("span", {
				className: "kwf_glyph " + (status === "done"
					? "kwf_done"
					: status === "blocked"
						? "kwf_blocked"
						: "kwf_open_st"),
				"aria-hidden": true
			});
		}

		function WayfinderCard({ map }) {
			const [collapsed, setCollapsed] = (0, react.useState)(true);
			const [settings] = useWayfinderUiSettings();
			const tasks = map.tasks ?? [];
			if (!settings.inSessionPanel)
				return null;
			if (tasks.length === 0)
				return null;
			const done = tasks.filter((t) => t.status === "done").length;
			const grillingCount = tasks.filter((t) => t.grilling).length;
			return (0, react_jsx_runtime.jsx)("section", {
				className: "kwf_card",
				"data-testid": "wayfinder-card",
				"aria-label": "Wayfinder map",
				children: (0, react_jsx_runtime.jsxs)("div", {
					className: "kwf_body",
					children: [
						(0, react_jsx_runtime.jsxs)("div", {
							className: "kwf_headrow",
							children: [
								(0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									className: "kwf_header",
									"aria-expanded": !collapsed,
									onClick: () => setCollapsed((v) => !v),
									children: [
										(0, react_jsx_runtime.jsx)("span", { className: "kwf_lead", "aria-hidden": true, children: "\u25A4" }),
										(0, react_jsx_runtime.jsx)("span", { className: "kwf_title", children: map.title || "Wayfinder map" }),
										(0, react_jsx_runtime.jsx)("span", { className: "kwf_progress", children: done + "/" + tasks.length + " done \u00B7 " + (tasks.length - done) + " open" }),
										(0, react_jsx_runtime.jsx)("span", { className: "kwf_chevron", "aria-hidden": true, children: collapsed ? "\u25B8" : "\u25BE" })
									]
								})
							]
						}),
						!collapsed && (0, react_jsx_runtime.jsx)("ul", {
							className: "kwf_list",
							children: tasks.map((task) => (0, react_jsx_runtime.jsxs)("li", {
								className: "kwf_item",
								"data-status": task.status,
								title: task.blockedBy && task.blockedBy.length > 0 ? "Blocked by " + task.blockedBy.join(", ") : undefined,
								children: [
									statusGlyph(task.status),
									task.grilling ? flameGlyph() : null,
									task.type !== undefined && (0, react_jsx_runtime.jsx)("span", { className: "kwf_type", children: task.type }),
									(0, react_jsx_runtime.jsx)("span", { style: { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: task.id + " " + task.title }),
									typeof task.sessionId === "string" && task.sessionId !== "" && (0, react_jsx_runtime.jsx)("button", { type: "button", className: "kwf_open", title: "Open spawned session", "aria-label": "Open session for task " + task.id, onClick: function () { openSpawnedSession(task.sessionId); }, children: "\u2197" }, "open")
								]
							}, task.id))
						})
					]
				})
			});
		}

		/** Dock adapter: polls /dsh-wayfinder/state.json via the shared hook; no live map renders nothing. */
		function WayfinderDock(props) {
			const [settings] = useWayfinderUiSettings();
			const state = useWayfinderState(settings.inSessionPanel);
			if (!state || !state.map) return null;
			// This dock lives above THIS session's composer: only the session
			// that charted the map (wayfinder_map_create/map_sync stamps
			// createdBySessionId) shows it. No stamp (hand-written registry)
			// hides it everywhere; claim the map by calling wayfinder_map_sync
			// once from your session.
			if (state.map.createdBySessionId !== props?.sessionId) return null;
			return (0, react_jsx_runtime.jsx)(WayfinderCard, { map: { title: state.map.title, tasks: state.tasks } });
		}

		const wayfinderDockEntry = {
			name: "conversation-wayfinder-dock",
			inject: ["slots"],
			apply(ctx) {
				ctx.slots.inject("conversation.input.dock", () => ctx.slots.register({
					name: "conversation.input.dock",
					id: "wayfinder",
					order: 1,
					// Slot declarations receive the owning session id here; surface it so
					// WayfinderDock can gate the card on the map's createdBySessionId.
					inject: (sessionId) => ({ sessionId })
				}, WayfinderDock));
			}
		};

		// ----- ticket 03: right-docked rail (To-dos timeline layout, ticket decision) -----

		/** Open a task's spawned session: injected sessions service first (host-native navigation, the same call the sidebar rows make), sidebar-row click as the degraded path. */
		let wayfinderCtx = null;
		function openSpawnedSession(sessionId) {
			const svc = wayfinderCtx && wayfinderCtx.sessions;
			if (svc && typeof svc.open === "function") {
				try { svc.open(sessionId); return; } catch (_e) { /* unknown/stale id fails loud in the service */ }
			}
			try { const row = ambFindRow(sessionId); if (row) row.click(); } catch (_e) { /* host rows unmounted */ }
		}

		const RAIL_ORDER = ["running", "waiting", "blocked", "todo", "done"];
		/** Pure ordering for the rail: running first … done last; stable within a status. */
		function orderTasks(tasks) {
			return [...tasks].sort((a, b) => {
				const rank = RAIL_ORDER.indexOf(a.status);
				const rankB = RAIL_ORDER.indexOf(b.status);
				return (rank < 0 ? RAIL_ORDER.length : rank) - (rankB < 0 ? RAIL_ORDER.length : rankB);
			});
		}

		function WayfinderRailItem({ task }) {
			const hasSession = typeof task.sessionId === "string" && task.sessionId !== "";
			const blockedBy = task.blockedBy && task.blockedBy.length > 0 ? "blocked by " + task.blockedBy.join(", ") : "";
			return (0, react_jsx_runtime.jsxs)("li", {
				className: "kwf_rail_item",
				"data-status": task.status,
				title: [hasSession ? "session " + task.sessionId : "", blockedBy].filter(Boolean).join(" \u00B7 ") || undefined,
				children: [
					statusGlyph(task.status),
					task.grilling ? flameGlyph() : null,
					task.type !== undefined && (0, react_jsx_runtime.jsx)("span", { className: "kwf_type", children: task.type }),
					(0, react_jsx_runtime.jsx)("span", { style: { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: task.id + " " + task.title }),
					hasSession && (0, react_jsx_runtime.jsx)("button", { type: "button", className: "kwf_open", title: "Open spawned session", "aria-label": "Open session for task " + task.id, onClick: function () { openSpawnedSession(task.sessionId); }, children: "\u2197" }, "open")
				]
			}, task.id);
		}

		function WayfinderRailBody({ tasks: rawTasks }) {
			const tasks = orderTasks(rawTasks ?? []);
			if (tasks.length === 0)
				return (0, react_jsx_runtime.jsx)("p", { className: "kwf_rail_empty", children: "No map tasks" });
			const done = tasks.filter((t) => t.status === "done").length;
			const grillingCount = tasks.filter((t) => t.grilling).length;
			return (0, react_jsx_runtime.jsxs)(react.Fragment, {
				children: [
					(0, react_jsx_runtime.jsx)("p", { className: "kwf_rail_progress", children: done + "/" + tasks.length + " done" }),
				grillingCount > 0 && (0, react_jsx_runtime.jsx)("span", { className: "kwf_grill_pill", title: "Grilling batches awaiting your input", children: [flameGlyph(), grillingCount + " grilling"] }),
					(0, react_jsx_runtime.jsx)("ul", { className: "kwf_rail_list", children: tasks.map((task) => (0, react_jsx_runtime.jsx)(WayfinderRailItem, { task }, task.id)) })
				]
			});
		}

		/**
		 * Shared poll cadence (right rail + in-session dock + ambient marking):
		 * ONE core owns the generation counter, the interval timer, and the
		 * subscriber set — any surface's gate flip can never strand another
		 * consumer's updates. deps inject fetch/setInterval/clearInterval for
		 * tests; they fall back to the host globals.
		 */
		const AMB_POLL_MS = 5000;
		/**
		 * Poll cadence core: fetch → ok-check → json, delivered to every
		 * current subscriber if the generation is unchanged (a fetch resolving
		 * after stop/gate-off is stale and dropped). Rejections and non-ok
		 * responses degrade to onError per subscriber.
		 */
		function createPollCore(deps) {
			const fetchFn = (deps && deps.fetch) || globalThis.fetch;
			const setIntervalFn = (deps && deps.setInterval) || globalThis.setInterval;
			const clearIntervalFn = (deps && deps.clearInterval) || globalThis.clearInterval;
			const subscribers = new Set();
			let generation = 0;
			let timer = null;
			function tick() {
				const gen = generation;
				fetchFn("/dsh-wayfinder/state.json")
					.then((response) => {
						if (!response.ok) throw new Error(String(response.status));
						return response.json();
					})
					.then((value) => {
						if (generation !== gen) return; // stale: cadence stopped or gate flipped
						for (const sub of subscribers) sub.onData(value);
					})
					.catch(() => {
						if (generation !== gen) return;
						for (const sub of subscribers) sub.onError();
					});
			}
			function detach(handle) {
				if (!subscribers.delete(handle)) return;
				if (subscribers.size === 0) {
					generation++; // invalidate any in-flight fetch
					clearIntervalFn(timer);
					timer = null;
				}
			}
			return {
				subscribe(onData, onError) {
					const handle = { onData, onError };
					const wasEmpty = subscribers.size === 0;
					subscribers.add(handle);
					if (wasEmpty) {
						// 0->1 transition arms the cadence: bump the generation
						// (invalidate any in-flight tick from a previous life),
						// then one immediate tick and start the interval. Later
						// subscribers during an already-running cadence are just
						// added — no generation bump, no extra immediate tick;
						// they join on the next cadence tick.
						generation++;
						tick();
						timer = setIntervalFn(tick, AMB_POLL_MS);
					}
					return () => detach(handle);
				},
				unsubscribe(onData) {
					for (const handle of subscribers)
						if (handle.onData === onData) { detach(handle); break; }
				},
				__state() { return { subscriberCount: subscribers.size, generation, timerActive: timer !== null }; }
			};
		}
		/** One module-level cadence feeds every consumer surface (rail, dock, ambient). */
		const pollCore = createPollCore();
		/** Poll state.json while enabled; returns { map, tasks } or null. Subscribes to the shared pollCore: errors degrade to null (no frozen stale map), stop/unmount unsubscribes and clears the hook's state. */
		function useWayfinderState(enabled) {
			const [state, setState] = (0, react.useState)(null);
			(0, react.useEffect)(() => {
				if (!enabled) {
					setState(null);
					return;
				}
				const unsubscribe = pollCore.subscribe(
					(value) => setState(value),
					() => setState(null)
				);
				return () => {
					unsubscribe();
					setState(null);
				};
			}, [enabled]);
			return state;
		}

		function WayfinderRail() {
			const [settings] = useWayfinderUiSettings();
			const [opened, setOpened] = (0, react.useState)(false);
			const state = useWayfinderState(settings.rightPanel);
			const map = state?.map ?? null;
			if (!settings.rightPanel) return null;
			if (map === null) return null;
			// Auto-show off: hold at the edge launcher until the user asks for the rail.
			if (!settings.autoShowPanel && !opened)
				return (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: "kwf_launch",
					"data-testid": "wayfinder-launch",
					title: "Open the Wayfinder map panel",
					"aria-label": "Open Wayfinder map panel",
					onClick: () => setOpened(true),
					children: "\u25A4 Wayfinder"
				});
			return (0, react_jsx_runtime.jsxs)("aside", {
				className: "kwf_rail",
				"data-testid": "wayfinder-rail",
				"aria-label": "Wayfinder map",
				children: [
					(0, react_jsx_runtime.jsxs)("div", { className: "kwf_rail_head", children: [
						(0, react_jsx_runtime.jsx)("h2", { className: "kwf_rail_title", children: map.title || "Wayfinder map" }),
						(0, react_jsx_runtime.jsx)("button", { type: "button", className: "kwf_close", title: "Close panel", "aria-label": "Close Wayfinder map panel", onClick: () => setOpened(false), children: "\u00D7" })
					] }),
					(0, react_jsx_runtime.jsx)(WayfinderRailBody, { tasks: state?.tasks ?? [] })
				]
			});
		}

		const wayfinderRailEntry = {
			name: "conversation-wayfinder-rail",
			inject: ["slots"],
			apply(ctx) {
				ctx.slots.inject("shell.overlay", () => ctx.slots.register({
					name: "shell.overlay",
					id: "wayfinder-rail",
					order: 100
				}, WayfinderRail));
				ctx.slots.inject("shell.overlay", () => ctx.slots.register({
					name: "shell.overlay",
					id: "wayfinder-ambient",
					order: 101
				}, WayfinderAmbient));
			}
		};

		/** Global Settings dialog page: the plugin's one configuration home (seat lives only while sidebar.settings is mounted). */
		const wayfinderSettingsEntry = {
			name: "conversation-wayfinder-settings",
			inject: ["slots"],
			apply(ctx) {
				ctx.slots.inject("settings.section", () => ctx.slots.register({
					name: "settings.section",
					id: "wayfinder",
					order: 100,
					label: "Wayfinder"
				}, WayfinderSettingsSection));
			}
		};

		// ----- ticket 04: ambient sidebar marking (shared state.json source) -----

		const AMB_SUBHEAD_ID = "kwf-sidebar-group";
		function ambEscape(id) {
			try { return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : String(id).replace(/[^a-zA-Z0-9_-]/g, "\\$&"); }
			catch { return String(id); }
		}
		function ambFindRow(sessionId, sessionTitle) {
			if (!sessionId) return null;
			let hit = null;
			try { hit = document.querySelector('[data-session-id="' + ambEscape(sessionId) + '"]'); } catch { /* selector error */ }
			if (hit) return hit;
			const rows = document.querySelectorAll('[class*="sessionRow"]');
			if (rows.length === 0 || !sessionTitle) return null;
			for (const row of rows) {
				const t = row.querySelector("[class*=\"title\"]");
				if (t && (t.textContent || "").trim().includes(sessionTitle)) return row;
			}
			return null;
		}
		const ambientState = { sig: "" };
		function ambTeardown() {
			const head = document.getElementById(AMB_SUBHEAD_ID);
			if (head) head.remove();
			document.querySelectorAll(".kwf_amb_st").forEach((badge) => badge.remove());
			document.querySelectorAll(".kwf_amb_row").forEach((row) => row.classList.remove("kwf_amb_row"));
			ambientState.sig = "";
		}
		/** Pure badge label: running -> "active", waiting -> "waits", anything else (incl. unknown/undefined) passes through as its string. Same mapping ambBadge applies. */
		function ambientBadgeLabel(status) {
			return status === "running" ? "active" : status === "waiting" ? "waits" : String(status ?? "");
		}
		function ambBadge(task, row) {
			row.classList.add("kwf_amb_row");
			let badge = row.querySelector(".kwf_amb_st");
			if (!badge) {
				badge = document.createElement("span");
				badge.className = "kwf_amb_st";
				row.appendChild(badge);
			}
			const label = ambientBadgeLabel(task.status);
			if (badge.textContent !== label) badge.textContent = label;
			if (badge.dataset.st !== task.status) badge.dataset.st = task.status ?? "";
			const tip = "task " + task.id + " \u2014 " + (task.title ?? "");
			if (badge.title !== tip) badge.title = tip;
		}
		/** Pure change-signature: JSON.stringify([map name, ordered found sessionIds]). Stable iff the map name and the set/order of found sessions are unchanged. */
		function ambientSignature(mapName, foundTasks) {
			return JSON.stringify([mapName, foundTasks.map((t) => t.sessionId)]);
		}
		/** Mark session rows of the active map; own nodes only — React owns the sidebar tree, so never move host rows. */
		function ambMark(value) {
			const tasks = Array.isArray(value?.tasks) ? value.tasks.filter((t) => typeof t.sessionId === "string" && t.sessionId !== "") : [];
			if (!value || !value.map || tasks.length === 0) { ambTeardown(); return; }
			const found = [];
			for (const task of tasks) {
				const row = ambFindRow(task.sessionId, task.sessionTitle);
				if (row) found.push({ task, row });
			}
			if (found.length === 0) {
				// Rows unmounted/filtered after a prior successful mark: tear down
				// or the sibling sub-header outlives its rows. No prior mark (or
				// collapsed group not yet rendered): keep waiting for the next poll.
				if (ambientState.sig) ambTeardown();
				return;
			}
			const sig = ambientSignature(value.map.name, found.map((p) => p.task));
			if (sig !== ambientState.sig) ambTeardown(); // membership changed: clear stale marks first
			ambientState.sig = sig;
			let head = document.getElementById(AMB_SUBHEAD_ID);
			const firstRow = found[0].row;
			const parent = firstRow.parentElement;
			if (parent && (!head || !head.isConnected || head.nextElementSibling !== firstRow)) {
				if (head) head.remove();
				head = document.createElement("div");
				head.id = AMB_SUBHEAD_ID;
				head.className = "kwf_amb_subhead";
				head.textContent = "Wayfinder \u2014 " + (value.map.title || value.map.name);
				parent.insertBefore(head, firstRow);
			}
			for (const pair of found)
				ambBadge(pair.task, pair.row);
		}
		/**
		 * Invisible overlay entry (order after the rail): owns the ambient
		 * marking loop. Renders nothing; gated on settings.sessionHighlight.
		 * beforeunload teardown so a mid-session reload never persists odd DOM.
		 */
		function WayfinderAmbient() {
			const [settings] = useWayfinderUiSettings();
			(0, react.useEffect)(() => {
				if (!settings.sessionHighlight) {
					ambTeardown();
					return;
				}
				const unsubscribe = pollCore.subscribe(ambMark, ambTeardown);
				window.addEventListener("beforeunload", ambTeardown);
				return () => {
					unsubscribe();
					window.removeEventListener("beforeunload", ambTeardown);
					ambTeardown();
				};
			}, [settings.sessionHighlight]);
			return null;
		}

		exports.__test = {
			parseSettings, serializeSettings, orderTasks, AMB_POLL_MS,
			createPollCore,
			pollCoreState: () => pollCore.__state(),
			ambientBadgeLabel, ambientSignature
		};
		exports.apply = function (ctx) {
			wayfinderCtx = ctx; // captured for openSpawnedSession (sessions service face)
			wayfinderDockEntry.apply(ctx);
			wayfinderRailEntry.apply(ctx);
			wayfinderSettingsEntry.apply(ctx);
		};
		exports.inject = ["slots", "sessions"];
		return module.exports;
	}
});
