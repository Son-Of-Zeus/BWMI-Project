# Repository Guidelines

## Project Structure & Module Organization

This repository contains the extension implementation plus architecture READMEs. `README.md` defines the system contracts, MVP journey, proposed stack, and build order. The mock portal is complete and is a read-only integration target; do not develop or modify it. Work only on the extension and its feature boundaries.

- `apps/extension/`: Manifest V3 extension shell and companion behavior.
- `apps/mock-portal/`: completed fictional EPFO-style site; read-only test target.
- `backend/`: small reasoning and speech API boundary; provider secrets stay server-side.
- `features/<area>/`: focused guidance for semantic extraction, registry, reasoning, voice, UI, session state, observation, guiding, and safety.

Place extension code and tests beside the owning feature. Update the relevant README when an extension contract changes, and keep shared schemas small and documented at the root or feature boundary.

## Build, Test, and Development Commands

Run extension commands from `apps/extension/`:

```sh
npm install                         # install extension dependencies
npm run dev                         # start WXT development mode
npm run typecheck                   # validate TypeScript
npm test                            # run Vitest tests once
npm run build                       # build the Chrome MV3 extension
```

Use `rg --files` to inventory files and `git diff --check` for whitespace validation. Do not add commands or changes for the completed mock portal.

## Coding Style & Naming Conventions

Use Markdown headings and fenced examples consistently. Proposed TypeScript uses two-space indentation, `camelCase` variables/functions, `PascalCase` types/components, and kebab-case feature directories (for example, `dom-semantic-layer`). Prefer explicit schemas and small interfaces over provider-specific types.

## Testing Guidelines

Vitest with jsdom is configured under `apps/extension/`. Add deterministic extension tests for semantic extraction, registry reconciliation, response validation, and data filtering, plus an end-to-end mock PF journey test. Use `*.test.ts`/`*.test.tsx`; never use real personal, Aadhaar, UAN, OTP, or banking data.

## Architecture and Safety Boundaries

The completed portal must remain free of extension hooks or assistant metadata. The extension may scan, scroll, highlight, speak, and observe actions, but the user must manually submit, consent, confirm, change personal data, enter OTPs, or perform financial actions. Never send raw HTML or sensitive form values to the model; validate every `targetId` against the live registry.

## Commit & Pull Request Guidelines

Use short imperative subjects with a scoped prefix, matching the existing history (for example, `feat(extension): add voice layer` or `docs: clarify registry contract`). Pull requests should explain the affected boundary, list validation results, link an issue when available, include UI screenshots/recordings, and call out safety, data-handling, or API-contract changes. The mock portal is complete; do not include portal feature work in commits or pull requests.
