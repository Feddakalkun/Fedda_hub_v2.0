"""
LoRA Service — catalog browsing, download tracking, install scanning.

Packs are sourced from public HuggingFace dataset repos (pmczip).
Catalog is cached for 10 minutes so browsing is snappy.
Preview images: prefers /lora-previews/<pack_key>/<Basename>.jpg stored in GitHub,
falls back to the HuggingFace-hosted image if not present locally.
"""

import os
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

import requests


def _normalize_lora_path(path: str) -> str:
    """Normalize a LoRA path for reliable prefix/family comparison.
    - Converts Windows backslashes to forward slashes
    - Lowercases (Windows filesystem is case-insensitive)
    - Strips leading/trailing whitespace and slashes
    """
    if not path:
        return ""
    p = str(path).replace("\\", "/").strip().lower()
    return p.strip("/")


def _is_link(path: Any) -> bool:
    """True if path is a symlink OR a Windows junction/reparse point.

    os.path.islink() alone is not enough on Windows: a junction is
    IO_REPARSE_TAG_MOUNT_POINT, not IO_REPARSE_TAG_SYMLINK, so islink() returns
    False for it. st_reparse_tag (Windows, py3.8+) catches both; on POSIX the
    attribute is absent and islink() is authoritative.
    """
    try:
        if os.path.islink(path):
            return True
        return getattr(os.lstat(path), "st_reparse_tag", 0) != 0
    except OSError:
        return False


# ─── Pack Registry ─────────────────────────────────────────────────────────────
# hf_type: "dataset" or "model" — determines which HF API endpoint to use
# img_subfolder: optional subfolder within the HF repo where preview .jpg images live
PACKS: Dict[str, Dict[str, str]] = {
    "zimage_turbo": {
        "hf_repo":        "pmczip/Z-Image-Turbo_Models",
        "hf_type":        "model",
        "dest":           "zimage_turbo",
        "img_subfolder":  "ZIT_Images",
    },
    "zimage_nsfw": {
        "hf_repo":       "qqnyanddld/nsfw-z-image-lora",
        "hf_type":       "model",
        "dest":          "zimage_turbo",
    },
    "wan22_nsfw": {
        "hf_repo":       "lkzd7/WAN2.2_LoraSet_NSFW",
        "hf_type":       "model",
        "dest":          "wan22",
    },
    "flux2klein": {
        "hf_repo":       "pmczip/FLUX.2-klein-9B_Models",
        "hf_type":       "model",
        "dest":          "flux2klein",
        "img_subfolder": "klein_images",
    },
    "flux1dev": {
        "hf_repo":       "pmczip/FLUX.1-dev_Models",
        "hf_type":       "model",
        "dest":          "flux1dev",
        "img_subfolder": "Flux1D_Images",
    },
    "flux2klein_realism_engine": {
        "dest": "flux2klein",
        "static_items": [
            {
                "name": "Realism Engine Klein",
                "file": "realism-engine-klein.safetensors",
                "url":  "https://civitai.red/api/download/models/2679241?type=Model&format=SafeTensor",
            }
        ],
    },
    "sd15": {
        "hf_repo":  "pmczip/SD1.5_LoRa_Models",
        "hf_type":  "model",
        "dest":     "sd15",
    },
    "sd15_lycoris": {
        "hf_repo":       "pmczip/SD1.5_LyCORIS_Models",
        "hf_type":       "model",
        "dest":          "sd15-lycoris",
        "img_subfolder": "LYCORIS_Images",
    },
    "sdxl": {
        "hf_repo":       "pmczip/SDXL_Models",
        "hf_type":       "model",
        "dest":          "sdxl",
        "img_subfolder": "SDXL_Images",
    },
}

