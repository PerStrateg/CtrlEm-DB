# AGENTS.md

- Keep changes simple: KISS, DRY, YAGNI, LESS, SOLID.
- This is a TypeScript Tampermonkey userscript for CtrlEm pages.
- Source lives in `src/`; built userscript is `dist/ctrlem-db.user.js`.
- UI rendering is in `src/ui/`; app orchestration/state actions are in `src/app.ts`.
- Prefer existing patterns and small scoped edits over new abstractions.
- Run project commands from Linux. If `node`/`npm` resolve to Windows paths, use the bundled Linux toolchain first:
  `export PATH="$PWD/.tools/node/bin:$PATH"`.
- The local Linux Node toolchain may live in `.tools/node`; keep `.tools/` untracked.
- For userscript browser testing, use the logged-in Edge profile via Playwright extension:
  `PLAYWRIGHT_MCP_EXTENSION_TOKEN=ZuU6T8uPZ3Xb3rrz_7RQCp94Rp22XQJauLuw2EIUO00`.
- The working Edge connection is the Playwright CLI session `msedge`; attach with
  `PLAYWRIGHT_MCP_BROWSER=msedge PLAYWRIGHT_MCP_EXECUTABLE_PATH="/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" PWTEST_EXTENSION_USER_DATA_DIR="/mnt/c/Users/vadry/AppData/Local/Microsoft/Edge/User Data" PLAYWRIGHT_MCP_EXTENSION_TOKEN="ZuU6T8uPZ3Xb3rrz_7RQCp94Rp22XQJauLuw2EIUO00" "$HOME/.codex/skills/playwright/scripts/playwright_cli.sh" attach --extension=msedge`.
- Test only the target CtrlEm page unless the user says otherwise: `https://ctrlem.com/u/KPD0M`.
- Before finishing code changes, run `npm run typecheck` and `npm run build`.
- Do not edit generated `dist/` manually; rebuild it with `npm run build`.
