# FEDDA Hub v20 Handoff

## Quick Start for a New Agent

1. Go to the `install/` directory — this is your runnable/test environment.
2. Run `update.bat` (this is the official update entrypoint).
3. When it finishes, run `run.bat` to launch the full stack (it starts ComfyUI, backend, and frontend in separate titled console windows).
4. In the UI, go to **Image Studio → SDXL Inpaint Automask**.
5. Upload an image, pick mask parts, adjust the sliders, and generate.

See "How to Test as a New Agent" below for the specific SDXL workflow checklist.

## Migration Note (2026-06-12)
- Clean v18 workspace created at H:\Fedda-Hub\Fedda_hub_v18\
- git-repo/ = minimal source-of-truth (this repo)
- install/  = test installation clone (bootstrapped from git-repo + runtime added locally)
- Source was selectively copied **only** from H:\Fedda-Hub\Fedda_hub_v18\git-repo (no writes to v17 ever occurred).
- All v17 / v16 path references, version labels, and old GitHub URLs updated to v18 + https://github.com/Feddakalkun/Fedda_hub-v18.git
- docs/v20/ and handoff_latest.md (detailed history) deliberately excluded per "extremely clean and minimal at the start" rule.
- First commit will be the clean modular foundation.

## Latest Update - Workflow Standard Baseline (carried from v16)
- New workflows follow docs/v20/WORKFLOW_STANDARD.md (copy/adapt the proven template).
- Use backend/workflows/HF-downloader/HFdownloadernode.json as the reusable downloader template.
- Preserve working core even when booster modules are disabled.
- Do not move runtime folders into git (ComfyUI, embedded Python, Ollama, models, outputs, cache, logs, venvs, node_modules stay local/runtime only).
- Keep breadcrumbs updated in docs/v20/BREADCRUMBS.md.

## Current Goal
Turn FEDDA Hub into a maintainable modular core + booster-pack architecture (already achieved in v16 foundation) while keeping a pristine, minimal git history and strict separation between the git development tree and test install trees.

## Current State (post v18 bootstrap)
- git-repo at H:\Fedda-Hub\Fedda_hub_v18\git-repo (this)
- install test clone at H:\Fedda-Hub\Fedda_hub_v18\install\app
- Frontend module registry: frontend/src/modules/registry.ts
- Backend module manifest + loader: config/modules.json + backend/module_service.py
- Shared workflow pages + cockpit UI present
- All essential workflow JSONs under backend/workflows/
- Installer / update logic in scripts/ (module-aware via module_nodes.ps1)
- Fresh docs/v20/ only

## Important Constraints
- Preserve a working core build even when booster modules are disabled.
- Runtime folders NEVER in git-repo.
- git-repo and install/app stay easy to keep in sync (copy from git-repo â†’ install/app after each dev change).
- Update this handoff after every meaningful step.

## Next Recommended Steps
1. Verify npm run build + python compiles + git status in git-repo.
2. Bootstrap a full test run in install/ (copy runtime or execute install scripts).
3. Confirm key workflows still work from the FEDDA UI.
4. Append to BREADCRUMBS.md.
5. Push first commit.

## Latest Update (2026-06-19)
- SDXL Inpaint Automask fully implemented + battle-tested node installation:
  - New module `sdxl-inpaint-automask` in modules.json (under z-image-studio).
  - Workflow + UI with complete PersonMaskUltra V2 controls (parts selection + advanced sliders) + post-mask dilation/blur.
  - Workflow JSON fixes for image + mask wiring.
  - ClassTypeNodeMap extended for "LayerMask: PersonMaskUltra V2".
- ControlNet Depth + OpenPose graphics complete:
  - veniceCard(28) and (29) created in matching holographic teal-elf style.
  - Cards highlight Depth (layered spatial preview) vs OpenPose (skeleton/keypoints lock).
  - registry + modules.json updated (both trees).
  - Workflows at backend/workflows/sdxl/controlnet_*.json (user will wire pages + prompt/strength injection next).
  - See BREADCRUMBS for full graphics + ControlNet difference notes.
  - update_logic.ps1 hardened (proper dir context + cmd invocation for repair bats) + pip output now visible so agents see progress instead of "stalled".
- BREADCRUMBS.md and HANDOFF updated in both repo/docs/v20 and install/app/docs/v20 with full details.
- Dual-tree sync (repo ↔ install/app) remains mandatory after any change.
- Always do full restart after node or Comfy updates.

## Current State (for new agents)
- Runtime lives in `Fedda_hub_v21/install/app/`
- Source of truth / dev work in `Fedda_hub_v21/repo/`
- To update: run `install/update.bat` (it deletes the node marker to force re-scan)
- Key entry points for the new feature:
  - Workflow: `backend/workflows/sdxl/sdxl-inpaint-automask.json`
  - UI: `frontend/src/pages/sdxl/SDXLInpaintAutomask.tsx`
  - Module registration: `frontend/src/modules/registry.ts`
  - Node mapping: `scripts/module_nodes.ps1` (ClassTypeNodeMap)
- The three nodes that used to trigger "Installation Required":
  - LayerMask: PersonMaskUltra V2 → ComfyUI_LayerStyle_Advance
  - InpaintCropImproved / InpaintStitchImproved → ComfyUI-Inpaint-CropAndStitch
- Expect long pip phases on first node installs — output is now shown.
- After update finishes → close everything → restart with main run.bat.

## Known Gotchas

- **Node installation is slow and visible now**: LayerStyle_Advance and similar nodes have heavy dependencies (mediapipe, onnxruntime, transformers, etc.). The update script now shows pip output so you can see progress instead of thinking it stalled. Expect 5–15+ minutes on first run or slow hardware.
- **Full restart required after nodes**: Custom nodes are only loaded when ComfyUI starts. After running update.bat you **must** close all console windows completely (use taskkill if needed) and run run.bat fresh.
- **Dual-tree sync is mandatory**: Development happens in `repo/`. The live app runs from `install/app/`. After any edit, sync the changed files (especially scripts, config/, frontend/src/, backend/workflows/sdxl/, docs/v20/).
- **update.bat vs run.bat**:
  - `install/update.bat` → cds to `app/` and calls `scripts/run_update.bat` → `update_logic.ps1` (code + nodes).
  - `install/run.bat` (or the one in app/) is the main launcher. It spawns separate titled consoles for ComfyUI, backend, and frontend.
- Repair scripts inside nodes (e.g. `repair_dependency.bat`) are now called with correct working directory by the update logic.
- Old v18/v16 references still exist in historical parts of BREADCRUMBS — ignore them for current work.
- The SDXL Inpaint Automask workflow is the current "canary" for node installation testing.

## How to Test as a New Agent
1. From the `install` folder run `update.bat`.
2. Wait for node section (watch for LayerStyle_Advance and Inpaint messages).
3. Full stop + restart the app.
4. Go to Image Studio → SDXL Inpaint Automask tab.
5. Upload image, choose mask parts, adjust sliders, generate.
6. Verify no "custom nodes you haven't installed" banner and that the mask is respected in output.

## Ongoing Rules
- Keep repo/ and install/app/ in sync (copy after edits).
- Never commit runtime folders (ComfyUI, python_embeded, node_modules, logs, etc.).
- Update this HANDOFF + BREADCRUMBS after every meaningful change.
- Use the visible-pip version of update when testing so progress is obvious.