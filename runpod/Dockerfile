# ============================================================================
# FEDDA RUNPOD IMAGE (GPU-flexible, CUDA 12.4, PyTorch cu124)
# ============================================================================

FROM node:22-alpine AS frontend-builder
COPY . /app
WORKDIR /app/frontend
RUN npm ci --no-audit --no-fund && npm run build

FROM nvidia/cuda:12.4.1-devel-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PYTHONIOENCODING=utf-8 \
    CUDA_HOME=/usr/local/cuda \
    LD_LIBRARY_PATH=/usr/local/cuda/lib64:${LD_LIBRARY_PATH} \
    PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True \
    COMFY_PORT=8199 \
    BACKEND_PORT=8000 \
    FRONTEND_PORT=3000 \
    JUPYTER_PORT=8888

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.11 python3.11-venv python3.11-dev python3-pip \
    git git-lfs curl wget nginx supervisor ffmpeg rsync \
    build-essential cmake ninja-build \
    libgl1-mesa-glx libglib2.0-0 libsm6 libxrender1 libxext6 \
    libffi-dev libssl-dev jq ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3.11 /usr/bin/python3 \
    && ln -sf /usr/bin/python3 /usr/bin/python

RUN python3 -m pip install --no-cache-dir --upgrade pip wheel setuptools

# PyTorch cu124 works across common RunPod NVIDIA GPUs (30/40/ADA/50 where supported by drivers)
RUN python3 -m pip install --no-cache-dir \
    torch torchvision torchaudio \
    --index-url https://download.pytorch.org/whl/cu124

# Optional acceleration (never fail whole build)
RUN python3 -m pip install --no-cache-dir xformers --index-url https://download.pytorch.org/whl/cu124 || true
RUN python3 -m pip install --no-cache-dir torchao || true
RUN python3 -m pip install --no-cache-dir sageattention || true

# Clone ComfyUI at latest master to support newest LTX nodes (cache-bust: 2026-04-11)
RUN git clone https://github.com/comfyanonymous/ComfyUI.git /app/ComfyUI \
    && cd /app/ComfyUI \
    && python3 -m pip install --no-cache-dir -r requirements.txt

# Custom nodes installed from config/nodes.json (single source of truth -
# never hand-sync a second list again). Clone + pip requirements for each,
# skipping local:true and skip_req_update:true nodes; failures are non-fatal.
COPY --from=frontend-builder /app/config/nodes.json /tmp/nodes.json
WORKDIR /app/ComfyUI/custom_nodes
RUN set -eux; \
    count=$(jq length /tmp/nodes.json); \
    i=0; \
    while [ "$i" -lt "$count" ]; do \
      url=$(jq -r ".[$i].url // empty" /tmp/nodes.json); \
      folder=$(jq -r ".[$i].folder // .[$i].name" /tmp/nodes.json); \
      is_local=$(jq -r ".[$i].local // false" /tmp/nodes.json); \
      skip_req=$(jq -r ".[$i].skip_req_update // false" /tmp/nodes.json); \
      i=$((i+1)); \
      if [ "$is_local" = "true" ] || [ -z "$url" ] || [ -d "$folder" ]; then continue; fi; \
      echo "[FEDDA] node: $folder"; \
      if ! git clone --depth 1 --recurse-submodules "$url" "$folder"; then \
        echo "[FEDDA] WARN clone failed: $folder ($url)"; rm -rf "$folder"; continue; \
      fi; \
      if [ "$skip_req" != "true" ] && [ -f "$folder/requirements.txt" ]; then \
        python3 -m pip install --no-cache-dir -r "$folder/requirements.txt" || true; \
      fi; \
    done

# llama-cpp-python prebuilt wheel for Searge LLM (source build needs MSVC/scikit-build)
RUN python3 -m pip install --no-cache-dir llama-cpp-python --prefer-binary \
      --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cpu || true

RUN python3 -m pip install --no-cache-dir \
    insightface \
    diffusers transformers accelerate safetensors sentencepiece \
    onnxruntime-gpu opencv-python-headless pillow tqdm requests psutil \
    fastapi "uvicorn[standard]" python-multipart httpx \
    jupyterlab ipykernel terminado jupyter_server_terminals

# FEDDA backend + feature deps: media downloader (yt-dlp), beat-cut reels
# (librosa/soundfile), local TTS (edge-tts), image-saver (piexif), Searge LLM
# (prebuilt llama-cpp wheel - source build needs MSVC). Chatterbox TTS is optional
# (heavy pins) - installed no-deps + minimal extras, setuptools<81 for pkg_resources.
RUN python3 -m pip install --no-cache-dir \
    librosa soundfile edge-tts yt-dlp piexif imageio-ffmpeg rembg pillow-heif \
    && python3 -m pip install --no-cache-dir llama-cpp-python --prefer-binary \
       --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cpu || true
RUN python3 -m pip install --no-cache-dir --no-deps chatterbox-tts \
    && python3 -m pip install --no-cache-dir conformer s3tokenizer resemble-perth pydub \
    && python3 -m pip install --no-cache-dir "setuptools==80.9.0" || true

COPY --from=frontend-builder /app/backend /app/backend
COPY --from=frontend-builder /app/config /app/config
COPY --from=frontend-builder /app/assets /app/assets
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Build stamp: check which image a pod runs at  https://<pod>-3000.proxy.runpod.net/version.txt
ARG GIT_SHA=dev
RUN echo "sha=${GIT_SHA} built=$(date -u +%Y-%m-%dT%H:%M:%SZ)" > /app/frontend/dist/version.txt

COPY runpod/nginx/nginx.conf /etc/nginx/nginx.conf
COPY runpod/supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY runpod/runpod_start.sh /app/runpod_start.sh
COPY runpod/start_comfy.sh /app/start_comfy.sh
RUN chmod +x /app/runpod_start.sh /app/start_comfy.sh

WORKDIR /app
EXPOSE 3000 8199 8888 8000

LABEL org.opencontainers.image.source=https://github.com/Feddakalkun/Fedda_hub_v15
LABEL org.opencontainers.image.description="FEDDA RunPod Studio (ComfyUI + Backend + Frontend)"

ENTRYPOINT ["/app/runpod_start.sh"]
