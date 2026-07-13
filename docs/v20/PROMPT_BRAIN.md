# FEDDA Hub — Prompt / LLM "Brain" Guide (agent handoff)

This documents the LLM prompt-generation system ("the brain") that powers every
Enhance / Generate / Influencer button, image captioning, and the WAN Story
storyboard. Hand this to an agent that needs to tune prompt quality or the story
consistency.

All line numbers are for the file as of this writing — **grep the function name
to confirm the current line** before editing (the file changes often).

---

## 0. Golden rules (two-tree repo)

- **Source of truth:** `H:\Fedda-Hub\Fedda_hub_v2.0\repo\`
- **Runtime (what actually runs):** `H:\Fedda-Hub\Fedda_hub_v2.0\install\app\`
- **Never edit `install\app` directly** — it gets overwritten. Edit in `repo`, then:
  1. `cd repo && git add -A && git commit -m "..." && git push origin main`
  2. `cd install\app && git checkout -- . && git pull`
- **Backend changes require a backend restart** (`run.bat`) — prompts, model
  pickers, and system prompts are all loaded at startup.
- Python check before commit:
  `install\app\python_embeded\python.exe -m py_compile repo\backend\server.py`

---

## 1. The two brain files

| File | Role |
|------|------|
| `repo\backend\server.py` | All LLM endpoints, per-workflow personas, model selection, the WAN Story brain. |
| `repo\backend\influencer_prompts.py` | Word-bank + templates for the "Influencer" 🎲 random-prompt roller. |

Everything talks to a **local Ollama** server (`OLLAMA_URL`, default
`http://127.0.0.1:11434`). No cloud calls.

---

## 2. `backend\server.py` — line map

### Model selection (which LLM every tool uses)
- **`_preferred_ollama_model(kind, installed)` ~L1953** — returns the user's
  chosen model from Settings (`ollama_text_model` / `ollama_vision_model` in
  `config/runtime_settings.json`) if it's installed, else `None`.
- **`_get_ollama_text_model()` ~L1968** — the text model for prompt writing.
  Order: user pick → priority heuristic list (`zarigata/unfiltered-llama3`,
  `dolphin-llama3`, `llama3.x`, `qwen2.5`, …) → any non-vision model.
- **`_get_ollama_vision_model()` ~L2014** — the vision model for captioning /
  story reading. Same "user pick first" logic.
- **`_get_ollama_model_names()` ~L2033**, **`_clean_caption_text()` ~L2112**.
- Settings endpoints: **`GET/POST /api/settings/ollama-defaults` ~L342 / L355**
  (the "Use for prompts / Use for vision" buttons on the Ollama Models page).

> To change the *default* model logic, edit the priority lists in
> `_get_ollama_text_model` / `_get_ollama_vision_model`. To change *what a user
> can pick from*, edit `repo\frontend\src\config\ollamaModels.ts` (the catalog).

### Per-workflow personas (the "voice" of each prompt)
- **`OLLAMA_SYSTEM_PROMPTS: Dict[str,str]` L1628–L1746** — one system prompt per
  UI context. Keys and their lines:
  `zimage`(1629), `ltx-flf`(1636), `ltx-img2vid`(1642), `ltx-lipsync`(1647),
  `wan-scene`(1651), **`wan-story`(1657)**, `chroma`(1662), `flux2-klein`(1667),
  `qwen`(1672), `firered`(1677), `wan-i2v`(1682), `hunyuan-i2v`(1690),
  `ideogram`(1698), `sdxl-inpaint`(1706), `sdxl-outpaint`(1715), `sdxl-depth`(1723),
  `sdxl-openpose`(1731), `steady-dancer`(1739).

> **This is the #1 place to tune prompt style/quality per workflow.** Each string
> tells the LLM how to write for that model (e.g. photoreal vs cinematic, how
> explicit, format rules).

### The prompt endpoints
- **`POST /api/ollama/prompt` ~L2223** (`ollama_generate_prompt`) — the main
  brain behind the Enhance / Generate / Influencer buttons in `PromptAssistant`.
  Streams tokens (SSE). Request `{context, mode, current_prompt, workflow_id}`.
  Modes:
  - `enhance` — polish the user's current prompt (uses the context persona).
  - `inspire` — write a fresh prompt from scratch for that context.
  - `influencer` — calls `influencer_prompts.roll_brief()` +
    `build_messages()` for a random photo brief, then the LLM finalizes it.
