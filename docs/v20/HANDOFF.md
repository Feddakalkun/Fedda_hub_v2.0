# FEDDA Hub v2.0 Handoff

Quick-start and gotchas for a new agent/session. The running trail of every change
is in BREADCRUMBS.md (same folder) — read the newest entries there for recent work.

## The two trees (this is the most important thing)

- `H:\Fedda-Hub\Fedda_hub_v2.0\repo\` — source of truth, git remote
  https://github.com/Feddakalkun/Fedda_hub_v2.0 (underscore, unlike v22's hyphen).
- `H:\Fedda-Hub\Fedda_hub_v2.0\install\app\` — the runnable app. It is a **git
  clone of the same repo**, NOT a robocopy target. Sync = commit in repo → push →
  `git pull` in install\app. Never copy files into `install\frontend` or
  `install\backend` — those top-level folders don't exist and nothing reads them.
- The install root also holds thin local-only wrappers (never committed):
  `run.bat`, `update.bat`, `download_models.bat`, `symlink_loras.bat`, and the
  outer `FEDDA_v2.0_Installer.bat`.

## Standing rules

- **Never start the user's servers** (run.bat, ComfyUI, backends, verification
  Vite instances). The user launches; you observe. Ask them to start/restart.
- **Never auto-download models** — provisioning is user-initiated
  (download_models.bat or the in-app Download models button). The Z-Image celeb
  pack skip rule is part of this.
- Runtime folders (ComfyUI, python_embeded, node_modules, models, logs, outputs)
  never go into git.
- Append a dated entry to BREADCRUMBS.md with every meaningful change, commit it
  together with the change, push, pull into install.
- Restart run.bat after backend changes; browser refresh is enough for
  frontend-only changes (Vite hot-reloads).

## How to verify changes

- **Backend**: `install\app\python_embeded\python.exe -m py_compile repo\backend\server.py`
- **Frontend type-check**: repo\frontend has no node_modules. Copy changed files
  into install\app\frontend\src, then from install\app\frontend run
  `node node_modules\typescript\bin\tsc --noEmit -p tsconfig.app.json`
  (plain `-p tsconfig.json` is a solution file and checks NOTHING).
  Baseline is ~44 pre-existing errors (GrokPage, VenicePage, SimpleImageCockpit,
  useWorkflowRun NodeInfo, Txt2ImgPage mask props). Zero NEW errors is the bar.
  Afterwards `git checkout --` the copied files in install\app and `git pull`.
- **PowerShell gotcha**: double quotes inside `git commit -m @'...'@` here-strings
  break argument parsing — write commit messages without embedded double quotes.
- CRLF warnings on commit are normal noise.

## Architecture pointers

- Frontend module cards/tabs: `frontend/src/modules/registry.ts`
  (venice card art in `frontend/public/cards/new/venice/`, currently up to 35).
- Backend modules/workflows: `config/modules.json`, `config/workflow_api.json`
  (param injection maps), workflow JSONs under `backend/workflows/<family>/`.
- Page layout standard: `WorkflowShell` + shared kit in
  `frontend/src/components/ui/WorkflowControls.tsx` (ChipGroup, SliderField,
  SeedField, UploadSlot, GenerateButton, BatchQueuePanel).
- Simple image pages ride the shared `Txt2ImgPage` base
  (`frontend/src/pages/zimage/ZImageTxt2Img.tsx`); video pages use the
  `useWorkflowRun` hook (batch queue lives in both).
- Header taxonomy: eyebrow = model family, title = capability.
- Per-workflow model/node manifests: `config/model_manifests/` (regenerate with
  `scripts/generate_model_manifests.py`); heavy nodes install lazily via
  `download_models.bat <workflow-id>`.
- Cross-page media handoff: `frontend/src/utils/workflowHandoff.ts`
  (kinds: image, video, audio).

## Feature state (as of 2026-07-08)

- Batch prompt queue (one prompt per line) on all image + video workflow pages.
- Voice Studio (tab id `zonos-tts`, file ZonosTTSPage.tsx — historical name):
  Edge TTS (fast, all languages) + Chatterbox (natural, English, ~5x realtime,
  voice cloning). Voice library = named clips in `ComfyUI\input\VOICES` via
  /api/tts/voices. Zonos itself was removed 2026-07-08.
- Audio2Video (LTX AI2V) has an in-page text→voice box (both engines, voice
  library) — full text → voice → lipsync-video chain on one page.
- Media Downloader: yt-dlp with a browser-cookies dropdown (Instagram etc. need
  it; Firefox most reliable, recent Chrome may block cookie export). Manual
  fallback: `config/cookies.txt`.
- Qwen has a real txt2img workflow (Lightning LoRA is a fixed node — user LoRAs
  chain after it; mapping onto the Lightning node causes grainy output).
- LoRA dropdowns match the family token anywhere in the path, so subfolder
  organization like `loras\app\Aurora\aurora-zimage.safetensors` works.

## Environment gotchas

- 3090 / 24 GB VRAM. Models ≥19 GB (Qwen fp8, Qwen Edit) run VRAM-bound/slow.
- Chatterbox pip install MUST be `--no-deps` (+ conformer s3tokenizer
  resemble-perth pydub) and setuptools pinned <81 (80.9.0) or perth breaks on
  missing pkg_resources. Its own pins would downgrade transformers/numpy/
  diffusers/starlette and break ComfyUI + backend. install.ps1/update_logic.ps1
  already encode this.
- yt-dlp extractors go stale fast — upgrade it in the install when downloads
  break (currently 2026.7.4).
- Full restart (close all consoles) after any custom-node or ComfyUI change.
- run.bat is a single-window launcher (all three services interleaved,
  color-coded; per-service logs in install\logs\*_live.log).

## Queued / open items

See the "Open / queued" notes in the newest BREADCRUMBS entries — currently:
character description tool (image → appearance-only sheet saved per LoRA),
preview strips on all image pages with removable thumbnails, SDXL
inpaint/outpaint simplification, optional Chroma higher-res presets,
optional 35.mp4 hover video for the Voice Studio card.