FREE_LORAS = [
    {
        "id":       "emmy",
        "name":     "Emmy",
        "filename": "emmy.safetensors",
        "url":      "https://huggingface.co/datasets/FeddaKalkun/free-loras/resolve/main/emmy.safetensors",
    },
    {
        "id":       "sana",
        "name":     "Sana",
        "filename": "sana.safetensors",
        "url":      "https://huggingface.co/datasets/FeddaKalkun/free-loras/resolve/main/sana.safetensors",
    },
    {
        "id":       "maya",
        "name":     "Maya",
        "filename": "maya.safetensors",
        "url":      "https://huggingface.co/datasets/FeddaKalkun/free-loras/resolve/main/maya.safetensors",
    },
]


class LoRAService:
    def __init__(self, root_dir: Path):
        self.root        = root_dir
        self.lora_dir    = root_dir / "ComfyUI" / "models" / "loras"
        # GitHub-stored previews live under frontend/public
        self.preview_dir = root_dir / "frontend" / "public" / "lora-previews"

        # HF catalog cache: pack_key → (fetch_timestamp, [hf_file_items])
        self._catalog_cache: Dict[str, tuple] = {}
        self._cache_ttl = 600  # 10 minutes

        # Download state: filename → { status, progress, pack_key?, error? }
        self._downloads: Dict[str, Dict[str, Any]] = {}
        # Import jobs: job_id → { status, progress, filename, message? }
        self._import_jobs: Dict[str, Dict[str, Any]] = {}
        self._lock = threading.Lock()

    def refresh_cache(self):
        """Force clear any caches so new local files appear immediately."""
        self._catalog_cache.clear()

    def get_dest_for_family(self, family: str) -> Optional[str]:
        """Returns the destination subfolder for a given family/tab."""
        # Map UI family names to pack keys that have a 'dest'
        family_to_pack: Dict[str, str] = {
            "z-image": "zimage_turbo",
            "flux2klein": "flux2klein",
            "sd15": "sd15",
            "sdxl": "sdxl",
            "wan": "wan22_nsfw",
        }

        pack_key = family_to_pack.get(family, family)

        if pack_key in PACKS:
            return PACKS[pack_key].get("dest", pack_key)

        # Fallback: use the family name as folder
        return family

    # ─── Runtime token helpers ─────────────────────────────────────────────

    def _load_runtime_settings(self) -> Dict[str, Any]:
        settings_path = self.root / "config" / "runtime_settings.json"
        try:
            if settings_path.exists():
                import json
                return json.loads(settings_path.read_text(encoding="utf-8"))
        except Exception:
            pass
        return {}

    def _resolve_download_url(
        self,
        url: str,
        hf_token: Optional[str] = None,
        civitai_token: Optional[str] = None,
    ) -> str:
        """
        Resolve provider-specific URL auth, similar to HF token auto-injection.
        - Civitai: append ?token=<key> when URL host is civitai and token is missing.
        """
        parsed = urlparse(url)
        host = (parsed.netloc or "").lower()

        if "civitai.com" in host or "civitai.red" in host:
            token = (civitai_token or "").strip()
            if not token:
                settings = self._load_runtime_settings()
                token = str(settings.get("civitai_api_key") or "").strip()
            if token:
                q = dict(parse_qsl(parsed.query, keep_blank_values=True))
                if "token" not in q:
                    q["token"] = token
                    return urlunparse(parsed._replace(query=urlencode(q, doseq=True)))

        return url

    def _hf_token(self, hf_token: Optional[str] = None) -> str:
        """Explicit token, else the one saved in settings.

        Without this fallback a token saved via the UI is never applied, so gated
        repos fail with an empty catalog / 401 even though the key is configured.
        """
        token = (hf_token or "").strip()
        if token:
            return token
        return str(self._load_runtime_settings().get("hf_token") or "").strip()

    def _hf_headers(self, hf_token: Optional[str] = None) -> Dict[str, str]:
        token = self._hf_token(hf_token)
        return {"Authorization": f"Bearer {token}"} if token else {}

    # ─── HuggingFace helpers ────────────────────────────────────────────────

    def _hf_file_url(self, pack_key: str, filename: str) -> str:
        pack = PACKS[pack_key]
        for item in pack.get("static_items", []):
            if item.get("file") == filename:
                return item.get("url", "")

        repo = pack["hf_repo"]
        if pack["hf_type"] == "dataset":
            return f"https://huggingface.co/datasets/{repo}/resolve/main/{filename}"
        return f"https://huggingface.co/{repo}/resolve/main/{filename}"

    # ─── Installed-LoRA previews ────────────────────────────────────────────

    PREVIEW_EXTS = (".preview.jpg", ".preview.png", ".jpg", ".png")

    def _preview_cache_path(self, rel: str) -> Path:
        """Cache location for LoRAs we cannot write a sidecar next to.

        Linked stashes are frequently read-only (or on another volume), so the
        sidecar convention can't be the only option. Hashed on the normalized
        relative path so two same-named LoRAs in different folders don't collide.
        """
        import hashlib
        digest = hashlib.sha1(_normalize_lora_path(rel).encode("utf-8")).hexdigest()
        return self.root / "config" / "lora_previews" / f"{digest}.jpg"

    def _lora_fs_path(self, rel: str) -> Path:
        """Relative LoRA path -> real filesystem path.

        Deliberately does NOT use _normalize_lora_path: that lowercases (it exists
        for case-insensitive KEY comparison). Lowercasing a real path is harmless
        on Windows but breaks on Linux — which is where the RunPod image runs.
        """
        return self.lora_dir / str(rel).replace("\\", os.sep).replace("/", os.sep).strip(os.sep)

    def preview_file_for(self, rel: str) -> Optional[Path]:
        """Resolve an on-disk preview image for an installed LoRA, or None.

        Order: sidecar next to the LoRA (mirrors the existing <stem>.md sheet
        convention and travels with a linked folder) -> hashed cache -> None.
        """
        lora = self._lora_fs_path(rel)
        stem = str(lora.with_suffix(""))          # .../foo.safetensors -> .../foo
        for ext in self.PREVIEW_EXTS:             # foo.preview.jpg, foo.png, ...
            try:
                cand = Path(stem + ext)
                if cand.is_file():
                    return cand
            except OSError:
                pass
        cached = self._preview_cache_path(rel)
        try:
            if cached.is_file():
                return cached
        except OSError:
            pass
        return None

    def save_preview_for(self, rel: str, data: bytes) -> Dict[str, Any]:
        """Write a preview for an installed LoRA.

        Prefers a sidecar so it stays with the file; falls back to the cache when
        the folder isn't writable (read-only or linked external stash).
        """
        lora = self._lora_fs_path(rel)
        sidecar = Path(str(lora.with_suffix("")) + ".preview.jpg")
        try:
            sidecar.write_bytes(data)
            return {"success": True, "stored": "sidecar", "path": str(sidecar)}
        except OSError:
            cached = self._preview_cache_path(rel)
            try:
                cached.parent.mkdir(parents=True, exist_ok=True)
                cached.write_bytes(data)
                return {"success": True, "stored": "cache", "path": str(cached)}
            except OSError as exc:
                return {"success": False, "error": str(exc)}

    def _preview_url(self, pack_key: str, basename: str) -> Optional[str]:
        """
        Returns the best available preview URL.
        Priority: GitHub-stored static image (.png or .jpg) > HuggingFace subfolder > None.
        """
        for ext in (".png", ".jpg"):
            static = self.preview_dir / pack_key / f"{basename}{ext}"
            if static.exists():
                return f"/lora-previews/{pack_key}/{basename}{ext}"

        pack = PACKS.get(pack_key)
        if not pack:
            return None
        repo = pack["hf_repo"]
        img_subfolder = pack.get("img_subfolder", "")
        img_path = f"{img_subfolder}/{basename}.png" if img_subfolder else f"{basename}.png"
        if pack["hf_type"] == "dataset":
            return f"https://huggingface.co/datasets/{repo}/resolve/main/{img_path}"
        return f"https://huggingface.co/{repo}/resolve/main/{img_path}"

    def _fetch_hf_catalog(self, pack_key: str) -> List[Dict[str, Any]]:
        """Fetch file listing from HuggingFace with cache."""
        pack = PACKS.get(pack_key)
        if not pack:
            return []
        if pack.get("static_items"):
            return []

        now = time.time()
        cached = self._catalog_cache.get(pack_key)
        if cached and (now - cached[0]) < self._cache_ttl:
            return cached[1]

        repo     = pack["hf_repo"]
        hf_type  = pack["hf_type"]
        api_url  = (
            f"https://huggingface.co/api/datasets/{repo}/tree/main"
            if hf_type == "dataset"
            else f"https://huggingface.co/api/models/{repo}/tree/main"
        )

        try:
            resp = requests.get(api_url, timeout=15, headers=self._hf_headers())
            resp.raise_for_status()
            items = resp.json()
            safetensors = [
                item for item in items
                if isinstance(item, dict) and item.get("path", "").lower().endswith(".safetensors")
            ]
            self._catalog_cache[pack_key] = (now, safetensors)
            return safetensors
        except Exception as exc:
            print(f"[LoRAService] HF fetch failed for '{pack_key}': {exc}")
            # Return stale data if available rather than nothing
            return self._catalog_cache.get(pack_key, (0, []))[1]

    # ─── Install scanning ───────────────────────────────────────────────────

    def get_installed(self) -> Dict[str, Any]:
        """Recursively scan the loras directory and return {normalized_rel_path: info}.

        Keyed by normalized relative path, NOT bare filename: the same filename
        legitimately exists in several folders (e.g. lightx2v_* lives in both the
        root and wan/), and bare-name keys silently dropped all but the last.

        info["path"] keeps the native relative path verbatim — it is what ComfyUI
        expects and what every workflow's LoRA dropdown stores. Do not normalize it.

        Junction/symlink-loop safe: users link external LoRA stashes into the
        loras dir (symlink_modelfolder.bat), and a bad link can create an infinite
        directory cycle that made pathlib.rglob crash with WinError 1921.
        We walk manually and prune any directory whose real path was already
        visited."""
        result: Dict[str, Any] = {}
        if not self.lora_dir.exists():
            return result
        seen_real: set = set()
        for root, dirs, files in os.walk(self.lora_dir):
            try:
                real = os.path.realpath(root)
            except OSError:
                dirs[:] = []
                continue
            if real in seen_real:
                dirs[:] = []  # loop detected - do not descend
                continue
            seen_real.add(real)
            for name in files:
                if not name.lower().endswith(".safetensors"):
                    continue
                f = Path(root) / name
                try:
                    rel = str(f.relative_to(self.lora_dir))
                    st = f.stat()
                    parent = str(Path(rel).parent)
                    result[_normalize_lora_path(rel)] = {
                        "path":    rel,
                        "name":    f.name,
                        # Forward slashes for consistency, but case preserved: this
                        # is used as a display name and to build real paths, and
                        # Linux (RunPod) is case-sensitive.
                        "folder":  parent.replace("\\", "/") if parent != "." else "",
                        "size_mb": round(st.st_size / (1024 * 1024), 1),
                        "mtime":   st.st_mtime,
                        "is_link": _is_link(f),
                    }
                except Exception:
                    pass
        return result

    def list_lora_names(self) -> List[str]:
        """Return relative paths of installed LoRAs for use in ComfyUI (relative to loras dir)."""
        return [info["path"] for info in self.get_installed().values()]

    # ─── Characters ─────────────────────────────────────────────────────────

    def get_characters(self) -> List[Dict[str, Any]]:
        """Group installed LoRAs into characters.

        A character is a folder of LoRAs that belong to one person, usually across
        several model families (Aurora = a krea2 LoRA + a z-image one) sharing a
        single .md sheet.

        Detection is a union of two rules, because neither covers everything:

        - **a lone .md**: a folder holding exactly one .md plus at least one
          .safetensors. This is the portable rule — it describes itself, so it
          works whatever a user names their folders. But it only finds characters
          that actually have a sheet (8 of 20 here).
        - **under app/**: the existing convention in this install. Structurally
          `app/Emily/` (a character) and `qwen/` (a family folder) are identical —
          both are just folders of .safetensors — so without a sheet, the `app/`
          parent is the only signal that Emily is a person. Keeps the other 12.

        The loras root is never a character: it has 57 .safetensors and 2 .md that
        belong to individual LoRAs, and would otherwise collapse into one giant
        bogus character.
        """
        installed = self.get_installed()

        by_folder: Dict[str, List[Dict[str, Any]]] = {}
        for info in installed.values():
            folder = info.get("folder") or ""
            if not folder:
                continue  # root LoRAs are never characters
            by_folder.setdefault(folder, []).append(info)

        characters: List[Dict[str, Any]] = []
        for folder, loras in by_folder.items():
            fs_dir = self._lora_fs_path(folder)
            try:
                mds = [p for p in fs_dir.glob("*.md") if p.is_file()]
            except OSError:
                mds = []

            # Direct child of app/ only: `app/Juna/New folder` holds 10 loose LoRAs
            # and is not a person — a bare startswith would name a character
            # "New folder".
            parts = folder.split("/")
            under_app = len(parts) == 2 and parts[0].lower() == "app"
            has_lone_sheet = len(mds) == 1
            if not (under_app or has_lone_sheet):
                continue

            sheet = mds[0] if has_lone_sheet else None
            characters.append({
                "name": folder.split("/")[-1],
                "folder": folder,
                "sheet": str(sheet.relative_to(self.lora_dir)) if sheet else None,
                "has_sheet": sheet is not None,
                "loras": sorted(
                    ({"path": l["path"], "file": l["name"], "size_mb": l["size_mb"]} for l in loras),
                    key=lambda x: x["file"].lower(),
                ),
            })

        return sorted(characters, key=lambda c: c["name"].lower())

    # ─── Pack catalog & status ──────────────────────────────────────────────

    def get_pack_catalog(self, pack_key: str, limit: int = 1000) -> Dict[str, Any]:
        if pack_key not in PACKS:
            return {"success": False, "error": "Unknown pack"}

        pack = PACKS[pack_key]
        installed = self.get_installed()

        items: List[Dict[str, Any]] = []
        dest_subfolder = pack.get("dest", "") or ""

        if pack.get("static_items"):
            for item in pack.get("static_items", [])[:limit]:
                raw_file = item.get("file", "")
                if not raw_file:
                    continue
                # Ensure the file field includes the correct subfolder for this pack
                filename = f"{dest_subfolder}/{raw_file}" if dest_subfolder and not raw_file.startswith(dest_subfolder + "/") else raw_file
                basename = Path(raw_file).stem
                items.append({
                    "name":        item.get("name") or basename.replace("_", " "),
                    "file":        filename,
                    "installed":   _normalize_lora_path(filename) in installed,
                    "size_mb":     item.get("size_mb"),
                    "preview_url": item.get("preview_url"),
                })
        else:
            hf_files = self._fetch_hf_catalog(pack_key)
            for hf_item in hf_files[:limit]:
                raw_name = Path(hf_item.get("path", "")).name
                if not raw_name:
                    continue
                # Prefix with the destination subfolder so the name matches what ComfyUI reports
                filename = f"{dest_subfolder}/{raw_name}" if dest_subfolder else raw_name
                basename = Path(raw_name).stem
                size_bytes = hf_item.get("size", 0)

                items.append({
                    "name":        basename.replace("_", " "),
                    "file":        filename,
                    "installed":   _normalize_lora_path(filename) in installed,
                    "size_mb":     round(size_bytes / (1024 * 1024), 1) if size_bytes else None,
                    "preview_url": self._preview_url(pack_key, basename),
                })

        # Installed first, then alphabetical
        items.sort(key=lambda x: (not x["installed"], x["name"].lower()))

        return {
            "success":   True,
            "pack_key":  pack_key,
            "total":     len(items),
            "installed": sum(1 for i in items if i["installed"]),
            "items":     items,
        }

    def get_pack_status(self, pack_key: str) -> Dict[str, Any]:
        if pack_key not in PACKS:
            return {"success": False, "error": "Unknown pack"}

        with self._lock:
            active = [
                fn for fn, d in self._downloads.items()
                if d.get("status") == "downloading" and d.get("pack_key") == pack_key
            ]

        catalog = self.get_pack_catalog(pack_key)
        return {
            "success":          True,
            "pack_key":         pack_key,
            "status":           "running" if active else "idle",
            "active_downloads": len(active),
            "installed":        catalog.get("installed", 0),
            "total":            catalog.get("total", 0),
        }

    # ─── Download helpers ───────────────────────────────────────────────────

    def get_download_status(self, filename: str) -> Dict[str, Any]:
        with self._lock:
            return dict(self._downloads.get(filename, {"status": "idle", "progress": 0}))

    def _do_download(
        self,
        url: str,
        dest: Path,
        filename: str,
        pack_key: Optional[str] = None,
        hf_token: Optional[str] = None,
        civitai_token: Optional[str] = None,
    ) -> None:
        with self._lock:
            self._downloads[filename] = {"status": "downloading", "progress": 0, "pack_key": pack_key}
        try:
            dest.parent.mkdir(parents=True, exist_ok=True)
            headers = {}
            if hf_token:
                headers["Authorization"] = f"Bearer {hf_token}"

            resolved_url = self._resolve_download_url(url, hf_token=hf_token, civitai_token=civitai_token)
            resp = requests.get(resolved_url, stream=True, timeout=60, headers=headers)
            resp.raise_for_status()

            total      = int(resp.headers.get("content-length", 0))
            downloaded = 0

            with open(dest, "wb") as fh:
                for chunk in resp.iter_content(65536):
                    if chunk:
                        fh.write(chunk)
                        downloaded += len(chunk)
                        if total and downloaded % (1024 * 1024) < 65536:  # ~1 MB intervals
                            prog = int(downloaded / total * 100)
                            with self._lock:
                                self._downloads[filename]["progress"] = prog

            with self._lock:
                self._downloads[filename] = {"status": "completed", "progress": 100, "pack_key": pack_key}

        except Exception as exc:
            with self._lock:
                self._downloads[filename] = {"status": "error", "progress": 0, "error": str(exc), "pack_key": pack_key}
            if dest.exists():
                try:
                    dest.unlink()
                except Exception:
                    pass

    def download_single(self, pack_key: str, filename: str) -> Dict[str, Any]:
        if pack_key not in PACKS:
            return {"success": False, "error": "Unknown pack"}
        pack = PACKS[pack_key]
        dest = self.lora_dir / pack["dest"] / filename
        if dest.exists() and dest.stat().st_size > 10_000:
            return {"success": True, "status": "already_installed"}
        url = self._hf_file_url(pack_key, filename)
        if not url:
            return {"success": False, "error": "No download URL found for item"}
        threading.Thread(
            target=self._do_download,
            args=(url, dest, filename, pack_key),
            daemon=True,
        ).start()
        return {"success": True, "status": "started"}

    def sync_pack(self, pack_key: str) -> Dict[str, Any]:
        """Queue download of every file in a pack that isn't already installed."""
        if pack_key not in PACKS:
            return {"success": False, "error": "Unknown pack"}
        catalog  = self.get_pack_catalog(pack_key)
        pending  = [item for item in catalog.get("items", []) if not item["installed"]]
        pack     = PACKS[pack_key]

        def _task() -> None:
            for item in pending:
                dest = self.lora_dir / pack["dest"] / item["file"]
                url  = self._hf_file_url(pack_key, item["file"])
                if not url:
                    continue
                self._do_download(url, dest, item["file"], pack_key)

        threading.Thread(target=_task, daemon=True).start()
        return {"success": True, "queued": len(pending)}

    # ─── Free starter pack ──────────────────────────────────────────────────

    def install_free_lora(self, filename: str) -> Dict[str, Any]:
        lora = next((l for l in FREE_LORAS if l["filename"] == filename), None)
        if not lora:
            return {"success": False, "error": "Unknown free LoRA"}
        dest = self.lora_dir / "starter" / filename
        if dest.exists() and dest.stat().st_size > 10_000:
            return {"success": True, "status": "already_installed"}
        threading.Thread(
            target=self._do_download,
            args=(lora["url"], dest, filename, "starter"),
            daemon=True,
        ).start()
        return {"success": True, "status": "started"}

    def install_all_free(self) -> Dict[str, Any]:
        installed = self.get_installed()
        queued = 0
        for lora in FREE_LORAS:
            if lora["filename"] not in installed:
                self.install_free_lora(lora["filename"])
                queued += 1
        return {"success": True, "queued": queued}

    # ─── URL import ─────────────────────────────────────────────────────────

    def import_from_url(
        self,
        url: str,
        hf_token: Optional[str] = None,
        civitai_token: Optional[str] = None,
        dest_subfolder: str = "imported",
    ) -> Dict[str, Any]:
        raw_name = url.split("?")[0].split("/")[-1]
        filename = raw_name if raw_name.endswith(".safetensors") else raw_name + ".safetensors"
        job_id   = str(uuid.uuid4())[:8]
        subfolder = _normalize_lora_path(dest_subfolder) or "imported"
        dest     = self.lora_dir / subfolder / filename
        rel      = f"{subfolder}/{filename}"

        with self._lock:
            self._import_jobs[job_id] = {"status": "queued", "progress": 0, "filename": filename, "path": rel}

        def _task() -> None:
            with self._lock:
                self._import_jobs[job_id]["status"] = "downloading"
            # Download to a sidecar and only promote on a complete transfer, so an
            # interrupted import can never leave a truncated file that later looks
            # like a valid LoRA (same pattern as model_downloader.download_direct).
            tmp = dest.with_suffix(dest.suffix + ".fedda_tmp")
            try:
                dest.parent.mkdir(parents=True, exist_ok=True)
                direct = url.replace("/blob/", "/resolve/") if "/blob/" in url else url
                direct = self._resolve_download_url(direct, hf_token=hf_token, civitai_token=civitai_token)
                headers = self._hf_headers(hf_token)

                resp  = requests.get(direct, stream=True, timeout=60, headers=headers)
                resp.raise_for_status()
                total = int(resp.headers.get("content-length", 0))
                done  = 0

                with open(tmp, "wb") as fh:
                    for chunk in resp.iter_content(65536):
                        if chunk:
                            fh.write(chunk)
                            done += len(chunk)
                            if total and done % (1024 * 1024) < 65536:
                                with self._lock:
                                    self._import_jobs[job_id]["progress"] = int(done / total * 100)

                if total and done < total:
                    raise IOError(f"Download truncated: got {done} of {total} bytes")

                if dest.exists():
                    dest.unlink()
                tmp.rename(dest)

                with self._lock:
                    self._import_jobs[job_id] = {
                        "status": "completed", "progress": 100, "filename": filename, "path": rel,
                    }

            except Exception as exc:
                with self._lock:
                    self._import_jobs[job_id] = {
                        "status": "error", "message": str(exc), "filename": filename, "path": rel,
                    }
                # Only the sidecar is ours to remove; never touch an existing dest.
                try:
                    if tmp.exists():
                        tmp.unlink()
                except OSError:
                    pass

        threading.Thread(target=_task, daemon=True).start()
        return {"success": True, "job_id": job_id, "filename": filename}

    def get_import_status(self, job_id: str) -> Dict[str, Any]:
        with self._lock:
            job = self._import_jobs.get(job_id)
        if not job:
            return {"success": False, "error": "Job not found"}
        return {"success": True, **job}


lora_service = LoRAService(Path(__file__).parent.parent)
