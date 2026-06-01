# CtrlEm DB Shortcuts

## Project Purpose

CtrlEm DB Shortcuts is a TypeScript Tampermonkey userscript for CtrlEm pages. It adds a local database UI for reusable links, text, images, sounds, and videos, plus helpers for uploads, input capture, and serialized auto-send/manual send queues.

Source code lives in `src/`. The installable userscript is generated at:

```txt
dist/ctrlem-db.user.js
```

## Installation

Install dependencies and build the userscript:

```bash
npm install
npm run build
```

Then open `dist/ctrlem-db.user.js` in your browser or import it into Tampermonkey.

## Development Commands

```bash
npm run typecheck
npm run build
```

Use `npm run typecheck` to validate TypeScript and `npm run build` to regenerate the userscript in `dist/`.

## Local Testing

Run the local test page without Tampermonkey:

```bash
npm run dev:test
```

Open `http://127.0.0.1:5173/dev.html`. The dev page loads `test-webpage/test2.htm` in an iframe and injects `src/dev-userscript.ts`. That dev entry provides minimal `GM_*` stubs, `showToast`, and local responses for `/api/uploads/...`, then starts the normal `bootCtrlEmDb()` flow.

After the page loads, the **DB** button should appear on the CtrlEm page. Production output is still created with:

```bash
npm run build
```

## Project Structure

```txt
src/main.ts                 small production entry point
src/app.ts                  app controller and orchestration
src/domain/                 types, constants, defaults, parsing, and state logic
src/storage.ts              GM storage with localStorage fallback
src/services/               CtrlEm page/API integration and image cache
src/features/               input capture and auto-send behavior
src/ui/                     DOM rendering and styles
dist/ctrlem-db.user.js      generated userscript
```

UI modules render controls and call the actions passed into them. State changes, storage, import/export, CtrlEm API access, and caching are handled outside the UI files.

## Source vs Generated Userscript

Do not edit `dist/ctrlem-db.user.js` by hand. Make changes in `src/`, then run:

```bash
npm run build
```

The build step regenerates `dist/ctrlem-db.user.js` from the TypeScript source.
