# LTX Parity Profile (Reference vs FEDDA)

Updated: 2026-04-03

## Goal
Match FEDDA LTX runtime behavior with known-good reference install at `E:\v337\App\ComfyUI`.

## Source-of-truth
- Repo source: this repository
- Active local install: your current FEDDA runtime copy
- Reference runtime: separate known-good ComfyUI install used for parity checks

## Baseline checklist
- ComfyUI core commit: pending capture
- Python version: pending capture
- Torch/CUDA versions: pending capture
- Critical custom-node commits:
  - ComfyUI-LTXVideo
  - RES4LYF
  - KJNodes
  - Impact-Pack + Impact-Subpack
  - InstantID
  - LayerStyle
  - WAS Node Suite

## Model-name/path parity rules
- Accept both Gemma filename variants:
  - `text_encoders/comfy_gemma_3_12B_it.safetensors`
  - `text_encoders/gemma_3_12B_it.safetensors`
- Accept MelBandRoFormer capitalization variants:
  - `diffusion_models/MelBandRoformer_fp16.safetensors`
  - `diffusion_models/MelBandRoFormer_fp16.safetensors`

## Active LTX workflows in repo
- `frontend/public/workflows/ltx23-single-stage-api.json`
- `frontend/public/workflows/LTX2img2vidsound.json`
- `frontend/public/workflows/LTX2lipsync.json`
- Imported parity candidates:
  - `frontend/public/workflows/LTX2img2vidsoundv2.json`
  - `frontend/public/workflows/LTX2lipsyncv2.json`

## Smoke tests (required before push)
1. LTX 2.3 I2V
2. LTX 2.3 T2V
3. LTX 2.2 I2V + Sound
4. LTX 2.2 Lipsync
5. Verify preview/output path parity (`ComfyUI/output/VIDEO/LTX...`)

## Notes
- LTX Hub remains enabled during stabilization.
- UI now labels LTX Hub as `Experimental` instead of blocking generation.
