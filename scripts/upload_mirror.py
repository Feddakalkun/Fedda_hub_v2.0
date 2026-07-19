"""Upload FEDDA's fragile assets to the FeddaKalkun HF mirror.

Some models/nodes have no reliable upstream (inswapper_128 was pulled from its
official source; SECRET_SAUCE is an unsourced community merge; the two vendored
custom nodes are naked folders with no git remote). This mirrors them to
https://huggingface.co/datasets/FeddaKalkun/fedda-mirror so the model manifests
and community installs have a source we control.

Run:  python_embeded\\python.exe scripts\\upload_mirror.py
Needs a WRITE-scope HF token saved in the app (Settings -> HF Token), or set
HF_TOKEN in the environment.
"""
import io
import json
import os
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REPO_ID = "FeddaKalkun/fedda-mirror"

UPLOADS = [
    # (local path relative to app root, path inside the mirror repo)
    ("ComfyUI/models/insightface/inswapper_128.onnx", "insightface/inswapper_128.onnx"),
    ("ComfyUI/models/loras/wan/SECRET_SAUCE_WAN2.1_14B_fp8.safetensors", "loras/SECRET_SAUCE_WAN2.1_14B_fp8.safetensors"),
]
NODE_ZIPS = ["ComfyUI-AdvancedLivePortrait", "comfyui-reactor-node"]


def main() -> int:
    token = os.environ.get("HF_TOKEN", "").strip()
    if not token:
        settings = json.load(io.open(ROOT / "config" / "runtime_settings.json", encoding="utf-8"))
        token = str(settings.get("hf_token") or "").strip()
    if not token:
        print("No HF token found (settings or HF_TOKEN env). Aborting.")
        return 1

    from huggingface_hub import HfApi

    api = HfApi(token=token)
    me = api.whoami()
    print(f"Logged in as: {me.get('name')}")

    api.create_repo(REPO_ID, repo_type="dataset", exist_ok=True, private=False)
    print(f"Repo ready: {REPO_ID}")

    for local, remote in UPLOADS:
        p = ROOT / local
        if not p.is_file():
            print(f"  SKIP (not found): {local}")
            continue
        print(f"  uploading {local} ({p.stat().st_size / 1e6:.0f} MB) -> {remote}")
        api.upload_file(path_or_fileobj=str(p), path_in_repo=remote, repo_id=REPO_ID, repo_type="dataset")

    for name in NODE_ZIPS:
        src = ROOT / "vendor" / "custom_nodes" / name
        if not src.is_dir():
            print(f"  SKIP (no vendored copy): {name}")
            continue
        zip_base = ROOT / "logs" / f"{name}"
        zip_path = shutil.make_archive(str(zip_base), "zip", root_dir=src.parent, base_dir=name)
        print(f"  uploading node zip {name}.zip")
        api.upload_file(path_or_fileobj=zip_path, path_in_repo=f"custom_nodes/{name}.zip", repo_id=REPO_ID, repo_type="dataset")
        os.unlink(zip_path)

    print("Done. Mirror populated.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
