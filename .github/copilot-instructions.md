# GitHub Copilot / AI Agent Instructions — cai-app

Purpose: brief, actionable guidance to get an AI coding agent productive in this repository.

## Quick start (dev & build) ✅
- Start frontend dev server: `npm run dev` (Vite dev server; default dev URL: `http://localhost:1420` per `tauri.conf.json`).
- Run the Tauri app during development: start the frontend first, then in another shell run `npm run tauri dev` to launch the native window that points at `devUrl`.
- Build for production: `npm run build` (frontend -> outputs to `build/`, configured in `tauri.conf.json` via `frontendDist: ../build`), then `npm run tauri build` to produce native bundles.
- Type checks: `npm run check` (or `npm run check:watch`).

## Big-picture architecture 🏗️
- Frontend: SvelteKit (Vite + TypeScript). The app is configured as an SPA (see `src/routes/+layout.ts`: `export const ssr = false`) and uses a static adapter.
- Native host/back-end: Tauri (Rust) under `src-tauri/`. Rust exposes commands to the frontend via `#[tauri::command]` and registers them with `tauri::generate_handler!` (see `src-tauri/src/lib.rs`).
- IPC: frontend should call Rust commands using `@tauri-apps/api` (the repo includes `@tauri-apps/api` dependency). Example pattern: `import { invoke } from '@tauri-apps/api/tauri'; await invoke('greet', { name: 'Alice' })`.
- Plugins: `tauri_plugin_opener` is initialized in `lib.rs` — if you need opener-related functionality, check Tauri plugin docs and the plugin's Rust init in `src-tauri/src/lib.rs`.

## Key files to inspect 🔎
- `package.json` — scripts and dev workflow
- `tauri.conf.json` — `devUrl`, `frontendDist`, icons, and packaging settings
- `src/routes/+layout.ts` — SPA/SSR config
- `src/routes/+page.svelte` — main UI; current chat is a stub (placeholder response with `setTimeout`)
- `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`, `src-tauri/src/main.rs` — Rust/Tauri entry points and command handlers

## Project-specific conventions & notes ⚠️
- SPA-only: SSR is intentionally disabled for Tauri packaging. Don’t add server-only Node code assuming SSR will run.
- Frontend build path is relative to `src-tauri` (`frontendDist: ../build`) — the packaging step expects the static build here.
- The app UI currently uses Russian strings in `+page.svelte`. Keep localization/strings in mind during UI work.
- There are no automated tests configured in the repo (no `test` script).

## How to add a new Tauri command (example) 🔧
1. Add a Rust function with `#[tauri::command]` in `src-tauri/src/lib.rs`:

```rust
#[tauri::command]
fn my_command(arg: &str) -> String { /* ... */ }
```
2. Add it to the generated handler: `tauri::generate_handler![greet, my_command]`.
3. Call it from the frontend:

```ts
import { invoke } from '@tauri-apps/api/tauri';
const result = await invoke('my_command', { arg: 'value' });
```

## Debugging tips 🐛
- For Rust errors, run `cargo build` inside `src-tauri/` or use `npm run tauri dev` to see Tauri console logs.
- For frontend issues, use Vite dev server (`npm run dev`) and the browser/DevTools before launching Tauri.

## What this file is not
- This is a discovery-driven, facts-only guide. It documents only what is present in the codebase (no aspirational or missing practices).

---
If anything above is unclear or you'd like the agent to add more examples (tests, CI, or common PR patterns), tell me which section to expand and I will iterate. 🚀
