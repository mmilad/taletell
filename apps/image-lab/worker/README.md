# Flux worker

The worker reads one JSON request per line from stdin and writes one JSON result per line to stdout. It supports `character`, `location`, `prop`, and `scene` subjects, plus typed reference assets and multiple variants.

The default mode is mock and has no ML dependencies:

```sh
printf '%s\n' '{"subject":"character","prompt":"A friendly fox","variants":2}' | python3 -B flux_worker.py
```

For real local inference, install `requirements-flux.txt` into the worker environment, download the selected Flux.2 weights, and opt in explicitly. The default is the smaller Flux.2 Klein 4B model; use `STORYTELLER_FLUX_MODEL` to select another model.

```sh
STORYTELLER_FLUX_MODE=real \
STORYTELLER_FLUX_MODEL=black-forest-labs/FLUX.2-klein-4B \
.venv/bin/python flux_worker.py
```

The model is intentionally not installed as part of the JavaScript application: its weights and hardware requirements are too large for a normal app dependency.
