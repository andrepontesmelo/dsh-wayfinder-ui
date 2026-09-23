# Contributing

Thanks for looking at dsh-wayfinder-ui. PRs welcome.

## Workflow

1. Fork / branch from `main`.
2. Make the change with a test that pins it (`test/`, `node --test`).
3. Run the local gate:

   ```bash
   npm test        # unit suite (node --test)
   ```

4. Open a PR describing what changed and why.

CI runs the same gate on Node 22; a PR is mergeable when both are green.

## Ground rules

- ESM only, Node ≥ 22, no transpile step, no new runtime dependencies without
  discussion (zod is the only one so far).
- The registry file `.wayfinder-runner/state.json` is the single source of
  truth: status derivation (`todo|done|running|waiting|blocked`) happens on
  read, never by writing derived statuses back — see the contracts in
  [lib/registry.js](lib/registry.js) and [lib/state.js](lib/state.js).
- Glossary terms from [CONTEXT.md](CONTEXT.md) are used verbatim in comments,
  tests and errors.
- Spawns require explicit human approval (`wayfinder_snippet` protocol);
  never weaken that rule to make demos easier.

## Reporting bugs

Open a GitHub issue with: DSH + plugin versions, the seed message of the
spawned session (redact workspace paths you'd rather not share), the relevant
rows from `.wayfinder-runner/state.json`, and what you expected vs what
happened.

## Security

See [SECURITY.md](SECURITY.md) — please do not open public issues for security
reports.
