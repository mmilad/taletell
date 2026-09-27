# Flux worker

The worker reads one JSON request per line from stdin and writes one JSON result per line to stdout. It supports `character`, `location`, `prop`, and `scene` subjects, plus typed reference assets and multiple variants.

`pnpm run image-lab` is only a tiny harness. It does **not** install Flux or make the authoring UI draw real portraits. The authoring app talks to this worker.

## Windows + NVIDIA setup

From `apps/image-lab/worker`:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install torch --index-url https://download.pytorch.org/whl/cu124
.\.venv\Scripts\python.exe -m pip install -r requirements-flux.txt
```

Then restart the authoring app. If the `.venv` exists, `pnpm run dev` now calls this worker in real mode. The first **Generate portrait** downloads `black-forest-labs/FLUX.2-klein-4B` and can take several minutes. Later sheets reuse the loaded pipeline.

Check the worker without opening the UI:

```powershell
.\.venv\Scripts\python.exe flux_worker.py status
```

## Mock mode

The default mode is mock and has no ML dependencies:

```sh
printf '%s\n' '{"subject":"character","prompt":"A friendly fox","variants":2}' | python -B flux_worker.py
```

Override the model with `STORYTELLER_FLUX_MODEL`, the output folder with `STORYTELLER_FLUX_OUTPUT_DIR`, and the timeout with `STORYTELLER_FLUX_TIMEOUT_MS`. The 4B Klein checkpoint needs roughly 13GB VRAM.
