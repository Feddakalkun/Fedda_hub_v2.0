# FEDDA Hub — RunPod Deployment

How to get FEDDA Hub running on a RunPod GPU pod. The Docker image is built and
pushed automatically by GitHub Actions on every push to `main`.

Image: `ghcr.io/feddakalkun/fedda_hub_v2.0:latest`

---

## 1. One-time: make the image public

RunPod needs to pull the image without credentials.

- GitHub → your profile → **Packages** → `fedda_hub_v2.0`
- **Package settings** → **Change visibility** → **Public**

(Only needed once. Do it after the first green build.)

## 2. Create a RunPod Template

RunPod → **Templates** → **New Template**:

| Field | Value |
|-------|-------|
| **Container Image** | `ghcr.io/feddakalkun/fedda_hub_v2.0:latest` |
| **Container Start Command** | *(leave empty — the image has its own entrypoint)* |
| **Expose HTTP Ports** | `3000` |
| **Volume Mount Path** | `/workspace` |
| **Volume** | attach a **Network Volume** (100–200 GB recommended) |

### Recommended env vars (optional — sensible defaults exist)
```
COMFY_PORT=8199
BACKEND_PORT=8000
FRONTEND_PORT=3000
JUPYTER_PORT=8888
```
Tuning (optional):
```
COMFY_RESERVE_VRAM_GB=1|2|3|4|6      # auto-selected from detected VRAM if unset
COMFY_EXTRA_ARGS=--disable-cuda-malloc
```

## 3. Deploy a pod

Deploy from the template on any CUDA NVIDIA GPU.
- A **4090 / A6000 / L40** lets you use the **fp8** precision option (faster) on WAN.
- A smaller card: use the **GGUF Q4** precision options; keep resolution/frames modest.

## 4. Open the app

After the pod boots:
- **App:** `https://<pod-id>-3000.proxy.runpod.net`
- Comfy API (proxied): `.../comfy/`
- Backend API: `.../api/`
- Jupyter (proxied): `.../jupyter/`

## 5. Models — download per workflow (nothing is baked in)

The image ships **zero model weights** on purpose. On first use:

1. In the app header, set your **HF token** (and Civitai key). These persist on the
   volume, so you only do this once per volume.
2. Open a workflow. If models are missing you'll see the amber **"Download models"**
   banner — click it to pull only that workflow's weights.
3. Downloads land on the `/workspace` network volume and survive pod restarts, so
   provisioning is a one-time cost per model.

## 6. What persists across pod restarts (network volume)

Handled automatically by the startup script:
- `/workspace/models/*` — all checkpoints, unet/GGUF, loras, vae, clip, text_encoders,
  controlnet, clip_vision, upscale_models, ultralytics (face detect), insightface, etc.
- `/workspace/input` and `/workspace/output` — uploads, generated media, TTS voice
  library (`input/VOICES`)
- `/workspace/runtime_settings.json` — HF token, Civitai key, saved UI settings

Anything else lives in the container and resets when the pod is recreated.

## 7. Health checks (inside the pod)

```
curl -fsS http://127.0.0.1:8000/health          # backend
curl -fsS http://127.0.0.1:8199/system_stats    # ComfyUI
```

## 8. Updating

Push to `main` → GitHub Actions rebuilds and pushes `:latest`. Recreate the pod (or
pull the new image) to pick it up. Because models live on the volume, an update
does **not** re-download weights.

## 9. GPU / precision notes

- Image uses PyTorch `cu124` wheels for broad GPU compatibility.
- `xformers` / `torchao` / `sageattention` install best-effort (non-fatal fallback).
- **WAN 2.2 i2v** has a precision toggle: **GGUF Q4** (fits 24 GB) vs **fp8** (faster,
  needs a bigger GPU). Pick per the pod's card.
- If a video decode ever hangs "forever," it's VRAM spilling to system RAM — Purge
  VRAM (header button) before big jobs, or set the driver's Sysmem Fallback to
  "Prefer No Sysmem Fallback".

## 10. Build internals (reference)

- Dockerfile: `runpod/Dockerfile` (context = repo root)
- Entrypoint: `runpod/runpod_start.sh` (symlinks volume, starts supervisord →
  ComfyUI + backend + nginx frontend)
- CI: `.github/workflows/docker-build.yml` (frees runner disk, builds, pushes to the
  repo GHCR package)
