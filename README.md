# Storyteller

Local-first MVP monorepo for turning a children's story into an editable illustrated story plan.

## Repository layout

- `apps/authoring` — the React/Vite authoring UI and Electron desktop shell
- `apps/image-lab` — local image-provider harness
- `packages/image-provider` — provider-neutral image generation contracts and mock provider

## Run locally

```sh
npm install
npm run dev
```

Then open the local URL printed by Vite. The production build and tests can be checked with:

```sh
npm run build
npm test
```

`npm run typecheck` runs the TypeScript compiler without emitting files.

The desktop shell uses Electron and can be launched after installing dependencies with `npm run desktop`. It loads the same production build as the browser version and does not require Rust/Cargo.

## Image lab

The repository is now an npm workspace. `packages/image-provider` defines the small provider-neutral image contract, with mock and ComfyUI seams. `apps/image-lab` is a deliberately tiny local test harness; run it with `npm run --workspace @storyteller/image-lab start`. Flux/ComfyUI integration should be added there, not mixed into story-domain code.

## Current vertical slice

1. Create or paste a story.
2. Run lightweight draft analysis for characters, locations, and scenes.
3. Review and edit the story bible.
4. Review scene summaries and visual descriptions.
5. Generate/select mock image variants.
6. Reopen stories from the project API (SQLite on disk), or export/import a `.story.json` project file.

Stories persist through `/api/projects`. The authoring UI talks only to that HTTP API. Behind it is a `DbController` (SQLite today) with first-class tables for stories, characters, locations, scenes, and identity-sheet refs. Swap the database later by implementing `DbController` — Postgres can reuse the same routes and UI.

```
GET    /api/projects
POST   /api/projects
GET    /api/projects/:id
PUT    /api/projects/:id
DELETE /api/projects/:id
```

Default file: `data/storyteller.sqlite`. Generated example sheets are copied into `data/assets/` and served from `/library/{id}.png`, so they survive restarting the dev server. `STORYTELLER_STORE=memory` keeps stories in process memory. `STORYTELLER_SQLITE` overrides the SQLite path.

The analysis and image steps are deliberately provider-free mocks for this milestone. They preserve the domain boundary needed for later local or remote AI providers without requiring API keys.

Image generation is organized by subject (`character`, `location`, `prop`, or `scene`). The JSON-lines worker at `apps/image-lab/worker/flux_worker.py` is the direct Flux.2 execution boundary: it runs safely in mock mode by default and only loads large Flux dependencies when `STORYTELLER_FLUX_MODE=real` is explicitly enabled.

`src/playback.ts` also defines the first playback boundary: a small ordered manifest containing only the title and selected scene media, separate from the richer authoring project.

## Real character sheets (Flux worker)

The colored watercolor cards in the browser are placeholders. Real portraits come from the Python Flux worker, not from `npm run image-lab`.

On Windows with an NVIDIA GPU, set up the worker once:

```powershell
cd apps/image-lab/worker
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install torch --index-url https://download.pytorch.org/whl/cu124
.\.venv\Scripts\python.exe -m pip install -r requirements-flux.txt
```

Restart `npm run dev`. The header should change from **Mock images** to **Flux · your GPU**. Then use **Generate portrait** on a character. The first run downloads `black-forest-labs/FLUX.2-klein-4B` and writes PNGs into `generated-assets/`.

`npm run desktop` uses the same worker. Force mock or real with `STORYTELLER_FLUX_MODE`. Override the model with `STORYTELLER_FLUX_MODEL`. Real inference needs about 13GB VRAM for Klein 4B.
