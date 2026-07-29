# Contributing to Safety Viz

Thanks for your interest in contributing!

## Development setup

```bash
npm install
cp .env.example .env   # point SAFETY_VIZ_API_URL at a running backend
npm run dev
```

See the [README](README.md) for the architecture and configuration details. Note that the app requires a running CL01000136-V2 backend.

## Before opening a pull request

There is no unit-test runner; the quality gates are:

```bash
npm run lint          # must pass with no errors
npm run build         # tsc -b (strict) + vite build must pass
npm run verify:calc   # indicator calculation checks must pass
```

Please also smoke-test the affected screens in the dev server (indicators dashboard and/or the inspected-conditions map view).

## Conventions

- **Language**: code, comments, and documentation are English.
- **TypeScript**: strict mode with `verbatimModuleSyntax` — use `import type` for type-only imports. `noUnusedLocals`/`noUnusedParameters` are on.
- **Logging**: no `console.log` in committed code; `console.error`/`console.warn` in catch blocks is fine.
- **Structure**: feature folders under `src/features/<feature>/` (`components/`, `hooks/`, `store/`, `utils/`, `types/`, `api/`); shared pure helpers in `src/lib/`; app-wide UI/API primitives in `src/core/`. Path aliases are defined in both `vite.config.ts` and `tsconfig.app.json` — keep them in sync.
- **Calculation code**: anything touching `utils/valueMode.ts`, `utils/chartUtils.ts`, or period math must keep `npm run verify:calc` green; the script imports these modules by path, so keep the import paths valid.

## Commit style

Small, focused commits with imperative subject lines. For refactors, separate pure moves from behavioral changes.
