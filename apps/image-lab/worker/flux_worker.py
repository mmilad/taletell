"""Small JSON-lines worker boundary for local Flux generation.

The worker intentionally has no web server and no application-domain knowledge.
It can run in mock mode today; installing torch/diffusers enables the real path later.
The pipeline is cached after the first real request so later portraits stay fast.
"""
from __future__ import annotations
import json, os, sys, uuid

PIPELINE = None
PIPELINE_DEVICE = None
PIPELINE_MODEL = None

def emit(value):
    print(json.dumps(value), flush=True)

def generate_mock(request):
    count=max(1, min(int(request.get("variants", 1)), 8))
    return [{"id": f"mock-{uuid.uuid4().hex[:10]}", "provider": "flux-worker-mock", "metadata": {
        "mode": request.get("mode", "composition"), "subject": request.get("subject", "scene"), "prompt": request.get("prompt", ""), "variant": i + 1,
        "references": len(request.get("references", [])), "note": "Worker is in mock mode. Set STORYTELLER_FLUX_MODE=real after installing Flux dependencies."
    }} for i in range(count)]

def resolve_device(torch):
    if getattr(torch.backends, "mps", None) is not None and torch.backends.mps.is_available():
        return "mps"
    if torch.cuda.is_available():
        return "cuda"
    return "cpu"

def log_cuda(torch, label):
    if not torch.cuda.is_available():
        print(f"[flux] {label}: cuda unavailable", file=sys.stderr, flush=True)
        return
    allocated=torch.cuda.memory_allocated()/1e9
    reserved=torch.cuda.memory_reserved()/1e9
    print(f"[flux] {label}: {torch.cuda.get_device_name(0)} allocated={allocated:.1f}GB reserved={reserved:.1f}GB", file=sys.stderr, flush=True)

def load_pipeline(torch, model_id):
    global PIPELINE, PIPELINE_DEVICE, PIPELINE_MODEL
    if PIPELINE is not None and PIPELINE_MODEL == model_id:
        return PIPELINE, PIPELINE_DEVICE
    from diffusers import Flux2Pipeline, Flux2KleinPipeline
    pipeline_class=Flux2KleinPipeline if "klein" in model_id.lower() else Flux2Pipeline
    dtype=torch.bfloat16 if torch.cuda.is_available() else torch.float32
    pipe=pipeline_class.from_pretrained(model_id, torch_dtype=dtype)
    device=resolve_device(torch)
    if device == "cuda":
        torch.backends.cuda.matmul.allow_tf32=True
        torch.backends.cudnn.allow_tf32=True
        # Official Klein path: move one module at a time so the Qwen encoder
        # does not sit on the CPU for minutes or overflow the 4080.
        pipe.enable_model_cpu_offload()
        log_cuda(torch, "pipeline ready")
    PIPELINE, PIPELINE_DEVICE, PIPELINE_MODEL = pipe, device, model_id
    return pipe, device

def handle(request):
    mode_name=os.getenv("STORYTELLER_FLUX_MODE", "mock")
    if mode_name != "real":
        return {"ok": True, "mode": "mock", "jobId": request.get("jobId") or uuid.uuid4().hex, "images": generate_mock(request)}
    try:
        import torch
        from PIL import Image
    except ImportError as exc:
        return {"ok": False, "error": "Flux mode requires torch and Pillow", "detail": str(exc)}
    model_id=os.environ.get("STORYTELLER_FLUX_MODEL", "black-forest-labs/FLUX.2-klein-4B")
    try:
        pipe, device = load_pipeline(torch, model_id)
        output_dir=os.path.abspath(request.get("outputDirectory") or os.path.join(os.path.dirname(__file__), "..", "..", "..", "generated-assets"))
        os.makedirs(output_dir, exist_ok=True)
        reference_images=[]
        for ref in request.get("references", []) or []:
            raw=ref.get("filePath") or ref.get("url") or ""
            path=raw if os.path.isfile(raw) else os.path.join(output_dir, os.path.basename(raw.replace("\\","/")))
            if path and os.path.isfile(path):
                reference_images.append(Image.open(path).convert("RGB"))
        print(f"[flux] references={len(reference_images)} mode={request.get('mode')} subject={request.get('subject')}", file=sys.stderr, flush=True)
        results=[]
        count=max(1, min(int(request.get("variants", 1)), 4))
        subject=request.get("subject", "scene")
        default_size=768
        for index in range(count):
            mode=request.get("mode", "composition")
            if mode == "asset" and subject == "character":
                instruction="Create one isolated character example. Full body, cream background, no scenery, no extra characters, not a black silhouette."
            elif mode == "asset":
                instruction="Create a reusable empty location example with no main characters."
            else:
                instruction="Compose this moment using the attached character examples as identity. Do not change who they are."
            kwargs={
                "prompt": instruction+"\n"+request.get("prompt", ""),
                "height": int(request.get("height", default_size)),
                "width": int(request.get("width", default_size)),
                "num_inference_steps": int(request.get("steps", 4 if "klein" in model_id.lower() else 50)),
                "guidance_scale": float(request.get("guidanceScale", 1.0 if "klein" in model_id.lower() else 3.5)),
            }
            if reference_images:
                kwargs["image"]=reference_images
            print("[flux] encoding prompt, then denoise. The 4-step bar starts after encoding.", file=sys.stderr, flush=True)
            with torch.inference_mode():
                image=pipe(**kwargs).images[0]
            log_cuda(torch, f"variant {index+1} done")
            filename=os.path.join(output_dir, f"{request.get('jobId', uuid.uuid4().hex)}-{index+1}-{uuid.uuid4().hex[:8]}.png")
            image.save(filename)
            if not os.path.isfile(filename) or os.path.getsize(filename) == 0:
                raise RuntimeError("Flux completed without producing a PNG file")
            results.append({"id": uuid.uuid4().hex, "filePath": filename, "provider": "flux2", "metadata": {"model": model_id, "device": device, "mode": mode, "subject": subject, "variant": index+1}})
        return {"ok": True, "mode": "real", "jobId": request.get("jobId") or uuid.uuid4().hex, "images": results}
    except Exception as exc:
        return {"ok": False, "error": "Flux generation failed", "detail": str(exc)}

def status():
    real=os.getenv("STORYTELLER_FLUX_MODE", "mock") == "real"
    detail={"mode": "real" if real else "mock", "model": os.environ.get("STORYTELLER_FLUX_MODEL", "black-forest-labs/FLUX.2-klein-4B"), "ready": False, "device": None}
    if not real:
        return {"ok": True, **detail, "detail": "Worker is in mock mode. Set STORYTELLER_FLUX_MODE=real to generate PNG character sheets."}
    try:
        import torch
        detail["device"]=resolve_device(torch)
        detail["ready"]=True
        detail["cuda"]=bool(torch.cuda.is_available())
        if torch.cuda.is_available():
            detail["gpu"]=torch.cuda.get_device_name(0)
        return {"ok": True, **detail}
    except Exception as exc:
        return {"ok": False, **detail, "error": "Flux dependencies are missing", "detail": str(exc)}

if len(sys.argv) > 1 and sys.argv[1] == "status":
    emit(status())
    raise SystemExit(0)

for line in sys.stdin:
    try:
        emit(handle(json.loads(line)))
    except Exception as exc:
        emit({"ok": False, "error": "Invalid generation request", "detail": str(exc)})
