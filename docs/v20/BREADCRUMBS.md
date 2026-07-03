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