- **`POST /api/ollama/caption` ~L2278** (`ollama_caption_image`) — drop-an-image
  → vision model describes it into a prompt. Uses `_get_ollama_vision_model()`.
- **`GET /api/prompts/influencer-batch` ~L2211** — N influencer prompt lines for
  batch/wildcard fields.
- **`GET /api/ollama/models` ~L2129**, **`POST /api/ollama/pull` ~L2180** — list
  / download models (the Ollama Models page).

### The WAN Story brain (frame-to-frame consistency)
- **`POST /api/ollama/storyboard` ~L2460** (`ollama_storyboard`).
  Request `{images: [inputFilenames in play order], style}`. Two passes:
  1. **Vision pass (sequence-aware):** captions each keyframe. Frame 1 is
     described plainly; every later frame is described *relative to the previous
     caption*, stating what changed (pose/position/gesture/framing) with the same
     subject/setting. This is what creates real continuity.
  2. **Director pass:** feeds all captions to the text model, which returns
     exactly `N-1` transition prompts (strict JSON array) — the motion between
     each pair of frames as one continuous arc.
  - **Quality here depends heavily on the VISION model** — weak captioners
    (base llava/moondream) can't track evolution; `qwen2.5-vl` or
    `llama3.2-vision` are much better.
  - Does **not** currently accept per-frame user text hints (only images + a
    global `style`). Threading per-scene prompts in is a known possible upgrade.

### Result collection (not a prompt, but story-adjacent)
- **`GET /api/generate/status/{prompt_id}` ~L3939** — collects images/videos from
  a finished ComfyUI run. Reads `images` **and** `preview_images` output keys
  (the latter added so QwenMultiangleCameraNode results are returned).

---

## 3. `backend\influencer_prompts.py` — line map

Pure Python, no LLM — builds a random "photo brief" that the `influencer` mode
then hands to the LLM.

- Word banks (edit to change the flavor / add outfits/scenes/etc.):
  `SUBJECTS`(L4), `SCENES`(L20), `OUTFITS`(L45), `ACTIONS`(L64), `LIGHTING`(L81),
  `CAMERA`(L93), `MOODS`(L104), `COLOR_PALETTES`(L116), `COMPOSITIONS`(L126),
  `LENS`(L137), `REALISM`(L145), `NEGATIVES`(L154).
- **`roll_brief(rng=None)` L164** — picks one from each bank → a brief dict.
- **`compose_prompt(brief, context)` L181** — assembles a prompt string directly
  (template, no LLM) — used where a fast deterministic prompt is wanted.
- **`build_messages(brief, context)` L199** — returns `(system, user)` for the
  LLM to finalize a brief in the `influencer` mode.

> To make random prompts raunchier/tamer or add outfit/scene variety, edit the
> word banks. To change how they're phrased to the LLM, edit `build_messages`.

---

## 4. Data flow cheat-sheet

```
Frontend PromptAssistant  --POST /api/ollama/prompt {context,mode,current_prompt}
   Enhance/Generate/Dice        -> OLLAMA_SYSTEM_PROMPTS[context] persona
                                 -> _get_ollama_text_model()  (user pick or heuristic)
                                 -> Ollama /api/generate (SSE stream back to box)

Drop image on prompt box  --POST /api/ollama/caption {file,context}
                                 -> _get_ollama_vision_model() -> Ollama vision

WAN Story page            --POST /api/ollama/storyboard {images,style}
                                 -> per-frame sequence-aware captions (vision)
                                 -> director text model -> N-1 transition prompts

Ollama Models page        --/api/ollama/models, /api/ollama/pull,
                            /api/settings/ollama-defaults (set user default)
```

User's chosen models persist in `config\runtime_settings.json`
(`ollama_text_model`, `ollama_vision_model`). Frontend catalog of pullable models:
`repo\frontend\src\config\ollamaModels.ts`.

---

## 5. Common tasks → where to edit

| Goal | Edit |
|------|------|
| Better/worse prompt style for one workflow | `OLLAMA_SYSTEM_PROMPTS[<context>]` (server.py ~L1628) |
| Improve WAN Story continuity | `ollama_storyboard` vision/director prompts (server.py ~L2460) + use a strong vision model |
| Change default model choice logic | `_get_ollama_text_model` / `_get_ollama_vision_model` (server.py ~L1968/2014) |
| Add/curate downloadable models in UI | `frontend/src/config/ollamaModels.ts` |
| Change random-influencer flavor | word banks + `build_messages` in `influencer_prompts.py` |

After any edit: commit→push (repo) → checkout/pull (install) → **restart backend**.
