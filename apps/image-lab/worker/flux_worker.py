"""Small JSON-lines worker boundary for local Flux generation.

The worker intentionally has no web server and no application-domain knowledge.
It can run in mock mode today; installing torch/diffusers enables the real path later.
"""
from __future__ import annotations
import json, os, sys, time, uuid

def emit(value):
    print(json.dumps(value), flush=True)

def generate_mock(request):
    count=max(1, min(int(request.get("variants", 1)), 8))
    return [{"id": f"mock-{uuid.uuid4().hex[:10]}", "provider": "flux-worker-mock", "metadata": {
        "mode": request.get("mode", "composition"), "subject": request.get("subject", "scene"), "prompt": request.get("prompt", ""), "variant": i + 1,
        "references": len(request.get("references", [])), "note": "Install Flux dependencies to enable image files"
    }} for i in range(count)]

def handle(request):
    # Real inference is deliberately isolated here. The exact Flux.2 pipeline and
    # model loading strategy can change without changing the TypeScript contract.
    if os.getenv("STORYTELLER_FLUX_MODE", "mock") != "real":
        return {"ok": True, "jobId": request.get("jobId") or uuid.uuid4().hex, "images": generate_mock(request)}
    try:
        import torch  # type: ignore
        from diffusers import Flux2Pipeline, Flux2KleinPipeline  # type: ignore
    except ImportError as exc:
        return {"ok": False, "error": "Flux mode requires torch and diffusers", "detail": str(exc)}
    # Model loading is kept explicit and opt-in because weights are large.
    model_id=os.environ.get("STORYTELLER_FLUX_MODEL", "black-forest-labs/FLUX.2-klein-4B")
    try:
        from PIL import Image
        pipeline_class=Flux2KleinPipeline if 'klein' in model_id.lower() else Flux2Pipeline
        pipe=pipeline_class.from_pretrained(model_id, torch_dtype=torch.bfloat16)
        if getattr(torch.backends, "mps", None) is not None and torch.backends.mps.is_available():
            device="mps"
        elif torch.cuda.is_available():
            device="cuda"
        else:
            device="cpu"
        pipe.to(device)
        reference_images=[Image.open(ref["filePath"]).convert("RGB") for ref in request.get("references", []) if ref.get("filePath")]
        results=[]
        for _ in range(max(1, min(int(request.get("variants", 1)), 8))):
            mode=request.get("mode", "composition")
            instruction="Create a reusable canonical asset with a clear silhouette." if mode == "asset" else "Compose the current scene using the supplied reference identities."
            kwargs={"prompt":instruction+"\n"+request["prompt"], "height":request.get("height", 512), "width":request.get("width", 512), "num_inference_steps":request.get("steps", 4 if "klein" in model_id.lower() else 50)}
            if reference_images:
                kwargs["image"]=reference_images
            image=pipe(**kwargs).images[0]
            output_dir=os.path.abspath(request.get("outputDirectory") or os.path.join(os.path.dirname(__file__), "..", "..", "..", "generated-assets"))
            os.makedirs(output_dir, exist_ok=True)
            filename=os.path.join(output_dir, f"{request.get('jobId', uuid.uuid4().hex)}-{uuid.uuid4().hex[:8]}.png")
            image.save(filename)
            if not os.path.isfile(filename) or os.path.getsize(filename) == 0:
                raise RuntimeError("Flux completed without producing a PNG file")
            results.append({"id": uuid.uuid4().hex, "filePath": filename, "provider": "flux2", "metadata": {"model": model_id, "device": device, "mode": mode, "subject": request.get("subject")}})
        return {"ok": True, "jobId": request.get("jobId") or uuid.uuid4().hex, "images": results}
    except Exception as exc:
        return {"ok": False, "error": "Flux generation failed", "detail": str(exc)}

for line in sys.stdin:
    try:
        emit(handle(json.loads(line)))
    except Exception as exc:
        emit({"ok": False, "error": "Invalid generation request", "detail": str(exc)})
