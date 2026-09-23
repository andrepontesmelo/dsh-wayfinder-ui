# Security Policy

## Scope

dsh-wayfinder-ui is a DSH web-profile plugin: it spawns one top-level session
per ready Wayfinder task and renders the map in the GUI. It holds no
credentials — provider keys and routes live in the DSH profile, not here. The
plugin reads/writes `.wayfinder-runner/state.json` inside the workspaces it is
used from and polls `/dsh-wayfinder/state.json`.

## Supported versions

Only the latest commit on `main` receives security fixes (no releases yet).

## Reporting a vulnerability

Email the owner via the contact on the GitHub profile (andrepontesmelo)
rather than opening a public issue. Include: affected version/commit, a
registry file or map payload that reproduces the issue (redact anything
private), and expected vs actual behavior. You will get an acknowledgement
within 7 days and a fix or a documented mitigation for anything confirmed.

## What is NOT a vulnerability

- A spawned session executing a task you charted — spawning only happens after
  explicit human approval, and each seed carries the task's locator. Audit the
  maps you chart before approving spawns.
- Status derivation (`running`/`waiting`) inferred from spawned-session
  activity, or grilling flames lit by `wayfinder_grilling_start` — that is the
  designed observability surface.
- The registry file being committed to your repo: it contains task titles,
  locators and session ids, never credentials. If a locator references private
  infrastructure, redact it before sharing the file.
