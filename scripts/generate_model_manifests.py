"""Generate per-workflow model + custom-node manifests.

Scans backend/workflows/**/*.json for HuggingFaceDownloader nodes and writes:
  config/model_manifests/<workflow-id>.txt        models (URL folder [filename])
  config/model_manifests/<workflow-id>.nodes.txt  custom nodes (folder git_url)
  config/model_manifests/ALL-MODELS.txt           deduplicated union

Node requirements come from the owning module's custom_nodes list in
config/modules.json plus class_type auto-detection (mirrors module_nodes.ps1).
Nodes flagged "core" in config/nodes.json are excluded - the installer
already ships those. Run from anywhere:
  python scripts/generate_model_manifests.py
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORKFLOWS_DIR = ROOT / "backend" / "workflows"
API_CONFIG = ROOT / "config" / "workflow_api.json"
NODES_CONFIG = ROOT / "config" / "nodes.json"
MODULES_CONFIG = ROOT / "config" / "modules.json"
OUT_DIR = ROOT / "config" / "model_manifests"

URL_RE = re.compile(r"^https?://\S+\s+\S+", re.M)

# Mirrors $ClassTypeNodeMap in scripts/module_nodes.ps1 - keep both in sync.
CLASS_TYPE_NODE_MAP = {
    "String Literal": "ComfyUI-KJNodes",
    "InpaintCropImproved": "ComfyUI-Inpaint-CropAndStitch",
    "InpaintStitchImproved": "ComfyUI-Inpaint-CropAndStitch",
    "LayerMask: PersonMaskUltra V2": "ComfyUI_LayerStyle_Advance",
    "Text Multiline": "was-node-suite-comfyui",
    "UnetLoaderGGUF": "ComfyUI-GGUF",
    "DualCLIPLoaderGGUF": "ComfyUI-GGUF",
    "Ideogram4PromptBuilderKJ": "ComfyUI-KJNodes",
    "Ideogram4Scheduler": "ComfyUI-KJNodes",
    "PrimitiveInt": "ComfyLiterals",
    "JsonExtractString": "ComfyLiterals",
    "StringReplace": "ComfyLiterals",
    "ComfyMathExpression": "ComfyMath",
    "ComfyNumberConvert": "ComfyMath",
    "ImpactSwitch": "ComfyUI-Impact-Pack",
}


def extract_class_types(workflow_path: Path) -> set[str]:
    try:
        data = json.loads(workflow_path.read_text(encoding="utf-8-sig"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return set()
    cts: set[str] = set()
    if isinstance(data, dict) and isinstance(data.get("nodes"), list):
        for node in data["nodes"]:
            if isinstance(node, dict) and node.get("type"):
                cts.add(str(node["type"]))
    elif isinstance(data, dict):
        for node in data.values():
            if isinstance(node, dict) and node.get("class_type"):
                cts.add(str(node["class_type"]))
    return cts


def extract_links(workflow_path: Path) -> list[str]:
    """Return manifest lines from every downloader node in one workflow JSON."""
    try:
        data = json.loads(workflow_path.read_text(encoding="utf-8-sig"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return []

    blobs: list[str] = []

    def collect_from_api_node(node: dict) -> None:
        if "Downloader" in str(node.get("class_type", "")):
            links = node.get("inputs", {}).get("download_links", "")
            if isinstance(links, str) and links.strip():
                blobs.append(links)

    def collect_from_ui_node(node: dict) -> None:
        if "Downloader" in str(node.get("type", "")):
            for value in node.get("widgets_values") or []:
                if isinstance(value, str) and URL_RE.search(value):
                    blobs.append(value)

    if isinstance(data, dict) and isinstance(data.get("nodes"), list):
        for node in data["nodes"]:
            if isinstance(node, dict):
                collect_from_ui_node(node)
    elif isinstance(data, dict):
        for node in data.values():
            if isinstance(node, dict):
                collect_from_api_node(node)

    lines: list[str] = []
    for blob in blobs:
        for raw in blob.splitlines():
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split()
            if len(parts) >= 2 and parts[0].startswith("http"):
                lines.append(" ".join(parts[:3]))
    return lines


def load_node_catalog() -> tuple[dict[str, dict], set[str]]:
    """Return (name -> {url, folder}, core_names)."""
    catalog: dict[str, dict] = {}
    core: set[str] = set()
    if NODES_CONFIG.exists():
        for entry in json.loads(NODES_CONFIG.read_text(encoding="utf-8-sig")):
            catalog[entry["name"]] = {"url": entry.get("url", ""), "folder": entry.get("folder", entry["name"])}
            if entry.get("core"):
                core.add(entry["name"])
    return catalog, core


def load_module_nodes() -> dict[str, list[str]]:
    """Return workflow_id -> custom_nodes of its owning module."""
    result: dict[str, list[str]] = {}
    if MODULES_CONFIG.exists():
        manifest = json.loads(MODULES_CONFIG.read_text(encoding="utf-8-sig"))
        for module in manifest.get("modules", []):
            for wf_id in module.get("workflows") or []:
                result.setdefault(wf_id, []).extend(module.get("custom_nodes") or [])
    return result


def required_nodes(wf_id: str, wf_path: Path, module_nodes: dict[str, list[str]],
                   catalog: dict[str, dict], core: set[str]) -> list[str]:
    """Non-core node package names this workflow needs."""
    wanted: list[str] = []
    for name in module_nodes.get(wf_id, []):
        if name not in wanted:
            wanted.append(name)
    for ct in sorted(extract_class_types(wf_path)):
        pkg = CLASS_TYPE_NODE_MAP.get(ct)
        if pkg and pkg not in wanted:
            wanted.append(pkg)
    return [n for n in wanted if n in catalog and n not in core]


def main() -> None:
    id_by_filename: dict[str, str] = {}
    if API_CONFIG.exists():
        api = json.loads(API_CONFIG.read_text(encoding="utf-8-sig"))
        for wf_id, entry in api.items():
            filename = str(entry.get("filename", "")).replace("\\", "/")
            if filename:
                id_by_filename[filename] = wf_id

    catalog, core_nodes = load_node_catalog()
    module_nodes = load_module_nodes()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    all_lines: dict[str, str] = {}  # key: url+folder for dedupe, value: line
    manifest_count = 0

    for wf_path in sorted(WORKFLOWS_DIR.rglob("*.json")):
        lines = extract_links(wf_path)
        if not lines:
            continue
        rel = wf_path.relative_to(WORKFLOWS_DIR).as_posix()
        wf_id = id_by_filename.get(rel, wf_path.stem)
        # sanitize id for filesystem
        safe_id = re.sub(r"[^A-Za-z0-9._-]", "_", wf_id)

        seen: set[str] = set()
        unique: list[str] = []
        for line in lines:
            parts = line.split()
            key = f"{parts[0]} {parts[1]}"
            if key not in seen:
                seen.add(key)
                unique.append(line)
            all_lines.setdefault(key, line)

        header = (
            f"# Models for workflow: {wf_id}\n"
            f"# Source: backend/workflows/{rel}\n"
            f"# Format: URL folder [filename]  (folder is relative to ComfyUI/models)\n"
            f"# Generated by scripts/generate_model_manifests.py - do not edit by hand.\n"
        )
        (OUT_DIR / f"{safe_id}.txt").write_text(header + "\n".join(unique) + "\n", encoding="utf-8")
        manifest_count += 1

        nodes = required_nodes(wf_id, wf_path, module_nodes, catalog, core_nodes)
        node_file = OUT_DIR / f"{safe_id}.nodes.txt"
        if nodes:
            node_header = (
                f"# Custom nodes for workflow: {wf_id} (non-core; core set ships with the installer)\n"
                f"# Format: folder git_url\n"
                f"# Generated by scripts/generate_model_manifests.py - do not edit by hand.\n"
            )
            node_lines = [f"{catalog[n]['folder']} {catalog[n]['url']}" for n in nodes]
            node_file.write_text(node_header + "\n".join(node_lines) + "\n", encoding="utf-8")
        elif node_file.exists():
            node_file.unlink()
        print(f"  {safe_id}.txt  ({len(unique)} models, {len(nodes)} extra nodes)  <- {rel}")

    all_header = (
        "# Union of all workflow model manifests (deduplicated).\n"
        "# Generated by scripts/generate_model_manifests.py - do not edit by hand.\n"
    )
    (OUT_DIR / "ALL-MODELS.txt").write_text(
        all_header + "\n".join(sorted(all_lines.values())) + "\n", encoding="utf-8",
    )
    print(f"\n{manifest_count} manifests + ALL-MODELS.txt ({len(all_lines)} unique models) -> {OUT_DIR}")


if __name__ == "__main__":
    sys.exit(main())
