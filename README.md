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
6. Reopen the project from local browser storage, or export/import a `.story.json` project file.

The analysis and image steps are deliberately provider-free mocks for this milestone. They preserve the domain boundary needed for later local or remote AI providers without requiring API keys.

Image generation is organized by subject (`character`, `location`, `prop`, or `scene`). The JSON-lines worker at `apps/image-lab/worker/flux_worker.py` is the direct Flux.2 execution boundary: it runs safely in mock mode by default and only loads large Flux dependencies when `STORYTELLER_FLUX_MODE=real` is explicitly enabled.

`src/playback.ts` also defines the first playback boundary: a small ordered manifest containing only the title and selected scene media, separate from the richer authoring project.

## Desktop Flux generation

The Vite/browser app intentionally stays in mock-preview mode. The Electron desktop app uses the same worker boundary and defaults to mock mode; enable real local Flux.2 explicitly when launching it:

```sh
STORYTELLER_FLUX_MODE=real npm run desktop
```

The default model is `black-forest-labs/FLUX.2-klein-4B`. Override it with `STORYTELLER_FLUX_MODEL`, set `STORYTELLER_FLUX_OUTPUT_DIR` to choose where PNGs are saved, and use `STORYTELLER_FLUX_TIMEOUT_MS` to change the 15-minute generation timeout. Real inference can be very slow on CPU-only systems.
