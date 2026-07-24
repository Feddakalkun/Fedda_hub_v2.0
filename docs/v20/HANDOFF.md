# FEDDA Hub v2.0 Handoff

Quick-start and gotchas for a new agent/session. The running trail of every change
is in BREADCRUMBS.md (same folder) — read the newest entries there for recent work.

## The two trees (this is the most important thing)

- **Canonical location as of 2026-07-23: `H:\Fedda-Hub\fedda_hub_latest\`**
  (`repo\` = clean git clone / source of truth; `install\app\` = the built running
  app). The old `H:\Fedda-Hub\Fedda_hub_v2.0\` and the ~30 other `H:\Fedda-Hub\*`
  folders are being retired — confirm which tree the user means before editing.
- git remote: https://github.com/Feddakalkun/Fedda_hub_v2.0 (underscore, not v22's
  hyphen). `repo\` is a clean checkout of origin/main.
- `install\app\` is a **git clone of the same repo**, NOT a robocopy target. Sync =
  commit in repo → push → `git pull` in install\app.
- **Two-tree gotcha (why the reset happened):** the previous `Fedda_hub_v2.0\install\app`
  drifted onto an ancient base (`bea63c5`) and diverged in ~49 files (CRLF + install
  running older code than committed). A bulk `install→repo` copy ROLLS FILES BACKWARD.
  Rule: never bulk-copy between trees; copy only the specific files you changed and
  `git add` them explicitly. A fresh clone (like `fedda_hub_latest\repo`) avoids this —
  keep it in sync via `git pull`, never robocopy.
- The install root holds thin local-only wrappers (never committed): `run.bat`,
  `update.bat`, `download_models.bat`, `symlink_modelfolder.bat`.
- The outer `FEDDA_v2.0_Installer.bat` is now version-controlled at
  `installer/FEDDA_v2.0_Installer.bat` (source of truth) — it's the one file you hand
  a new user. The running copy lives in the install ROOT (one level above `app\`),
  NOT inside `app\`; when you change `installer/`, copy it out to the install root.
  (`dist/` is gitignored — it's the frontend build output — so the installer can't
  live there.)
  It has the front-of-house flow (welcome / requirements+winget offer / disclaimer /
  info; prototyped in the local, uncommitted `install\ghost-installer.bat`).

## Distribution / community installs (the vendoring layer)

- **Nodes with no reliable upstream are VENDORED in the repo**: `vendor/custom_nodes/`
  ships `ComfyUI-AdvancedLivePortrait` + `comfyui-reactor-node` (naked folders, no git
  remote, absent from Manager). `install.ps1` / `update_logic.ps1` / `download_models.bat`
  all install from the vendored copy BEFORE trying git clone. Add future no-upstream nodes
  here the same way.
- **Fragile models** → `FeddaKalkun/fedda-mirror` (public HF dataset). Populate with
  `python_embeded\python.exe scripts\upload_mirror.py` (needs a WRITE HF token saved in
  Settings). Currently hosts `SECRET_SAUCE_WAN2.1_14B_fp8` + node-zip backups. The
  per-workflow `config/model_manifests/*.txt` point at it. **Do NOT re-add inswapper_128**
  (withdrawn deepfake model, account risk, and unused).
- A genuine new user gets everything automatically: git clone (code+nodes) + manifests
  (public HF + the mirror). No manual copying.

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

## Feature state (recent — as of 2026-07-23)

- **Library / Character page** (`/tab/library`) is a real browser now: Characters
  (grouped from `app/<Name>/` + folders with a lone `.md`), Files, Packs; family as a
  filter; per-character sheet editor (trigger/appearance + Ollama-vision "describe");
  previews served by `GET /api/lora/preview` (sidecar `<stem>.preview.jpg`).
- **LivePortrait** tab (face/talking-head: portrait + driving video) and **WAN VACE**
  tab (FULL-BODY motion transfer — the tool for realistic cam-style body motion;
  LivePortrait is face-only). Both from the E:\Comfyuistudio pack, vendored.
- **FaceFix** + **Z-Image Inpaint** pages (auto-mask person/face → regenerate).
- **LTX** img2vid stacks multiple LoRAs (Power Lora Loader node 5584, NOT the distill
  node); LTX First-Last-Frame has a "Write prompt from frames" button
  (`POST /api/ollama/flf-prompt`, captions both keyframes → motion prompt).
- Global media **drag-and-drop** on all upload surfaces.
- Uncensored prompt/vision path: joycaption preferred for vision; explicit LTX/WAN
  caption+enhancer recipes; Ollama with a ComfyUI-LLM fallback for no-Ollama/RunPod.

## Feature state (older — as of 2026-07-08)

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
  resemble-perth pydub pyloudnorm) and setuptools pinned <81 (80.9.0) or perth
  breaks on missing pkg_resources. Its own pins would downgrade transformers/
  numpy/diffusers/starlette and break ComfyUI + backend. install.ps1/
  update_logic.ps1 already encode this. The dependency-conflict WARNINGS pip
  prints for chatterbox (wants old numpy/transformers/diffusers/safetensors) are
  EXPECTED and harmless — we deliberately keep the newer versions ComfyUI needs.
  pyloudnorm was added 2026-07-24 (chatterbox needs it at synthesis time for
  loudness; it was silently missing and would error on generate). gradio/pykakasi/
  spacy-pkuseg stay unlisted (web UI + Japanese/Chinese-only, not needed).
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
