#!/bin/bash
set -euo pipefail

echo "🚀 [FEDDA] Initializing Docker Container..."

WORKSPACE="/workspace"
MODELS_DIR="$WORKSPACE/models"
COMFY_DIR="/app/ComfyUI"
COMFY_PORT="${COMFY_PORT:-8199}"
BACKEND_PORT="${BACKEND_PORT:-8000}"

# 1. Setup Network Volume links
echo "💾 [FEDDA] Linking Persistent Storage (/workspace)..."
mkdir -p "$MODELS_DIR"/{checkpoints,diffusion_models,clip,text_encoders,vae,loras,sams,upscale_models,unet,controlnet,clip_vision,embeddings,style_models,ultralytics,insightface}
mkdir -p "$MODELS_DIR"/ultralytics/{bbox,segm}
mkdir -p "$WORKSPACE"/output
mkdir -p "$WORKSPACE"/input

# Link Comfy model subfolders to the volume so downloads persist across pods
for dir in checkpoints diffusion_models clip text_encoders vae loras sams upscale_models unet controlnet clip_vision embeddings style_models ultralytics insightface; do
    mkdir -p "$MODELS_DIR/$dir"
    if [ ! -L "$COMFY_DIR/models/$dir" ]; then
        rm -rf "$COMFY_DIR/models/$dir"
        ln -sf "$MODELS_DIR/$dir" "$COMFY_DIR/models/$dir"
    fi
done

# Link IO
rm -rf "$COMFY_DIR/output" && ln -sf "$WORKSPACE/output" "$COMFY_DIR/output"
rm -rf "$COMFY_DIR/input" && ln -sf "$WORKSPACE/input" "$COMFY_DIR/input"

# Persist UI settings (HF token, Civitai key, saved prompts) on the volume
if [ ! -f "$WORKSPACE/runtime_settings.json" ]; then
    if [ -f /app/config/runtime_settings.json ]; then cp /app/config/runtime_settings.json "$WORKSPACE/runtime_settings.json"; else echo '{}' > "$WORKSPACE/runtime_settings.json"; fi
fi
ln -sf "$WORKSPACE/runtime_settings.json" /app/config/runtime_settings.json
# (TTS voice library lives in input/VOICES, already persisted via the input link above)

# 2. Config Tweaks
echo "⚙️ [FEDDA] Configuring ComfyUI-Manager..."
MANAGER_DIR="$COMFY_DIR/custom_nodes/ComfyUI-Manager"
if [ -d "$MANAGER_DIR" ]; then
    mkdir -p "$MANAGER_DIR/user"
    cat > "$MANAGER_DIR/user/config.ini" << 'EOF'
[default]
security_level = weak
network_mode = public
EOF
fi

# 3. Launch Services
echo "🎬 [FEDDA] Starting Services (Port 3000/8199)..."
echo "🧠 [FEDDA] COMFY_PORT=${COMFY_PORT} BACKEND_PORT=${BACKEND_PORT}"
if command -v nvidia-smi >/dev/null 2>&1; then
  echo "🖥️ [FEDDA] GPU Info:"
  nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader || true
fi

# We use supervisord to manage Backend, Frontend (Nginx), and ComfyUI
supervisord -c /etc/supervisor/conf.d/supervisord.conf &
SUP_PID=$!

echo "⏳ [FEDDA] Waiting for Backend health..."
for _ in $(seq 1 90); do
  if curl -fsS "http://127.0.0.1:${BACKEND_PORT}/health" >/dev/null 2>&1; then
    echo "✅ [FEDDA] Backend is ready."
    break
  fi
  sleep 1
done

echo "⏳ [FEDDA] Waiting for ComfyUI..."
for _ in $(seq 1 120); do
  if curl -fsS "http://127.0.0.1:${COMFY_PORT}/system_stats" >/dev/null 2>&1; then
    echo "✅ [FEDDA] ComfyUI is ready."
    break
  fi
  sleep 1
done

wait "${SUP_PID}"
