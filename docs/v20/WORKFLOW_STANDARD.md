# FEDDA v20 Workflow Standard (baseline from v16 modular pass)

This is the baseline for new workflow packs and future booster modules. The goal is that every workflow can be added, tested, updated, and removed without turning the UI or installer into a patchwork again.

## Core Rule

If a workflow needs model files, put a `HuggingFaceDownloader` node at the start of the workflow and configure it with exact HuggingFace links and ComfyUI model target folders.

The reusable downloader template lives here:

`backend/workflows/HF-downloader/HFdownloadernode.json`

For model-backed workflows with this node:

- Backend model status may report missing files from the downloader node.
- Backend `/api/generate` must not hard-block before ComfyUI can run the downloader node.
- Runtime HuggingFace token injection is handled by `backend/workflow_service.py` for every `HuggingFaceDownloader` node.
- Private/gated HuggingFace repos still need the user to set a valid HF token.

## Workflow File Rules

- Prefer API-format workflow JSON for app-facing workflows.
- Keep workflow files under `backend/workflows/<family>/`.
- Do not store local absolute paths such as `H:\...` or `C:\Users\...` inside workflow JSON.
- Use stable node ids for mapped inputs.
- Use explicit `SaveImage` or video output prefixes that identify the family, for example `IMAGE/Z-IMAGE/0` or `VIDEO/CHROMA/0`.
- Keep helper nodes only when they are installed by the module or are part of Comfy core.

## Mapping Rules

Every app-facing workflow must have an entry in `config/workflow_api.json`.

Mappings must:

- Point to the workflow file with `filename`.
- Map every UI parameter to a real node id and input key.
- Use `type: "loras"` for LoRA injection nodes.
- Avoid baked-in LoRA names unless the workflow deliberately ships with that LoRA pack.
- Keep workflow ids family-prefixed, for example `chroma-txt2img`, `z-image`, or `flux2klein-txt2img`.

## Module Rules

Every workflow should belong to one module in `config/modules.json`.

Core app modules should stay small and stable. Optional model families, heavy nodes, and advanced workflows should live as booster-style modules so the app can still open when that pack is not installed.

## Frontend Rules

New image workflows should reuse the compact txt2img base where possible:

`frontend/src/pages/zimage/ZImageTxt2Img.tsx`

Keep the first version practical:

- Prompt and generation controls on one usable page.
- Preview strip at the top.
- Compact LoRA controls.
- Neutral black/grey styling.
- Model status as guidance, not a scary blocker when the workflow can download models itself.

## Validation

Run the workflow standard validator after adding or editing a workflow:

```powershell
python dev_tools/validate_workflow_standard.py --workflow-id z-image
python dev_tools/validate_workflow_standard.py --workflow-id flux2klein-txt2img
python dev_tools/validate_workflow_standard.py --all
```

For a new model-backed workflow, require the downloader node:

```powershell
python dev_tools/validate_workflow_standard.py --workflow-id chroma-txt2img --require-downloader
```


