# AGENTS.md

- Keep changes simple: KISS, DRY, YAGNI, LESS, SOLID.
- This is a TypeScript Tampermonkey userscript for CtrlEm pages.
- Source lives in `src/`; built userscript is `dist/ctrlem-db.user.js`.
- UI rendering is in `src/ui/`; app orchestration/state actions are in `src/app.ts`.
- Prefer existing patterns and small scoped edits over new abstractions.
- Run project commands from Linux. If `node`/`npm` resolve to Windows paths, use the bundled Linux toolchain first:
  `export PATH="$PWD/.tools/node/bin:$PATH"`.
- The local Linux Node toolchain may live in `.tools/node`; keep `.tools/` untracked.
- Before finishing code changes, run `npm run typecheck` and `npm run build`.
- Do not edit generated `dist/` manually; rebuild it with `npm run build`.
