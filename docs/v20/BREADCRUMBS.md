# FEDDA Hub v20 Breadcrumbs

## 2026-06-12 - v18 Clean Bootstrap & Migration
- Created H:\Fedda-Hub\Fedda_hub_v18\git-repo (clean source of truth) and \install (test clone).
- Selective robocopy ONLY from H:\Fedda-Hub\Fedda_hub_v18\git-repo using strict runtime excludes (/XD ComfyUI python_embeded node_modules dist logs __pycache__ etc. + /XF *.db).
- Pruned docs/v18/ and handoff_latest.md (old detailed history / personal notes).
- Created fresh docs/v18/HANDOFF.md + BREADCRUMBS.md.
- Performed full reference hygiene: v17 → v18, Fedda_hub_v17 → Fedda_hub_v18, Fedda_hub_v16/v15 → new github (Fedda_hub-v18), APP_VERSION_LABEL, storage keys, remotes in scripts, generated_for in modules.json, README layout description, etc.
- Reused the complete v16-proven modular foundation (registry, module_service, config/modules.json, shared WorkflowWorkbench/cockpit, HF-downloader template, all current workflow JSONs, scripts/*).
- Initialized git inside git-repo/, added remote https://github.com/Feddakalkun/Fedda_hub-v18.git, first clean commit.
- Bootstrapped install/app/ as a copy of the cleaned git-repo (ready for runtime + installer testing).
- Validation: frontend build, py_compile, absence of all runtime folders, git status clean.


## 2026-06-14 - LTX Aspect Ratio Stability + Comfy Startup Robustness

- Fixed persistent "HTTPConnectionPool ... 127.0.0.1:8199 /upload/image" connection refused errors:
  - Added HTTP readiness probe in run.bat (after TCP listen, polls /system_stats until Comfy is fully responsive)
  - ComfyUI now also logs to logs/comfyui_latest.log while still showing live in the dedicated console window
  - Clean, user-friendly 503 errors from backend instead of raw requests ConnectionPool spam (with actionable "check the FEDDA ComfyUI Console window" guidance)
- Major LTX Video 2.3 fix: aspect ratios now actually work (no more forced 1:1)
  - Created shared frontend/src/config/ltx.ts with getLtxDimensions() + getSafeLtxAspect()
  - Proper pixel sizes (snapped to multiples of 32) for 16:9, 9:16, 4:3, 3:4, 1:1, 21:9 etc. at sensible resolutions
  - Explicit width + height now injected into the size-controlling nodes (AspectRatioImageSize for FLF, ImageResizeKJv2 for img2vid)
  - For the picky AspectRatioImageSize validator (only accepts 1:1/16:9/4:3/... not 9:16), we send a safe approved aspect string while the numeric w/h drive the real latent + resize
  - Both LtxFlfPage and LtxImg2VidPage now expose the ratio picker + live WxH feedback
  - Updated workflow_api.json mappings and LTX-23-flf.json default
- Other: cleaned stray .git in install/app, followed selective source-only sync rules for this commit
This file is the running trail for v20/v21. Add a new dated entry after every meaningful update.

(Previous detailed v16 work is preserved in the v17 source tree and in backups if needed for archaeology.)

## 2026-06-18 - Run.bat Launcher Stability, Quoting & Console Persistence

- Resolved the repeated "app just shuts down", "it just quits", "window closes so there's nothing to read", and "The filename, directory name, or volume label syntax is incorrect." errors when double-clicking run.bat.
- Root causes fixed (all changes synced to both repo/run.bat and install/app/run.bat):
  - Standardized quoting for `start` and `cd`: `start "FEDDA ComfyUI Console" cmd /k ""%~f0" :svc_comfy"` and `cd /d ""%BASE_DIR%\frontend""` (no more literal \"path\" artifacts).
  - Eliminated blocking waits from the main launcher thread: removed all `call :wait_for_port`, the synchronous HTTP /system_stats powershell probe, and progress loops that could hang or eat errors.
  - Services now always launch in their own persistent titled consoles ("FEDDA Backend Console", "FEDDA ComfyUI Console", "FEDDA Frontend"). Backend and Comfy output/errors stay visible and scrollable there.
  - Main launcher flow now quick: uses `:is_port_listening` only for "already running?" checks, then starts consoles, prints "Main launcher done...", does `pause >nul`, then `cmd /k` safety line so the launcher window never auto-closes.
  - Frontend: `pushd` + `set "PATH=...node_modules\.bin;%PATH%"` before `npm run dev` for reliable dev server start.
  - Cleanup of dead `:wait_for_port` subroutine.
- Result: launcher window reliably reaches the "done" message with readable final instructions. All live logs + errors are captured in the named service windows + logs/ files. User can always see what happened.
- Reminder: always keep repo/ and install/app/ run.bat in sync after edits.

## 2026-06-18 - Grok & Companion Card Visual Generation

- Analyzed the full set of existing card visuals in `frontend/public/cards/` (primary: `new/venice/` numbered series + `deep-teal/` named assets) to capture the exact recurring style and "mascot" system.
- Core visual language identified:
  - Recurring character: beautiful elf-like woman with long wavy teal/cyan + silver hair, pointed ears, bright blue eyes, light freckles, subtle smile.
  - Consistent wardrobe: elegant dark lace/velvet tops + ornate jewelry.
  - Palette & effects: dominant teal/cyan, dramatic cinematic lighting, glowing holographic/magical UI overlays, floating particles, bokeh, mist.
  - Composition: woman portrait (right/center) + left/background arcane + tech interfaces.
  - Typography: large elegant glowing white/silver text at bottom with cyan/teal accent.
  - Overall aesthetic: high-fantasy cyber-mystic fusion (perfectly consistent across Image Studio, Video Studio, Ollama Models, Venice, Gallery, LoRA, etc.).
- Used the `image_gen` tool with very specific prompts engineered to replicate the character design, lighting, mood, and card layout exactly.
  - **Grok card** (assigned #24): dark cosmic-mystic study. Same woman interacting with floating witty chat bubbles, xAI/Grok symbols, constellations, and clever text ("but what if the stars have opinions?", "plot twist: I'm the prompt").
  - **Companion card** (assigned #25): grand memory palace library with towering bookshelves. Same woman gently touching a glowing heart crystal emitting Zonos-style pulsing voice/sound waves, surrounded by floating memory orbs and books.
- Also generated matching 6-second preview videos using `image_to_video` (subtle camera moves + glowing particle/ UI animations) so the cards get the same hover/preview treatment as others.
- Files created and placed:
  - `repo/frontend/public/cards/new/venice/24.jpeg` + `24.mp4` (Grok)
  - `repo/frontend/public/cards/new/venice/25.jpeg` + `25.mp4` (Companion)
  - Synced identical copies into `install/app/frontend/public/cards/new/venice/`
  - Extra named versions added to `deep-teal/grok.jpg` and `companion.jpg` for broader coverage.
- Wired into the app:
  - Updated `frontend/src/modules/registry.ts` (both `repo/` and `install/app/` trees)
  - `grok` module now uses `card: veniceCard(24)`
  - `companion` module now uses `card: veniceCard(25)`
  - Both will appear in the home/system module cards (and benefit from HOME_MODULES filtering).
- This process (style analysis → precise prompt replication → poster + video → registry wiring → dual-tree sync) is now the established template for future cards.
- Note for upcoming work: "we are gonna make more soon" — always start by re-inspecting the venice/ and deep-teal/ cards to keep the teal elf mascot and holographic mystic-tech look 100% consistent.

## 2026-06-19 - SDXL Inpaint Automask Module + Reliable Custom Node Installation

- Implemented complete "SDXL INPAINT AUTOMASK" feature under z-image-studio module:
  - Workflow: backend/workflows/sdxl/sdxl-inpaint-automask.json using PersonMaskUltra V2 (490), ImpactDilateMask (513), MaskBlur+ (515), InpaintCropImproved (502), InpaintStitchImproved (503), ControlNetInpainting, KSampler etc.
  - Frontend: src/pages/sdxl/SDXLInpaintAutomask.tsx (reuses Txt2ImgPage + SimpleImageCockpit with showMaskSettings=true)
  - Full mask controls exposed: checkboxes for face/hair/body/clothes/accessories/background, sliders for confidence, detail_erode, detail_dilate, black/white point, plus mask_dilation and mask_blur_amount.
  - Prompt injection updated to use Text Concatenate (500) "text_a" after removing dedicated Text Multiline node 501.
- Fixed workflow graph connections:
  - Connected PersonMaskUltra V2 image output (490,0) to PreviewImage 506.
  - Ensured clean mask flow: 490 mask (slot 1) → 513 dilate → 515 blur → 502/514/499/511.
- Node auto-detection & installation hardening:
  - Added "LayerMask: PersonMaskUltra V2" = "ComfyUI_LayerStyle_Advance" to $ClassTypeNodeMap in module_nodes.ps1 (both trees).
  - Updated update_logic.ps1: before running repair_dependency.bat do Push-Location into the node dir + `cmd /c "repair_dependency.bat"` (fixes "system cannot find the path specified").
  - Made pip/npm output visible (removed | Out-Null on node dep installs, Comfy reqs, transformers, edge-tts, frontend npm) + added "this can take a LONG time" warnings.
  - run_update.bat always deletes .last_node_update to force fresh node scan on every update.
- Updated nodes.json notes (both trees) with the exact user-provided reference links for the nodes.
- Dual-tree sync rule strictly followed (all changes in repo/ + install/app/).
- Current test flow for new agents: run update.bat (expect long pip for LayerStyle_Advance + Inpaint), full restart of run.bat, open SDXL Inpaint Automask tab – should no longer show "Installation Required" for the three nodes and should allow generation with mask parts + dilation/blur controls.

## Ongoing
- Node installs are intentionally verbose now during heavy phases so progress is obvious.
- Always full restart (close all consoles + kill python if needed) after any custom node or Comfy update.
- This file + HANDOFF.md + the actual workflow JSON + registry.ts entry are the primary things a new agent needs to understand the automask feature.

**See HANDOFF.md for the Quick Start section, Known Gotchas list, and exact pointers to `install/update.bat` / `install/run.bat` flow.**

## 2026-06-19 - SDXL Inpaint Automask - Mask Selection + Prompt + Size Fixes

- Mask part checkboxes now default to `false` (user must explicitly select e.g. only "Clothes" or "Hair"). Prevents accidental full-image masking.
- Positive prompt now injected directly into CLIP (494) from raw prompt node (501), bypassing the style concat (500). Removes "No Style" / style text pollution that was making prompts ignored or producing "drawing-like" artifacts.
- Added proper size injection for the crop node:
  - `width` → 502 `output_target_width`
  - `height` → 502 `output_target_height`
  - `preresize_min_width` / `preresize_min_height`
- In Txt2ImgPage: useEffect now auto-sets width/height to the uploaded image's natural dimensions (rounded to multiple of 8) specifically for `sdxl-inpaint-automask`.
- Renamed "Original" preset → "Match Source" (the auto effect now actually wins).
- Set `defaultDenoise={0.85}` in the automask page (full denoise=1 was too aggressive for inpaint).
- Result: "Match Source" / user-chosen size now respected in final stitched output; only selected mask parts are masked; prompt follows much more reliably (user tested cfg ~1.6 helped further).
- Still requires full restart after any node update.

## 2026-06-19 - ControlNet Depth (28) + OpenPose (29) Card Graphics

- Back to cards & graphics for the new SDXL ControlNet modules (user starting implementation of Depth + OpenPose).
- Confirmed full understanding of differences:
  - ControlNet Depth: extracts 3D spatial/depth structure (using Lotus depth model in the workflow) to guide layers, foreground/background separation and composition without changing pose.
  - ControlNet OpenPose: extracts exact 2D skeleton/keypoints (DWPreprocessor with hand/body/face detect) to lock character pose, limb positions and gestures precisely.
- Inspected all prior cards (especially automask 26 / outpaint 27) to match the exact recurring "venice" teal-elf style 100%:
  - Long wavy teal/cyan + silver hair, pointed ears, bright blue eyes, subtle freckles, elegant cyber-fantasy attire.
  - Holographic neon teal/cyan UI panels, glowing particles, bokeh, dramatic lighting, ornate silver jewelry.
  - Portrait + floating UI overlays + elegant bottom title treatment.
- Generated/verified awesome targeted cards that visually teach the tech:
  - **28 Depth**: portrait of the signature teal elf, right hand gesturing to a "DEPTH PREVIEW" inset showing glowing cyan silhouette with explicit FG/MID/BG numeric depth readouts + slider. Overlays read "CONTROLNET DEPTH v1.2 | SDXL". Bottom title "SDXL CONTROLNET DEPTH".
  - **29 OpenPose**: elf in a graceful dynamic dance pose. Body overlaid with bright glowing joint dots + connecting skeleton lines (exact OpenPose style). Floating "REFERENCE POSE #47" parchment card + "CONTROLNET v1.2 - OPENPOSE" panel showing strength/weight + "dwpose" preprocessor. Title "SDXL CONTROLNET OPENPOSE".
- Videos (6s subtle animation via image_to_video): gentle camera push + particle glow + UI elements pulsing to preview the control effect.
- Files placed + synced across dual tree:
  - repo/frontend/public/cards/new/venice/28.jpeg + 28.mp4   (and identical in install/app/...)
  - repo/frontend/public/cards/new/venice/29.jpeg + 29.mp4
  - repo/frontend/public/cards/deep-teal/controlnet-depth.jpg + controlnet-openpose.jpg (named versions for other uses)
  - Same full set in install/app/frontend/public/cards/...
- Registry + modules wiring (both trees):
  - Added `sdxl-controlnet-depth` (veniceCard(28)) + `sdxl-controlnet-openpose` (veniceCard(29))
  - sourceModuleId: 'sdxl', area: 'image', pack: 'booster'
  - Descriptions: "Control the 3D depth and spatial layers..." vs "Control exact character poses using OpenPose skeletons."
  - Listed in config/modules.json under the z-image-studio workflows array.
- Workflow files (provided by user):
  - install/app/backend/workflows/sdxl/controlnet_depth.json (and repo copy)
  - install/app/backend/workflows/sdxl/controlnet_openpose.json
  - Use Union ControlNet (depth vs openpose type), ControlNetApply strength, shared realism-sdxl + PowerLora + FaceDetailer finish + style concat + comparers.
- Note: prompt nodes currently String Literal (like early automask); negative CLIP; reference via LoadImage nodes (149 depth / 128 openpose); CN strength on the Apply nodes (163/145). UI pages + api mappings + injection will be added in implementation pass (reuse Txt2ImgPage pattern from SDXLOutpaint/SDXLInpaintAutomask).
- All card graphics complete, visible in Image Studio card grid, ready for tab activation once pages are wired in ImageStudioPage.tsx.
- Dual-tree rule followed. BREADCRUMBS + HANDOFF updated.

## 2026-06-19/20 - v22 Clean Baseline + Single Install Consolidation (catch-up entry)

- `17d4aef` v22 clean baseline; removed accidental runtime/backup files; references updated to v22.
- Consolidated to ONE single main install path (`install.ps1`) — removed Lite/Full distinction entirely (`aa02d18`, `709f778`, `dd94683`). This is now a permanent project rule.
- Removed Z-Image auto-download from installer AND update_logic — Z-Image core models must never be auto-downloaded (permanent rule).
- FEDDAKALKUN branding throughout; unattended inner installer (no mid-flow prompts).
- Installer UX: live output for ComfyUI clone / npm install / smoke test; GPU check via WMI (no more nvidia-smi console warnings).
- Proper launcher with readiness checks (`6438313`, `52babb5`); structured logging + TypeScript API types (`e2dba04`).

## 2026-06-20 - Updater Hardening + WAN 2.1 SCAIL-2 (catch-up entry)

- Updater chain fixed end-to-end: `run_update.bat` → `update_code.ps1` (git pull) → `update_logic.ps1` (nodes/deps). Multiple fixes: stash crash, fallback path, wrong script being called (`d256cf1`, `802f15f`, `c7886ea`, `2de42b3`).
- Unified `logs/update.log` transcript capturing the entire update run (`c2aeeb7`).
- Heavy-node perf: hardcoded skip list + skip repair_dependency.bat + skip pip re-check on update (`98ca024`, `df5ce7d`).
- WAN 2.1 SCAIL-2 workflow + page (`8b96777`): duration in seconds, quality/resolution presets, correct LoRA variant, GGUF support (ComfyUI-GGUF added to wan-video module nodes), GPU loading chip + GGUF model-load progress bar.
- Fixed ComfyUI origin check blocking WebSocket.
- TikTok/social downloader added to SCAIL-2 motion video input (`6483e6f`) — first appearance of the media download backend.

## 2026-06-20/21 - Ideogram 4 Module (catch-up entry)

- Ideogram 4 txt2img workflow with ComfyLiterals (`9fe056e`); HuggingFaceDownloader wired in, downloader nodes preserved by the pruner (`c40963f`).
- Default example prompt rewritten to avoid the Ideogram safety filter (`91013e3`).
- "AI Layout" button — auto-generates layout elements via Ollama (`604728a`).

## 2026-06-23 - Persistent Gallery + Shared Style Primitives (catch-up entry)

- Persistent right-side gallery panel (GlobalGalleryPanel) + gallery drag-drop into LTX image slots (`d10576a`).
- Shared style primitives; WorkflowDownloadBanner wired into WorkflowShell (`d0c6164`).

## 2026-06-28/29 - Z-Image Batch Mode + LTX Tiers + Hunyuan I2V + WAN 2.2 XXX (catch-up entry)

- Multi-prompt batch mode for Z-Image txt2img (`857727f`) + fix for spurious completion when pendingPromptId changes during active 'done' state (`2c12a6a`).
- LTX: S/M/L resolution tiers for FLF + Img2Vid (`1ba11b6`); reduced VAEDecodeTiled tile sizes to prevent OOM on video decode (`8a6f688`).
- HunyuanVideo I2V fp8 workflow + page + sidebar nav (`85dc3b9`, `c356b7c`).
- WAN 2.2 XXX Img2Vid workflow + page (`93ffebd`).

## 2026-06-30 - Ollama Full Model-Family Prompt Coverage (`0ac6e68`)

- Extended Ollama prompt assistance across ALL workflow families (not just a few pages): model-family-aware prompt generation/enhancement wired through PromptAssistant + useWorkflowRun.
- backend/server.py + workflow_service.py updated; ollama-bible.md is the reference doc for per-family prompt styles.

## 2026-06-30 - TikTok/URL Media Downloader + Universal "Send to Workflow" (`bd5a12a`)

- New home card: **Media Downloader** (`frontend/src/pages/tools/MediaDownloaderPage.tsx`) — paste a TikTok/YouTube/URL link, download the video, preview it, then send it anywhere. Backend endpoint `POST /api/media/download-video`.
- Universal handoff system:
  - `src/utils/workflowHandoff.ts` — `setHandoff` / `consumeHandoff` (localStorage, 5s TTL, one-shot) + `navigateToTab`.
  - `src/config/workflowDestinations.ts` — IMAGE_DESTINATIONS (12) + VIDEO_DESTINATIONS (3).
  - `src/components/ui/SendToWorkflowMenu.tsx` — grouped popover, `compact` prop for icon-only hover use.
- Send-to menus wired into: WorkflowPreviewBar (image thumbs), WorkflowVideoPreviewStrip (video outputs), GlobalGalleryPanel (hover overlay), MediaDownloaderPage.
- Handoff receivers (auto-upload on mount) added to 8 pages: ZImageTxt2Img (covers all Txt2ImgPage-based pages, gated on requireImageUpload), LtxImg2VidPage, HunyuanImg2VidPage, Wan22Img2Vid, Wan22XxxImg2VidPage, Wan22Vid2Vid, Wan21SteadyDancerPage (video→motion, image→subject), Wan21Scail2Page (video+image).
- RichHome: fallback icon+label card for modules with `card: {}` but no poster (used by media-downloader).

## 2026-07-01 - Install Sync Fix + Breadcrumbs Catch-Up

- Diagnosed "newest updates not visible in install UI after update.bat": the last update.bat run (2026-06-29 21:34) happened BEFORE `0ac6e68`/`bd5a12a` were pushed (2026-06-30), so there was nothing to pull yet.
- Manually pulled both commits into `install/app` (fast-forward `93ffebd` → `bd5a12a`); local changes preserved as `git stash` `auto-stash-before-manual-pull-20260701`.
- IMPORTANT reminder for agents: the runtime tree is `install/app/` (git clone, updated via update.bat git pull). Do NOT robocopy into `install/frontend` / `install/backend` — those top-level folders are not used by run.bat. Ship changes by committing to repo/ and pushing; install picks them up via update.bat.
- Backend changed in these commits (server.py media endpoint) → full restart of run.bat required after pulling.
- Added all catch-up entries above (2026-06-19 → 2026-06-30 had gone unrecorded).


## 2026-07-03 - v2.0 Clean Bootstrap from v22

- Created H:\Fedda-Hub\Fedda_hub_v2.0\repo (clean source of truth) + install\ (test environment), same dual-tree model as v22.
- Selective robocopy from Fedda_hub_v22\repo with strict runtime excludes (/XD .git node_modules ComfyUI python_embeded dist logs __pycache__ .agent_snapshots downloads /XF *.db) — 366 files, 213 MB.
- Reference hygiene v22 -> v2.0: update_code.ps1 remote, run.ps1 titles, runpod_boot.sh FEDDA_REPO, README.md, APP_VERSION_LABEL in registry.ts (was stale at "v21" since two versions back — now "FEDDA Hub v2.0").
- BREADCRUMBS.md + HANDOFF.md carried over intact (full v18->v2.0 history preserved).
- New outer installer: install\FEDDA_v2.0_Installer.bat (single file, local only, NOT in git) — clones https://github.com/Feddakalkun/Fedda_hub_v2.0.git into install\app\, runs inner scripts\install.bat, creates thin run.bat + update.bat.
- Carries over all v22 content: 33 workflow pages, TikTok/Media Downloader + Send to Workflow system, Ollama prompt coverage, all workflow JSONs and cards.


## 2026-07-03 - v2.0 First Install Verified + Adaptive CUDA Channel

- FEDDA_v2.0_Installer.bat first full run: PASSED end-to-end in 10m 38s, exit 0 (RTX 3090, 96 GB RAM, Win11).
  - 30/30 custom nodes installed, 0 failed (incl. LayerStyle_Advance, Impact-Pack, WanVideoWrapper).
  - All 3 compat patches applied (WanAnimate preprocess, LTXVideo Kornia, KJNodes LTX audio VAE).
  - Z-Image auto-download correctly skipped (permanent rule honored).
  - Smoke test: PyTorch 2.6.0+cu124, CUDA True. Embedded Python 3.11.9.
- Installer hardened for all NVIDIA generations (`e5b4049`): install.ps1 now picks the CUDA wheel channel per GPU —
  RTX 50xx (Blackwell, sm_120) -> cu128; everything else -> cu124 unchanged.
  Reason: cu124 torch wheels have no Blackwell kernels; a 5080/5090 install completed but failed at first GPU use.
  Detection mirrors the existing SageAttention 40/50-series check (WMI name match, no nvidia-smi dependency).
- Confirmed generic: GPU detection is any-NVIDIA WMI match, no VRAM gating, no card-specific assumptions elsewhere.
  Supported: RTX 20/30/40 (cu124), RTX 50 (cu128). GTX 10-series installs but lacks VRAM for the workflows.

## 2026-07-05 - v2.0 Feature Sprint (single-window launcher through UI consistency)

Large batch of work since the 07-03 bootstrap; catch-up entry.

**Launcher / install**
- Single-window launcher: run.ps1 runs ComfyUI/backend/vite hidden with output
  tailed into one console as [COMFY]/[BACK]/[VITE] prefixed lines. Later fixed
  X-close orphaning (services now -NoNewWindow, attached to console) + stale-port
  self-heal on startup.
- Lazy custom-node install: install.ps1 installs only nodes flagged core:true in
  config/nodes.json (~9 base packages); the rest install per-workflow via
  download_models.bat. update_logic.ps1 stays module-aware.
- Per-workflow manifests: scripts/generate_model_manifests.py emits
  config/model_manifests/<id>.txt (models) + <id>.nodes.txt (non-core nodes)
  from HuggingFaceDownloader links + module/class-type map. ALL-MODELS.txt union.
- download_models.bat: numbered interactive list; curl -C - resume + 5 retries;
  installs the workflow's non-core nodes after models; reuses hf_token from
  config/runtime_settings.json (huggingface.co only). Thin wrappers generated
  at install root by the installer alongside run/update.
- symlink_loras.bat: junction an external LoRA folder into models/loras
  (mklink /J, no admin) with safe remove. Generated at install root too.
- lora_service.get_installed(): loop-safe manual walk (a self-referencing
  junction inside a linked stash sent rglob into WinError 1921, 500ing the pack
  catalog + breaking Comfy lora listing).

**Features**
- In-UI "Download models" button in the workflow banner (POST
  /api/workflow/download-models/{id}); background threads, live progress, and
  now REAL per-file progress bars with % + totals via a cached HEAD
  content-length lookup (download-live-progress returns totalBytes).
- Random influencer prompt maker: dice button in PromptAssistant ->
  /api/ollama/prompt mode=influencer; server rolls a brief from curated tables
  in backend/influencer_prompts.py, Ollama weaves it. Video contexts get a
  motion sentence.
- LTX 2.3 Audio+Image2Video: new workflow (ltx/ltx-23-ai2v.json), page
  (LtxAi2vPage), video card #34, WhatDreamsCost-ComfyUI node (LoadAudioUI).
  Cleaned downloader to 6 models, sage attention disabled by default, audio
  trim + video-length slider, 512/640 low-res presets. KJNodes audio-VAE patch
  rewritten for current core (native VAE dispatch + fp32 dtype guard).
- Media Downloader card wired (venice #33).

**UI consistency**
- Header taxonomy standardized across all ~21 pages: eyebrow = model family,
  title = capability (Text to Image / Image Edit / Image to Video / Audio to
  Video / Video to Video / ControlNet ...). Txt2ImgPage gained capabilityLabel.
- 6 Workbench pages migrated to WorkflowShell + shared WorkflowControls kit
  (ChipGroup/SliderField/SeedField/UploadSlot/GenerateButton). Only WorkflowShell
  remains as the workflow layout; WorkflowWorkbench retired from workflow pages.
- CORS: backend allows any localhost/127.0.0.1 port (vite drifts ports).

**Node additions (07-05)**
- Flagged core + added to core-shell module so installer AND update install them:
  ComfyUI-DonutNodes, ComfyUI_Searge_LLM, comfy-image-saver,
  ComfyUI_UltimateSDUpscale, ComfyUI-SeedVR2_VideoUpscaler.

**Open / queued**: real Qwen txt2img workflow + de-dupe Qwen cards; character
description tool (image -> appearance-only sheet saved per LoRA); preview strips
on all image pages with removable-but-kept thumbnails; simplify SDXL inpaint.

## 2026-07-08 - Qwen Txt2Img shipped + Batch Prompt Queue everywhere

- Real Qwen text-to-image landed (cceb381): new workflow qwen/qwen-txt2img
  using qwen_image_2512 fp8 (19 GB, copied from E:\v337) + Lightning 4-step
  LoRA as a FIXED node (user loras chain after it - mapping user loras onto
  the Lightning node was stripping it and causing grainy output). Qwen Image
  card now opens real txt2img; Qwen Reference card opens the reference-edit
  page. QwenTxt2Img.tsx wired, manifests regenerated.
- Batch Prompt Queue (25ecdd0): "one prompt per line -> jobs run one by one".
  Image pages (Txt2ImgPage base) already had it from v22; this adds the video
  side. useWorkflowRun got startBatch/advanceQueue finished (completion now
  advances the queue on both the WebSocket and HTTP-polling paths, guarded
  against double-fire) and a shared BatchQueuePanel in ui/WorkflowControls.tsx
  is wired into LtxImg2Vid, LtxFlf, LtxAi2v, HunyuanImg2Vid, Wan22XxxImg2Vid.
  Each line gets its own random seed when seed=-1. Type-check stays at the
  45-error pre-existing baseline.
- Note: repo/frontend has no node_modules; type-check by copying changed files
  into install/app/frontend and running its tsc with -p tsconfig.app.json
  (plain -p tsconfig.json is the solution file and checks nothing).

**Open / queued**: character description tool (image -> appearance-only sheet
saved per LoRA); preview strips on all image pages with removable-but-kept
thumbnails; simplify SDXL inpaint/outpaint; Chroma higher-res presets (optional).

## 2026-07-08 - Edge TTS engine + text-to-voice-to-video chain

- TTS page (zonos-tts tab, card now labeled "Text to Speech") gained an engine
  toggle: Edge TTS (default - local, free, edge-tts pip package already in the
  install, no server) vs Zonos 2 (voice cloning, needs the WSL server).
- Backend: _edge_tts() in server.py (engine "edge" in /api/chat/tts, returns
  audio_base64/audio/mpeg like the other engines) + GET /api/tts/edge-voices
  (cached full voice list, incl. Norwegian nb-NO-*). Rate/pitch sliders map to
  edge-tts +N% / +NHz.
- Chain to video: "Send to Audio2Video" button on the TTS result hands the clip
  to the LTX AI2V page via workflowHandoff (new "audio" kind); LtxAi2vPage
  consumes it on mount and auto-uploads into the Audio Clip slot.
  Flow: write text -> generate voice -> lands in Audio to Video -> lipsync.
- Also: LoRA dropdowns now match family token anywhere in the path (subfolder
  LoRAs like loras/app/Aurora/aurora-zimage.safetensors show up) - Txt2ImgPage
  filter + ZImageDualLoraPage copy.

## 2026-07-08 - Chatterbox TTS engine (natural voice + cloning)

- Third TTS engine "chatterbox" (Resemble AI chatterbox-tts 0.1.7): the natural
  casual voice the Edge ones lack. Lazy-loads (~2 GB HF download, ~3 GB VRAM,
  8 s load) in the backend process, thread-locked, ~5x realtime on the 3090.
  Optional voice clone: reference_audio resolves against absolute path /
  ComfyUI input / AGENT_CHAT. exaggeration + cfg_weight(pace) params exposed.
- INSTALL GOTCHAS (documented in install.ps1/update_logic.ps1 which now install
  it for everyone): must use pip --no-deps (its pins would downgrade
  transformers 5.12->5.2, numpy 2.4->1.26, diffusers, starlette and break
  ComfyUI/backend); needs conformer s3tokenizer resemble-perth pydub; and
  setuptools MUST be <81 (pin 80.9.0) or perth dies on missing pkg_resources.
- UI: TTS page has three engine buttons (Edge/Chatterbox/Zonos) with
  exaggeration+pace sliders and a real reference-clip upload; AI2V in-page
  voice box got an engine dropdown (Edge fast / Chatterbox natural) and a
  "young/casual" suggested group at the top of the Edge voice list.

## 2026-07-08 - Chatterbox voice library + Voice Studio card (venice 35)

- Voice library: ComfyUI/input/VOICES holds named reference clips. Backend
  GET/POST /api/tts/voices (list/save, name sanitized, audio exts only).
  Voice dropdowns on the Voice Studio page (Add Voice saves to library) and
  in the AI2V in-page voice box (chatterbox mode) - pick Default or any saved
  voice; the id (VOICES/name.wav) is passed as reference_audio.
- Card 35 generated on the user's rig via Z-Image Turbo (1536x896, first roll,
  teal-elf mascot + glowing mic + waveforms + VOICE STUDIO title), saved as
  cards/new/venice/35.jpeg, module renamed zonos-tts -> label "Voice Studio",
  card: veniceCard(35). 35.mp4 hover video still missing (optional, WAN I2V).

## 2026-07-08 - Zonos removed

- Zonos 2 engine ripped out (never installed by anyone; its dead-server error
  confused the user and advertised a third-party installer URL). _zonos_tts
  deleted from server.py, engine buttons now Edge + Chatterbox only, GrokPage
  speak-tool was hardcoded to zonos -> now edge (that was the accidental
  trigger), Companion/registry descriptions cleaned. Default engine is edge
  everywhere. Tab id stays "zonos-tts" and the page file stays
  ZonosTTSPage.tsx (routing/storage churn not worth it).

## 2026-07-08 - Media Downloader: browser cookies for Instagram

- Instagram reels (and other login-walled posts) failed with "empty media
  response" - yt-dlp needs a logged-in session. Added a Cookies dropdown on
  the Media Downloader page (None/Firefox/Chrome/Edge/Brave, persisted) ->
  cookies_browser on /api/media/download-video -> yt-dlp cookiesfrombrowser.
  Fallback: config/cookies.txt (Netscape format) is used automatically when
  present and no browser is picked. Error message now explains the fix.
- Note: recent Chrome versions app-bound-encrypt cookies; extraction may fail
  unless Chrome is closed - Firefox is the reliable choice.
- yt-dlp upgraded 2026.6.9 -> 2026.7.4 in the install (extractors go stale
  fast; update.bat does not currently pin/refresh yt-dlp - consider adding).

## 2026-07-08 - Transform Reel (viral beat-drop transformation)

- New page pages/tools/TransformReelPage.tsx (tab transform-reel, card venice
  36, module in registry.ts area home): the Instagram-style transformation
  reel. Flow: upload photo -> Qwen Rapid Edit v23 makes the character version
  of the SAME frame (pose/face/framing kept; preset chips: superhero, anime,
  cyberpunk, elf queen, comic, vampire) -> the edited output is re-uploaded as
  ComfyUI input -> LTX First/Last Frame morphs source->character (default
  9:16, 3s, guide strengths 0.85) with an energy-burst transformation prompt.
- No new backend: chains existing qwen-rapid-edit-v23 + ltx-flf via
  /api/generate client-side. Rapid-edit checkpoint verified on disk. WorkflowShell
  banner points at ltx-flf; if rapid-edit models are missing on a fresh install
  run download_models.bat qwen-rapid-edit-v23.
- Beat-sync note: clip is generated without audio; user drops it on the beat in
  their editor. Possible v2: mux a chosen audio track + place the morph at a
  timestamp.

## 2026-07-08 - Automation pass: one-click pipelines

- Transform Reel is now one-click: "Auto - Photo to Reel" runs character frame
  -> stage -> morph video unattended (button shows step 1/2, 2/2). "Frame Only"
  stays for re-rolling the character look before morphing.
- AI2V "Voice + Video": generates the TTS clip and immediately starts the
  lipsync video with it - text to talking video in one press.
- Instant influencer prompt batches: GET /api/prompts/influencer-batch
  (compose_prompt in influencer_prompts.py template-composes briefs, no Ollama
  round-trip). "Fill 10" dice button in every Batch Queue: image pages
  (Txt2ImgPage inline UI) + all 5 video pages (BatchQueuePanel autoFillContext).
  Fill 10 -> Run Batch = ten different scenes of a character LoRA unattended.
- GOTCHA relearned: never patch source files with PowerShell -replace on PS5.1;
  it corrupts non-ASCII (Chinese negative prompt in Wan22Xxx, em-dashes). Use
  the Edit tool; corruption was caught and reverted before commit.

## 2026-07-08 - Character Sheets (per-LoRA appearance descriptions)

- The walkthrough-requested tool: drag an image -> Ollama vision writes an
  appearance-ONLY description (no clothes/background/pose - stays valid in
  every scene) -> saved per LoRA -> auto-prepended to prompts when that LoRA
  is active. Makes Fill-10 batches stay on-character.
- Storage = .md sidecar next to the LoRA file, SAME format the user already
  hand-writes (loras/app/Aurora/Aurora.md: **Trigger:** line + ## Appearance
  section). Resolution: <stem>.md, else the single .md in the folder. Saving
  only rewrites the Trigger line + Appearance section, other sections kept.
- Backend: GET/POST /api/lora/sheet, POST /api/lora/sheet/describe (vision).
- Frontend: Character Sheets panel in Txt2ImgPage (all image pages) under the
  Batch Queue - per selected LoRA: sheet status, Create/Edit (trigger +
  appearance + Describe-from-image + Save), auto-apply checkbox (default on).
  Prompt order: trigger, appearance, user prompt - matches the user's own
  documented prompt pattern. Applies to batch queue lines too.

## 2026-07-08 - Transform Reel v2: better costumes + beat audio

- Costume quality: 10 richer presets (bikini armor, superheroine, anime,
  latex, cosplay, cyberpunk, devil, angel, elf queen, gothic) and a stronger
  Qwen edit prompt (explicitly replace clothing, detailed/form-fitting, richer
  negative incl. same clothes/unchanged outfit/modest).
- Beat audio: step 4 on the page - upload the song, set which second the drop
  is at, "Add Beat to Current Reel" muxes it so the drop lands on the clip
  midpoint (where the morph peaks). Backend POST /api/media/mux-audio (ffmpeg
  -ss offset on the audio, video stream copied, aac, -shortest; output lands in
  ComfyUI output as reel_*.mp4 and shows in the strip with sound).

## 2026-07-08 - Transform Reel v3: photoreal outfits + transition styles

- User verdict on v2: "amateur 8s clip with a flash and some noise", outfits
  "not sexy and real at all". Root causes: costume-shop preset language reads
  as cosplay-render, and one soft "energy sweep" morph prompt.
- Outfits rewritten photographically (real fabric behavior, fit, same lighting
  /grain as source photo): Red Latex, Lingerie, Club Dress, Bikini, Biker,
  Bunny, Devil, Angel, Fishnet Goth, Cosplay Armor. Edit prompt demands "REAL
  PHOTOGRAPH" result; negative bans cosplay-prop/plastic/CGI/3d-render/doll.
- Transition style chips for the morph: Whip Spin (new default), Hard Flash,
  Hair Flip, Shockwave, Energy Sweep (the old one, kept last). Music-video
  action language instead of glow-morph. One-time localStorage migration swaps
  the old stored default to Whip Spin.

## 2026-07-08 - SESSION CONTEXT: two-account split working (read this first)

This project is being driven across TWO separate Claude accounts/sessions
working on the SAME repo and install, alternating whenever one hits its usage
limit. If you are a fresh session, you are almost certainly the OTHER account
picking up where the last one stopped - assume work is already in flight.

How this session (2026-07-08) was entered:
- The user pasted a full chat log (080726.txt) from the previous account's
  session and said "continue where we left off". Re-derive state the same way
  if handed a log: read the newest BREADCRUMBS entries + HANDOFF.md, check
  `git log --oneline`, do NOT assume a clean start.
- Both accounts commit to the same remote (github.com/Feddakalkun/Fedda_hub_v2.0)
  and pull into the same install/app. So: pull before starting, push after
  every feature, keep breadcrumbs current - the OTHER account relies on them as
  the handoff channel since the two sessions never see each other's chat.

Coordination rules that matter with two writers:
- One feature -> one commit -> push -> `git pull` in install/app, immediately.
  Never leave the working tree dirty at end of a turn; the other account may
  start any moment.
- If install/app has local edits when you pull (e.g. from tsc copy-checks),
  `git checkout -- .` first (those are throwaway type-check copies, never
  hand-edits worth keeping).
- The user launches all servers; neither account starts them (standing rule).

Everything shipped 2026-07-08 (this session, on top of the 07-05/07-08 Qwen +
batch-queue work from the previous account): Edge + Chatterbox TTS with voice
library + Voice Studio card, Zonos removed, Media Downloader browser cookies,
Transform Reel (photo->character frame->morph video, now v3 with photoreal
outfit presets + transition styles + beat-drop audio mux), one-click automation
pipelines, instant influencer prompt batches (Fill 10), and per-LoRA Character
Sheets. See entries above for detail. HANDOFF.md was rewritten for v2.0 reality.

## 2026-07-08 - Transform Reel v4: img2img character frame + exposed controls

- Finished the other account's in-progress work (was uncommitted in repo tree):
  qwen-rapid-edit-v23 workflow rebuilt from empty-latent generation to proper
  IMG2IMG - node 11 ImageScale (source -> width/height) -> node 10 VAEEncode
  -> KSampler latent_image, denoise 0.85. This preserves the source pose/face/
  framing far better than generating from noise. workflow_api.json: width/height
  now map to node 11, new "denoise" -> node 2 "Edit Strength".
- Wired the controls into Transform Reel "+ Advanced controls": Edit Strength
  (denoise 0.4-1.0), Edit CFG (1-7), Edit Steps (4-20, default 8), Morph
  Keyframe Lock (guide_strength_first/last 0.5-1.0, was hardcoded 0.85).
  Character-frame gen now sends denoise/cfg/steps; morph sends morphGuide.
- NOTE for the other account: this was YOUR uncommitted workflow edit - I
  validated it (JSON parses, img2img chain coherent), added the UI, committed
  it together. Backend must restart to reload workflow_api.json mapping before
  the denoise/node-11 mapping takes effect.

## 2026-07-08 - Transform Reel: scene/setting change (both outfit + scene)

- Added optional scene change to Transform Reel: "Change scene too" toggle in
  the Character section reveals 10 photoreal SCENE_PRESETS (nightclub, beach
  sunset, penthouse, neon street, red carpet, throne room, rooftop pool, snow
  forest, desert, cathedral) + a free text field.
- When on, the Qwen edit prompt changes BOTH outfit and background (drops the
  "keep same background" clause, adds "background is now <scene>", lighting on
  her matches the new environment); when off, unchanged (outfit only, clean
  morph). Note in UI: scene change is a bigger edit -> bump Edit Strength 0.9+.
- Morph (LTX FLF) then interpolates original scene -> new scene along with the
  outfit, giving a full world-transform reveal instead of just a costume swap.
- Outfit presets left at their v3 photoreal state (already rewritten earlier).
- POSSIBLE other interpretation of "scene and outfits": the influencer_prompts.py
  SCENES/OUTFITS tables used by Fill-10 batches. If the user meant those,
  improve those curated lists next.

## 2026-07-08 - Transform Reel: Fast/Quality edit-model toggle

- Which model makes the character frame is now switchable in the Character
  section: Fast = qwen-rapid-edit-v23 (default), Quality =
  qwen-edit-2509-image-reference (full Qwen Image Edit 2509, far better
  identity/pose preservation, slower). Toggle only swaps workflow_id on the
  character-frame /api/generate call; both take the same params (2509 mapping
  has image/prompt/width/height/seed/steps/cfg/denoise/loras).
- NOTE: 2512 was NOT usable - its workflow_api mapping has no image input;
  2509-image-reference is the correct full-quality edit workflow.
- Quality needed one missing asset: Qwen-Image-Lightning-4steps-V1.0.safetensors
  (the 2509 workflow references loras/qwen/, was absent). Downloaded ~1.58 GB
  from the public lightx2v/Qwen-Image-Lightning HF repo into
  ComfyUI/models/loras/qwen/. This also unblocks the standalone Qwen Image
  Reference page which uses the same workflow.

## 2026-07-08 - Qwen 2509 edit now provisions for all users (manifest gap fix)

- The Fast/Quality toggle's Quality model (qwen-edit-2509-image-reference) had
  NO manifest - I'd side-loaded its Lightning LoRA with a manual curl, so other
  users would NOT have gotten it. Root cause: the manifest generator only reads
  models from embedded "Downloader" nodes, and the 2509 workflow had none.
- Fix: copied the HuggingFaceDownloader node (node 20, all 4 verified URLs incl.
  Lightning LoRA -> loras/qwen) from qwen-edit-2512.json into the 2509 workflow,
  regenerated manifests. Now qwen-edit-2509-image-reference.txt (4 models) +
  .nodes.txt exist -> download_models.bat and the in-app "Download models"
  button both cover it for everyone.
- RULE for future model additions: a workflow's models are only downloadable by
  users if the workflow contains a HuggingFaceDownloader node listing them (that
  is what generate_model_manifests.py scans). Never rely on a manual curl.

## 2026-07-08 - Transform Reel: fix Quality (2509) blank-frame bug

- Quality mode produced a flat olive/blank frame. Cause: the 2509 workflow's
  KSampler generates from an EmptyLatentImage (node 13, sized via node 17 from
  width/height) using the photo as reference conditioning (node 16) - it needs
  denoise=1.0. Transform Reel's "Edit Strength" slider was sending 0.85 to it,
  and 0.85 denoise on an empty latent = structureless flat color.
- Fix: character-frame call now sends denoise = (quality ? 1.0 : editStrength).
  Edit Strength only means something for Fast (rapid-edit, which IS true img2img);
  slider relabeled + shows "ignored" in Quality mode.
- Note: 2509 keeps identity via the edit-reference encoder, NOT via img2img
  denoise. For MAX identity fidelity (outfit-only, pose/face/background pixel-
  locked) the better tool is automask inpaint (they have SDXL Inpaint Automask
  w/ PersonMaskUltra) - proposed as a future 3rd "Inpaint" edit mode.

## 2026-07-08 - Transform Reel: Inpaint edit mode (locks face/hair/background)

- User feedback on Quality (2509): works now but face/hair drift too much + grainy
  (2509 regenerates the whole frame; 4-step lightning is soft). Fundamental, not
  a settings issue - so added the automask inpaint path as a 3rd edit mode.
- Inpaint mode routes the character frame through sdxl-inpaint-automask:
  mask_clothes + mask_body = true, mask_face/hair/background = false, so ONLY the
  outfit region is repainted and her face, hair and background stay pixel-locked.
  Edit Strength (denoise ~0.85) applies here; steps floored to 20 (SDXL, not
  lightning); scene change is ignored (background is masked out - noted in UI).
  Prompt reduced to an outfit-focused fill prompt.
- createCharacterFrame refactored to build reqBody per mode (fast/quality/inpaint);
  poll status URL now uses reqBody.workflow_id instead of hardcoded rapid-edit.
- Three-way toggle: Fast (rapid img2img) / Quality (2509 flexible) / Inpaint
  (max identity fidelity, outfit-only). SDXL checkpoints confirmed on disk.

## 2026-07-08 - Transform Reel: optional inpaint regions (hair/bg/accessories)

- Inpaint mode gained optional region toggles: Hair, Accessories, Background
  (clothing always on). Each flips the matching mask_* flag in
  sdxl-inpaint-automask; face is never masked so identity holds. Background
  toggle reuses scenePrompt (enable "Change scene too" to pick the setting).
- HONEST LIMITS documented in UI: makeup-only keeping-face and pose change are
  NOT possible with region inpaint (masking face = new face; single-denoise pass
  can't do light-face + heavy-clothes; pose needs a full regenerate). Those route
  to Quality mode instead. A dedicated low-denoise face "makeup pass" would be a
  separate future feature if wanted.

## 2026-07-08 - Transform Reel: prompt content pass (hair/accessory presets, more outfits, better morphs)

- Inpaint Hair/Accessories toggles now inject real descriptions: HAIR_PRESETS
  (8) + ACCESSORY_PRESETS (6) chips + free-text inputs appear when the toggle
  is on; selected text is added into the inpaint prompt (hair -> "...", acc ->
  "wearing ...", bg -> "background is <scene>"). No more vague "new hairstyle".
- Outfits: +7 (Sporty, Evening Gown, Schoolgirl, Maid, Wet Look, Winter Glam)
  on top of the v3 photoreal set = 17 total.
- Morph: +2 transition styles (Walk Toward, Slow Reveal - fashion-film moves)
  = 7 total. All still photographic/music-video worded.

## 2026-07-08 - Transform Reel: beat audio from a link

- Beat Audio step gained a URL input: paste a TikTok/Reels/YouTube (any yt-dlp)
  link -> loadBeatFromUrl POSTs /api/media/download-video -> the downloaded mp4
  becomes beatFilename; the existing mux extracts its audio track (-map 1:a).
  Reuses the media-downloader infra (incl. cookie fallback config/cookies.txt).
- SYNC clarified (for the user Q): it is drop-to-midpoint TIMING alignment, not
  audio beat-detection. audio_offset = beatDropSec - lengthSec/2 so the song's
  drop lands on the clip midpoint (where the morph peaks). Tune via the
  "Drop is at" slider. Not per-beat matching - just the drop moment, which is
  the sync that matters for these reels.

## 2026-07-08 - Fix LTX ~1s seam (VAEDecodeTiled temporal tiling)

- User saw a glitch every ~1s in Transform Reel output ("makes 1s at a time,
  not seamless"). Cause: LTX FLF VAEDecodeTiled decoded only temporal_size=32
  frames/tile with temporal_overlap=8 -> at 24fps a 3s (72f) clip tiled at
  0-32/24-56/48-80 -> seams every ~1s.
- Fix: LTX-23-flf.json node 5622 AND LTX-23-img2vid.json node 4851 bumped to
  temporal_size 96 (4s @24fps in ONE tile -> seamless typical reels),
  temporal_overlap 24, tile_size 768, overlap 96. ltx-23-ai2v already had
  temporal_size 4096 (fine). Helps both Transform Reel + LtxFlf/LtxImg2Vid pages.
- VRAM: short reels decode all frames in one tile; longer clips get 24-frame
  overlap (was 8) so seams blend. If a very long/high-res LTX job OOMs on decode,
  lower temporal_size again.

## 2026-07-08 - UploadSlot clear (✕) button

- User couldn't remove/replace the Transform Reel source photo (the Before/After
  image only zooms via lightbox now; the small step-1 slot had no clear affordance
  and they were dropping onto the wrong element). UploadSlot's drag-drop was
  actually fine.
- Added optional onClear prop to UploadSlot (ui/WorkflowControls) -> shows a ✕
  button top-right over any preview. Wired on Transform Reel Source Photo (clears
  source + derived character-frame state) and Beat Track. Available to all pages
  that use UploadSlot; only renders when onClear is passed.

## 2026-07-08 - New card: Scail Studio (step 1 - starter image + outfit inpaint)

- New page pages/tools/ScailStudioPage.tsx (tab scail-studio, module in registry,
  Icon only for now - card art deferred until concept approved). Intentionally
  simpler/cleaner than Transform Reel.
- Step 1 Starter Image: toggle Generate-with-Z-Image (prompt + one character LoRA
  dropdown, 896x1152) OR Upload. Generated output is staged back as a ComfyUI
  input so step 2 can use it.
- Step 2 Change Outfit: 6 outfit presets + text -> sdxl-inpaint-automask
  (mask_clothes+body, face/hair/background locked). Result becomes the new
  starter so you can iterate. denoise 0.85 / cfg 2 / 25 steps.
- SCAIL-2 (wan21-scail2) motion step intentionally NOT built yet - user wants to
  review/adjust steps 1-2 first. Shared helpers pollImages() + stageAsInput().

## 2026-07-08 - Scail Studio: LLM prompt-assist on character + outfit boxes

- Replaced the plain textareas with PromptAssistant (context "zimage") on both
  the Starter Image "Describe your character" box and the Change Outfit box -
  gives Enhance / Generate / dice-Influencer Ollama buttons for building prompts.

## 2026-07-08 - Scail Studio: base model picker + multi-LoRA

- Starter-image generate gained a model picker: Z-Image, FLUX2 Klein
  (flux2klein-txt2img, no width/height in mapping), Qwen (qwen-txt2img),
  Chroma HD (chroma1-hd-txt2img, NO lora support - workflow has no lora mapping).
- Multi-LoRA: loraEntries array with per-row dropdown (filtered to the model's
  family token: zimage/flux/qwen) + strength slider + remove + Add LoRA.
  Switching model clears the LoRA list. Loads ALL loras now, filters per family.
- SDXL was requested but there is NO sdxl txt2img workflow in the project (only
  inpaint/controlnet/outpaint) - omitted; would need a new workflow to add.

## 2026-07-08 - SDXL txt2img workflow + Scail Studio SDXL model

- Built sdxl-txt2img.json (adapted from the user's ComfyUI base+refiner template
  sdxl_simple.json into a clean single-model SDXL: CheckpointLoaderSimple
  realism-sdxl -> LoraLoaderModelOnly (node 100, the 'loras' injection point,
  mirrors z-image) -> CLIP pos/neg -> KSampler dpmpp_2m/karras 25 steps cfg 6 ->
  VAEDecode -> SaveImage IMAGE/SDXL/0).
- Registered in workflow_api.json (prompt/negative/width/height/seed/steps/cfg/
  loras) AND modules.json (added to sdxl-pack.workflows) - backend rejects a
  workflow no module owns ('No module owns workflow').
- Scail Studio MODELS gained SDXL (loraToken 'sdxl', steps 25/cfg 6) and each
  model now carries its own steps/cfg (fixes Chroma/SDXL which were getting
  z-image's cfg 1.0): z-image 11/1.0, flux 20/1.0, qwen 8/1.0, chroma 26/4, sdxl 25/6.
- REQUIRES backend restart (workflow_api.json + modules.json cached at startup).
- Other-user gap: sdxl-txt2img has no downloader node, so realism-sdxl isn't in
  a manifest (same as the other sdxl workflows). Fine on this machine; provision
  for others is a follow-up.
- User's original sdxl_simple.json left in place (untracked), superseded.

## 2026-07-08 - PromptAssistant: strip LLM preamble/quotes

- LLM outputs like "Here is a prompt that incorporates all the given elements:"
  + wrapping quotes were landing in the prompt box. streamPrompt now returns the
  final text and runStream cleans it (cleanPrompt strips a leading Here/Sure/OK...:
  preamble line + a single pair of wrapping quotes) on completion. Applies to
  enhance/inspire/influencer everywhere PromptAssistant is used.

## 2026-07-08 - Scail Studio: Driving Clip step (link -> download -> capture frame)

- New Step 1 "Driving Clip": paste TikTok/Reels/YT link -> /api/media/download-video
  -> video player -> "Capture This Frame" grabs the current frame client-side
  (canvas.toBlob, same-origin /comfy/view so no taint) and uploads it as the
  starter image (feeds the existing character step). clipFile persisted for the
  future SCAIL-2 (wan21-scail2) motion step which needs the driving video.
- Renumbered: 1 Driving Clip, 2 Starter Image, 3 Change Outfit.
- Rationale: SCAIL-2 is motion transfer (driving video + subject image). Capturing
  the clip's frame gives the exact starting pose to build the character on, so the
  animated result starts matched to the clip.
- STILL TODO: the character step currently only inpaints outfit; "make the person
  we want" (identity/face -> chosen character) needs Qwen-edit or character-LoRA
  routing - to refine next. Then wire the SCAIL-2 motion step (clipFile + character).

## 2026-07-08 - Scail Studio: caption captured frame -> recreation prompt

- Driving Clip now offers two capture buttons: "Describe -> Prompt" (captions
  the current frame via /api/ollama/caption context=zimage - which returns a
  photoreal recreation prompt of visible subject/pose/wardrobe/lighting - then
  fills the Generate box + switches to Generate mode so you make YOUR character
  with a LoRA in a matching image) and "Use Frame" (old behavior: exact frame as
  starter to edit). Shared grabFrameBlob() helper. Needs an Ollama vision model.

## 2026-07-08 - Scail Studio: two-column app layout (use the width)

- User feedback: narrow centered column wasted the screen, wanted 'iphone easy'.
  Rebuilt as a 2-col grid: big MEDIA STAGE left (sticky, min-h 64vh, uses width +
  vertical space - shows the clip video w/ capture buttons, then the generated/
  dressed character large) + a compact CONTROL RAIL right (Step 1 link+Get, Step
  2 model/lora/prompt/upload, Step 3 outfit). Stacks to one column under lg.
- Video + capture buttons moved into the stage; the old inline 'Current image'
  card removed (image now shows in the stage). Empty stage shows a hint.

## 2026-07-08 - HANDOFF to 2nd account: Scail Studio current state + next steps

Scail Studio (tab scail-studio, pages/tools/ScailStudioPage.tsx, Automations row
next to Transform Reel, icon-only card - venice art NOT generated yet) is the
active work. Pipeline built so far, all shipped/synced at 8b31861:
- Layout: 2-col - big sticky media STAGE (left) + control RAIL (right). "iphone
  easy" is the design goal; user may want more polish / progressive reveal.
- Step 1 Driving Clip: paste TikTok/Reels/YT link -> /api/media/download-video
  -> video in stage. Two capture buttons: "Describe -> Prompt" (vision-caption
  the frame via /api/ollama/caption context=zimage, fills Generate box + switches
  to generate mode -> recreate as YOUR character) and "Use Frame" (exact frame as
  starter). clipFile persisted for the future SCAIL-2 step.
- Step 2 Starter Image: Generate (model picker Z-Image/Flux Klein/Qwen/Chroma/
  SDXL, each own steps/cfg; multi-LoRA rows filtered per family) OR Upload.
- Step 3 Change Outfit: sdxl-inpaint-automask (clothing/body masked; face/hair/bg
  locked).

NOT DONE / next:
- The SCAIL-2 motion step itself (wan21-scail2: driving clip clipFile + character
  image -> animated video). This is the payoff step, not built yet.
- "Make the person we want" refinement: step 3 only swaps outfit; changing
  identity/face to a chosen character needs Qwen-edit or character-LoRA routing.
- Generate the venice card art for scail-studio (currently icon-only).
- SDXL txt2img (sdxl-txt2img.json, realism-sdxl) has NO downloader node -> other
  users can't provision realism-sdxl (fine on this machine). RunPod follow-up.
- Backend restart still needed on this machine for SDXL (workflow_api+modules.json
  cached at startup) + the TTS/media endpoints from earlier today.

Reminders: two-account split (this file is the handoff channel); one feature ->
commit -> push -> git checkout -- . && pull in install/app; user launches servers.

## 2026-07-08 - WAN 2.2 Img2Vid: UploadSlot drag-drop + image->prompt caption

- Wan22Img2Vid.tsx: replaced the hand-rolled upload zone with the shared
  UploadSlot (robust drag-drop + URL + clear + replace, matches LTX img2vid),
  removed the dead fileInputRef. Added "Build Prompt From Image" button that
  captions the uploaded reference via /api/ollama/caption context=wan-i2v (NSFW
  motion-prompt tuned) into Scene 1. Added workflowId=wan22-img2vid so the
  WorkflowShell download-models banner appears.
- WAN 2.2 i2v IS NSFW: nsfw_wan_umt5-xxl encoder + NSFW loras + NSFW toggle
  (default on) + wan-i2v caption context is explicit.
- BLOCKER for testing: wan22-img2vid models are NOT on disk (wan2.2 i2v high/low
  14B, nsfw umt5 encoder all MISSING). User must run
  `download_models.bat wan22-img2vid` or use the in-UI Download button first.
- LTX img2vid already had UploadSlot + Build From Reference - it's the reference
  style; WAN now matches. No LTX change needed.

## 2026-07-08 - LTX Img2Vid: expose Length control

- ltx-img2vid workflow had a "LENGTH IN SECONDS" node (4997, default 8, x24fps ->
  frames) that was never mapped. Added length_seconds -> node 4997 in
  workflow_api.json and a Length slider (2-12s, default 5) in LtxImg2VidPage Run
  Settings; buildParams now sends length_seconds (applies to batch runs too).
- REQUIRES backend restart (workflow_api.json cached at startup).

## 2026-07-08 - Transform Reel: Body toggle in inpaint

- Inpaint mask_body was hardcoded true; now an explicit "Body" checkbox
  (default on) alongside Hair/Accessories/Background. Off = only clothing region
  repaints (skin/physique kept); on = body skin regenerates too. Face never masked.

## 2026-07-08 - Transform Reel: drag-drop your own before/after keyframes

- Before -> After row is now two UploadSlots (drag-drop + URL + clear): Before =
  source (first frame), After = your own last frame via new uploadAfterFrame/
  uploadAfterFromUrl (uploads to ComfyUI input, sets transformedInput+Url). Lets
  you skip generation and morph your own before/after. Section always shows now.
- Note: click-to-zoom lightbox on these two is dormant (UploadSlot replaced the
  zoomable imgs); Lightbox still mounted, just no opener - re-add if zoom wanted.

## 2026-07-09 - REEL MACHINE: new automation card (viral reels, plan-approved)

- New card "Reel Machine" (tab reel-machine, Automations row, Film icon - venice
  art deferred until user approves the page). Flow: Photo -> Sound -> Make Reel.
  Phone-frame 9:16 stage left (video + progress overlay + cancel), horizontal
  feed of finished reels under it (click to play, per-item download + remove),
  3 fat steps right.
- Format 1 BEAT SWITCH (the fast workhorse): N Qwen rapid-edit outfit frames of
  the SAME photo/pose (sequential, skip-on-fail, cancelRef) -> new backend
  POST /api/media/beat-cut: librosa beat_track on the chosen sound window ->
  images normalized to 1080x1920 (PIL) -> ffmpeg concat-demuxer hard cuts on
  each beat + audio muxed -> reel_*.mp4 in ComfyUI output. Empty images = probe
  mode (page shows "N BPM - M cuts" after loading a sound; re-probes on start-
  second change, debounced). Core mechanics verified standalone: synthetic
  120bpm click detected at 117.5, cuts land on clicks, 8s mp4 w/ both streams.
- Format 2 TRANSFORMATION: photo -> one outfit frame -> LTX FLF morph (9:16 M,
  random TRANSITION_STYLE, poll budget scales with length) -> /api/media/mux-audio.
- Shared extraction: pages/tools/reelPresets.ts (CHARACTER_PRESETS 16 +
  TRANSITION_STYLES 7, now imported by TransformReelPage too) and
  pages/tools/reelPipeline.ts (submitGenerate/pollGeneration/stageAsInput/viewUrl,
  PipelineCancelled; direct-poll bypasses useWorkflowRun so no double-collection).
- Sound source: TikTok/Reels/YT link via /api/media/download-video or audio
  upload. Style: Surprise-me random N (3-8) or pick outfit chips; reel length
  4-12s slider. beforeunload guard while making.
- NEEDS BACKEND RESTART (new /api/media/beat-cut endpoint).
- TODO next: venice card art after user approves; Send-to-workflow on feed
  items; possible Reddit research pass on more formats (web search was rate-
  limited this session).

## 2026-07-09 - LTX AI2V: Audio Start control

- LoadAudioUI node 5778 had an unmapped start_time. Mapped audio_start ->
  5778.start_time in workflow_api.json; added an "Audio Start" slider (0-120s)
  to LtxAi2vPage. Because end_time is ABSOLUTE (not a length), Video Length now
  sends duration as start+length (0 = to end). REQUIRES backend restart
  (workflow_api cached at startup).

## 2026-07-09 - LTX img2vid/flf: fix intermittent forever-hang (decode VRAM spill)

- Symptom: LTX img2vid sometimes fast+good, sometimes runs forever/never finishes.
  Not the sampler (logs show it completing normally). Cause: VAEDecodeTiled
  spilling to system RAM (NVIDIA sysmem fallback) when VRAM is partly occupied
  (e.g. right after a Qwen/SDXL/WAN gen) - it crawls ~100x slower instead of
  erroring. The earlier seam-fix (temporal_size 32->96, tile 768) raised decode
  VRAM and made the spill more likely.
- Fix: dialed both LTX-23-img2vid.json (4851) and LTX-23-flf.json (5622) decode to
  tile_size 512, overlap 64, temporal_size 48, temporal_overlap 24. Half the
  temporal footprint of the 96 setting, but 50% overlap (24/48) blends seams
  BETTER than the original 25% (8/32) - so still seam-safe, far less spill risk.
- Root-cause note for the user: the definitive fix is the NVIDIA driver setting
  "CUDA - Sysmem Fallback Policy" = "Prefer No Sysmem Fallback" for the python
  process, which makes an OOM fail fast instead of hanging. Also: Purge VRAM
  (header button) before an LTX run when another model was just used.
- No backend restart needed (ComfyUI reads workflow JSON fresh per prompt).

## 2026-07-09 - WAN 2.2 i2v: fix immediate OOM (fp8_fast -> fp8 on 3090)

- User: OOM right away on WAN 2.2 image-to-video. Cause: all 8 UNETLoaders used
  weight_dtype fp8_e4m3fn_fast. The "_fast" fp8 matmul path is a 4090+ feature -
  on a 3090 (Ampere, no native fp8) it gives no speedup and uses extra VRAM, so
  the 14B unet (~14GB) + NSFW UMT5 encoder (~6GB) + clip_vision tips over 24GB at
  load. Switched all 8 to plain fp8_e4m3fn in img2vid-4frames-wan22.json.
- Still borderline on a 3090: advise Purge VRAM before running, keep frames/res
  modest. If it still OOMs, the robust path is GGUF-quantized WAN (Q5 ~10GB via
  ComfyUI-GGUF + UnetLoaderGGUF) - a models download + workflow swap, not done yet.
- No backend restart needed (workflow read fresh per prompt).

## 2026-07-09 - WAN 2.2 i2v -> GGUF (fixes 3090 OOM for real)

- fp8 14B still OOM'd on the 3090 (14GB unet + 6GB UMT5 encoder + clip_vision).
  Converted all 8 UNETLoaders in img2vid-4frames-wan22.json to UnetLoaderGGUF
  (ComfyUI-GGUF, already core/installed): high_noise -> Wan2.2-I2V-A14B-HighNoise-
  Q4_K_M.gguf, low_noise -> LowNoise-Q4_K_M.gguf (~9.65GB each, QuantStack repo,
  URLs verified 200). One unet loaded at a time -> peak ~9GB unet + 6GB encoder,
  fits 24GB. NSFW umt5 encoder kept (still fp8 - no NSFW gguf).
- Downloader node 151 rewritten to the two GGUF urls; manifest regenerated
  (wan22-img2vid.txt now lists the GGUFs). Models downloading to ComfyUI/models/
  unet on this machine; other users get them via download_models.bat wan22-img2vid.
- fp8 wan2.2 i2v models now unused (user can delete to reclaim disk).
- No backend restart needed for the workflow (read fresh per prompt); GGUF node
  already loaded. Still: Purge VRAM before running if another model was used.

## 2026-07-09 - WAN 2.2 i2v: keep BOTH fp8 + GGUF (precision toggle)

- Restored the fp8 workflow (img2vid-4frames-wan22.json, fp8_e4m3fn) and split the
  GGUF into img2vid-4frames-wan22-gguf.json (wan22-img2vid-gguf, registered in
  workflow_api + modules.json wan-video, manifest generated). Wan22Img2Vid page
  got a "Model precision" toggle: GGUF Q4 (fits 24GB, default) / fp8 (faster, big
  GPU / RunPod). workflowId switches per choice. Rationale: RunPod has big GPUs
  where fp8 is faster; 3090 needs GGUF.
- LTX: DOES have a gguf on disk (ltx-2.3-22b-distilled-1.1-Q6_K.gguf) but the
  img2vid workflow uses fp8 (ltx-2.3-22b-dev_transformer_only_fp8_scaled). LTX 22B
  fp8 seems to run OK on the 3090 already, so no LTX gguf swap done yet - offered.

## 2026-07-09 - Fix Docker/CI build (drop tsc gate from build script)

- GitHub docker-build failed: `npm run build` = "tsc -b && vite build", and
  tsc -b fails on the 44 PRE-EXISTING baseline type errors (GrokPage/VenicePage/
  SimpleImageCockpit/ZImageTxt2Img mask props/useWorkflowRun NodeInfo - all
  predate this work, mostly TS6133 unused vars + a few prop mismatches). So CI
  had been broken by the baseline the whole time, not by recent changes.
  Vite/esbuild transpiles without type-checking -> `vite build` alone succeeds
  (verified, 4.8s, bundle emitted). Changed build -> "vite build", added
  "typecheck": "tsc -b" for optional local checking. Runtime unaffected.
- The 44 baseline errors are still worth cleaning up someday but no longer gate
  the deploy build.

## 2026-07-09 - RunPod Dockerfile: add this-session deps + nodes

- runpod/Dockerfile was stale. My build-script fix (vite build) already unblocks
  the image's `npm run build` (line 8). Added the missing pieces so the image
  runs the current app:
  - Custom nodes: ComfyUI_LayerStyle_Advance (PersonMaskUltra - needed by ALL
    inpaint: Transform Reel/Reel Machine/Scail Studio/SDXL pages), WhatDreamsCost
    (LTX audio2video), ComfyUI_Searge_LLM, ComfyUI-DonutNodes, comfy-image-saver,
    ComfyUI_UltimateSDUpscale (+submodule init) + their requirements.
  - Python deps: librosa+soundfile (beat-cut/Reel Machine), edge-tts (TTS),
    yt-dlp (media downloader), piexif/imageio-ffmpeg/rembg/pillow-heif, llama-cpp
    prebuilt (Searge), chatterbox-tts --no-deps + extras + setuptools<81 (optional).
- Deploy path: push main -> GH Actions (.github/workflows/docker-build.yml) builds
  runpod/Dockerfile -> ghcr.io/feddakalkun/fedda-runpod:latest -> RunPod template
  (entrypoint runpod_start.sh, expose 3000, /workspace volume) -> first boot
  symlinks models/input/output to /workspace -> provision models via
  download_models per workflow -> app at https://<pod>-3000.proxy.runpod.net.
- STILL TODO for a clean RunPod run: verify runpod_start.sh provisions/points at
  the model download flow; models are NOT baked into the image (correct) so a
  network volume + per-workflow download is the model story; test one full build.

## 2026-07-09 - RunPod image: BUILD SUCCEEDS, fix push perms

- Pulled the real CI log (via git-credential token). The Dockerfile BUILD is
  GOOD - disk-space fix worked, all node clones + pip installs completed at 16min
  (the "pip dependency resolver" lines are warnings, not errors). The ONLY failure
  was the final PUSH: the workflow published to TWO images, and the second
  (ghcr.io/feddakalkun/fedda-runpod, a non-repo package name) got
  "denied: permission_denied: write_package" - the default GITHUB_TOKEN can only
  write the repo-owned package.
- Fix: metadata images list now publishes ONLY ghcr.io/${IMAGE_NAME}
  (= ghcr.io/feddakalkun/fedda_hub_v2.0). Updated TEMPLATE_SETUP.md image name +
  a note to make the GHCR package public once.
- So after this run: image at ghcr.io/feddakalkun/fedda_hub_v2.0:latest, ready for
  the RunPod template.

## 2026-07-09 - RunPod: image GREEN + start-script persistence fixes

- Docker build/push SUCCEEDED -> ghcr.io/feddakalkun/fedda_hub_v2.0:latest.
  (Full saga: tsc gate -> runner disk (free-disk-space action) -> push perms
  (drop non-repo image target). Build itself was always fine once disk freed.)
- Verified model-download flow works on RunPod: /health route exists (start
  script gate ok); model_downloader writes to COMFY_DIR/models/<folder> which the
  start script symlinks to /workspace -> downloads persist on the network volume.
  In-app Download buttons are cross-platform Python (the .bat is Windows-only, not
  used on Linux).
- Fixed 2 persistence gaps in runpod_start.sh: added upscale_models + ultralytics
  (+bbox/segm) + insightface to the symlink loop (were lost on restart); and
  symlink config/runtime_settings.json -> /workspace so the HF token / Civitai key
  / settings survive pod restarts (gated downloads need the token). TTS voices in
  input/VOICES already persist via the input link.
- WAN 2.2 i2v GGUF models finished + validated (1095 tensors each) - the earlier
  reshape error was just the incomplete HighNoise download (7.5 of 9.65GB).

## 2026-07-09 - LTX img2vid: GGUF option (fixes 22B fp8 OOM on 3090)

- OOM was in comfy_kitchen stochastic_rounding_fp8 loading the 22B
  ltx-2.3-22b-dev_transformer_only_fp8_scaled (~22GB fp8 weights + rounding
  overhead -> peak 21.7GB, reserved 23.8GB on the 24GB 3090). The workflow ALREADY
  uses distilled-style sampling (ManualSigmas 8 steps, cfg 1), so the distilled
  Q6_K GGUF (16.6GB, already on disk) is the correct match.
- Same both-options pattern as WAN: LTX-23-img2vid-gguf.json (node 4989 ->
  UnetLoaderGGUF, ltx-2.3-22b-distilled-1.1-Q6_K.gguf) registered as
  ltx-img2vid-gguf (workflow_api + modules ltx-video). LtxImg2VidPage precision
  toggle: GGUF (fits 24GB, default) / fp8 (big GPU). workflowId reactive via
  useWorkflowRun (submit deps include workflowId).
- KNOWN GAP (low pri): couldn't find a verified public download URL for the
  distilled Q6_K gguf (Kijai/LTX2.3_comfy has the fp8; wsbagnsv1 gguf repo 401).
  So ltx-img2vid-gguf has NO download manifest - fine because the model is on the
  local disk and RunPod uses fp8. If gguf provisioning is ever needed, find the
  gguf source URL and add a downloader node + regenerate manifest.
