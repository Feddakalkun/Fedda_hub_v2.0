# FEDDA AI Studio

All-in-one local AI studio: image generation (Z-Image, Krea 2, Chroma, Qwen, SDXL, Flux),
video generation (WAN 2.2, LTX 2.3, Hunyuan), talking-head lipsync (InfiniteTalk/MultiTalk),
TTS with voice cloning, LoRA management and one-click automations — all behind one clean
web UI on top of ComfyUI.

## Description

FEDDA Hub bundles a React frontend, a FastAPI backend and ComfyUI into a single container.
Pick a workflow card, type a prompt, hit Generate — the app drives ComfyUI for you.
Models are NOT baked into the image: each workflow page shows a "Download models" button
that pulls exactly what that workflow needs (with progress bars), so you only download
what you use. Ollama-powered prompt assistance (enhance / auto-caption / storyboard)
is built in.

## Getting Started

### Requirements

* GPU: 24 GB VRAM minimum (RTX 3090/4090 class). 48 GB+ (A6000 / RTX 6000 Ada / L40S)
  recommended for 720p+ video and long audio-to-video runs.
* Network volume: 75 GB+ mounted at `/workspace` (models + outputs persist there).

### Using the template

1. Deploy the pod and wait ~1–2 min for services to boot.
2. Open the **Frontend** on port **3000** (Connect → HTTP 3000).
3. Open any workflow card and click **Download models** the first time you use it.
4. Optional: add your Hugging Face token in the header (needed for gated models)
   and a Civitai key for LoRA downloads.

Exposed ports:

```
3000  FEDDA web UI (start here)
8199  ComfyUI (advanced/debugging)
8888  JupyterLab (file management)
22    SSH
```

## Help

* Out-of-memory on video: lower the resolution preset on the page, or use the GGUF
  variant where offered — the app's defaults are tuned for 24 GB.
* Gated model downloads failing: set your Hugging Face token in the header.
* Outputs live in `/workspace` (survives pod restarts if you use a network volume).

## Authors

Feddakalkun — https://github.com/Feddakalkun

## Version History

* 2.0 — Unified UI, WAN 2.2 + LTX 2.3 video, lipsync, TTS/voice cloning, per-workflow model downloader
* 1.x — Initial releases
