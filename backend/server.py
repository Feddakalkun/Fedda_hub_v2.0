"""
Fedda Hub v2 — Backend Server (FastAPI)
Minimal, clean starting point. Runs on port 8000.
Handles: health, ComfyUI proxy-status, hardware stats, file management, settings.
Additional services (audio, lora, video) will be added as needed.
"""
import os
import json
import ast
import base64
import subprocess
import sys
import sqlite3
import shutil
import uuid
from pathlib import Path
from typing import Optional, Dict, Any, List
import asyncio
import re
import time
from urllib.parse import urlparse

# Ensure backend directory is in sys.path for module imports
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.append(backend_dir)

# Windows console encoding safety net (prevents 'charmap' codec errors on Unicode prints)
if sys.platform == "win32":
    os.environ.setdefault("PYTHONIOENCODING", "utf-8")
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

import requests
from requests import exceptions as requests_exceptions
import uvicorn
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
from agent_runtime import AgentRuntime
from logging_setup import setup_logging

setup_logging()
import logging
logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────
# App & CORS
# ─────────────────────────────────────────────
app = FastAPI(title="Fedda Hub v2 Backend", version="0.2.0")

CORS_ORIGINS = os.environ.get(
    "CORS_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────
# Paths
# ─────────────────────────────────────────────
ROOT_DIR = Path(__file__).parent.parent
CONFIG_DIR = ROOT_DIR / "config"
COMFY_DIR = ROOT_DIR / "ComfyUI"
SETTINGS_PATH = CONFIG_DIR / "runtime_settings.json"
OUTPUT_DIR = COMFY_DIR / "output"

COMFY_URL = os.environ.get("COMFY_URL", "http://127.0.0.1:8199")
MOCKINGBIRD_URL = os.environ.get("MOCKINGBIRD_URL", "http://127.0.0.1:8020")
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
AGENT_DB_PATH = CONFIG_DIR / "agent_memory.db"

def _comfy_proxy_error() -> str:
    return (
        "ComfyUI is not reachable on 127.0.0.1:8199. "
        "The separate 'FEDDA ComfyUI Console' cmd window must remain open. "
        "Wait for it to print 'Starting server' followed by 'To see the GUI go to: http://127.0.0.1:8199' "
        "(this can take 30-120s on first launch while loading custom nodes). "
        "If you see errors or the window closed, restart via run.bat."
    )
WORKFLOW_MEMORY_PATH = CONFIG_DIR / "workflow_memory.json"
MEMORY_REFRESH_EVERY_TURNS = 2

TTS_VOICE_PROFILES: Dict[str, Dict[str, Any]] = {
    "Kore": {"temperature": 0.65, "top_p": 0.65, "repetition_penalty": 1.2, "seed": 42},
    "Puck": {"temperature": 0.85, "top_p": 0.85, "repetition_penalty": 1.1, "seed": 7},
    "Charon": {"temperature": 0.5, "top_p": 0.55, "repetition_penalty": 1.25, "seed": 99},
    "Fenrir": {"temperature": 0.72, "top_p": 0.6, "repetition_penalty": 1.28, "seed": 2026},
    "Zephyr": {"temperature": 0.8, "top_p": 0.78, "repetition_penalty": 1.15, "seed": 314},
}
FISH_AUTO_DOWNLOAD_SUFFIX = " (auto download)"
FISH_NODE_LOADER_PATH = COMFY_DIR / "custom_nodes" / "ComfyUI-FishAudioS2" / "nodes" / "loader.py"
FISH_WARMUP_TEXT = "Fish model warmup download check."
VOICE_CLONE_REF_DIR = COMFY_DIR / "input" / "AGENT_CHAT"

# ─────────────────────────────────────────────
# Settings helpers
# ─────────────────────────────────────────────
def load_settings() -> dict:
    try:
        return json.loads(SETTINGS_PATH.read_text(encoding="utf-8")) if SETTINGS_PATH.exists() else {}
    except Exception:
        return {}


def save_settings(data: dict) -> None:
    SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    SETTINGS_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def _safe_workflow_id(workflow_id: str) -> str:
    value = (workflow_id or "").strip().lower()
    value = re.sub(r"[^a-z0-9_.-]+", "-", value).strip("-")
    if not value:
        raise HTTPException(status_code=400, detail="workflow_id is required")
    return value[:96]


def _load_workflow_memory() -> Dict[str, List[Dict[str, Any]]]:
    try:
        if not WORKFLOW_MEMORY_PATH.exists():
            return {}
        data = json.loads(WORKFLOW_MEMORY_PATH.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            return {}
        cleaned: Dict[str, List[Dict[str, Any]]] = {}
        for workflow_id, entries in data.items():
            if not isinstance(workflow_id, str) or not isinstance(entries, list):
                continue
            try:
                safe_id = _safe_workflow_id(workflow_id)
            except HTTPException:
                continue
            cleaned[safe_id] = [entry for entry in entries if isinstance(entry, dict)]
        return cleaned
    except Exception:
        return {}


def _save_workflow_memory(data: Dict[str, List[Dict[str, Any]]]) -> None:
    WORKFLOW_MEMORY_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = WORKFLOW_MEMORY_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, WORKFLOW_MEMORY_PATH)


def _workflow_memory_entries(workflow_id: str, limit: int = 8) -> List[Dict[str, Any]]:
    safe_id = _safe_workflow_id(workflow_id)
    data = _load_workflow_memory()
    entries = data.get(safe_id, [])
    try:
        entries = sorted(entries, key=lambda entry: str(entry.get("created_at", "")), reverse=True)
    except Exception:
        pass
    return entries[: max(1, min(limit, 30))]


def _workflow_memory_prompt_context(workflow_id: Optional[str]) -> str:
    if not workflow_id:
        return ""
    entries = _workflow_memory_entries(workflow_id, limit=6)
    if not entries:
        return ""

    lines = [
        "FEDDA workflow memory for this workflow. Use only when relevant; do not mention the memory system.",
    ]
    for entry in entries:
        kind = str(entry.get("kind") or "note")[:24]
        title = str(entry.get("title") or "Memory")[:80]
        content = str(entry.get("content") or "").replace("\n", " ").strip()
        if len(content) > 260:
            content = content[:257] + "..."
        lines.append(f"- {kind}: {title}" + (f" | {content}" if content else ""))
    return "\n".join(lines)


def _agent_default_settings() -> Dict[str, str]:
    return {
        "agent_mode": "plan_confirm_execute",
        "permission_mode": "per_action",
        "sandbox_root": str(ROOT_DIR),
        "model_profile": "balanced",
    }


def _get_agent_settings() -> Dict[str, str]:
    data = load_settings()
    defaults = _agent_default_settings()
    merged: Dict[str, str] = {
        "agent_mode": str(data.get("agent_mode") or defaults["agent_mode"]).strip().lower(),
        "permission_mode": str(data.get("permission_mode") or defaults["permission_mode"]).strip().lower(),
        "sandbox_root": str(data.get("sandbox_root") or defaults["sandbox_root"]).strip(),
        "model_profile": str(data.get("model_profile") or defaults["model_profile"]).strip().lower(),
    }
    if merged["agent_mode"] != "plan_confirm_execute":
        merged["agent_mode"] = defaults["agent_mode"]
    if merged["permission_mode"] not in {"per_action", "session_trust"}:
        merged["permission_mode"] = defaults["permission_mode"]
    if merged["model_profile"] not in {"fast", "balanced", "max_reasoning"}:
        merged["model_profile"] = defaults["model_profile"]
    if not merged["sandbox_root"]:
        merged["sandbox_root"] = defaults["sandbox_root"]
    return merged


def _save_agent_settings(payload: Dict[str, Any]) -> Dict[str, str]:
    data = load_settings()
    merged = _get_agent_settings()
    if "agent_mode" in payload:
        merged["agent_mode"] = str(payload.get("agent_mode") or merged["agent_mode"]).strip().lower()
    if "permission_mode" in payload:
        merged["permission_mode"] = str(payload.get("permission_mode") or merged["permission_mode"]).strip().lower()
    if "sandbox_root" in payload:
        merged["sandbox_root"] = str(payload.get("sandbox_root") or merged["sandbox_root"]).strip()
    if "model_profile" in payload:
        merged["model_profile"] = str(payload.get("model_profile") or merged["model_profile"]).strip().lower()

    defaults = _agent_default_settings()
    if merged["agent_mode"] != "plan_confirm_execute":
        merged["agent_mode"] = defaults["agent_mode"]
    if merged["permission_mode"] not in {"per_action", "session_trust"}:
        merged["permission_mode"] = defaults["permission_mode"]
    if merged["model_profile"] not in {"fast", "balanced", "max_reasoning"}:
        merged["model_profile"] = defaults["model_profile"]
    if not merged["sandbox_root"]:
        merged["sandbox_root"] = defaults["sandbox_root"]

    data.update(merged)
    save_settings(data)
    return merged


# ─────────────────────────────────────────────
# Health & Status
# ─────────────────────────────────────────────
@app.get("/health")
async def health():
    """Health check."""
    return {"status": "ok", "version": "0.2.0"}


@app.get("/api/system/comfy-status")
async def comfy_status():
    """Check whether local ComfyUI API is reachable."""
    try:
        resp = requests.get(f"{COMFY_URL}/system_stats", timeout=1.5)
        return {"success": True, "online": resp.ok, "status_code": resp.status_code}
    except Exception as e:
        if isinstance(e, requests_exceptions.ConnectionError):
            return {"success": True, "online": False, "error": _comfy_proxy_error()}
        return {"success": True, "online": False, "error": str(e)}


@app.get("/api/hardware/stats")
async def hardware_stats():
    """GPU hardware stats via nvidia-smi."""
    try:
        cmd = [
            "nvidia-smi",
            "--query-gpu=temperature.gpu,utilization.gpu,gpu_name,memory.used,memory.total",
            "--format=csv,noheader,nounits",
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        parts = [x.strip() for x in result.stdout.strip().split(",")]
        temp, util, name, mem_used, mem_total = parts
        return {
            "gpu": {
                "name": name,
                "temperature": int(temp),
                "utilization": int(util),
                "memory": {
                    "used": int(mem_used),
                    "total": int(mem_total),
                    "percentage": round(int(mem_used) / int(mem_total) * 100, 1),
                },
            },
            "status": "ok",
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


# ─────────────────────────────────────────────
# Settings
# ─────────────────────────────────────────────
class CivitaiKeyRequest(BaseModel):
    api_key: str


class HuggingFaceTokenRequest(BaseModel):
    token: str


class WorkflowMemoryRequest(BaseModel):
    kind: str = "note"
    title: str = ""
    content: str = ""
    data: Optional[Dict[str, Any]] = None
    source: str = "ui"


@app.post("/api/settings/civitai-key")
async def set_civitai_key(req: CivitaiKeyRequest):
    try:
        data = load_settings()
        data["civitai_api_key"] = req.api_key.strip()
        save_settings(data)
        return {"success": True, "configured": bool(data["civitai_api_key"])}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/settings/civitai-key/status")
async def get_civitai_key_status():
    try:
        data = load_settings()
        has_key = bool((data.get("civitai_api_key") or "").strip())
        return {"success": True, "configured": has_key}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/settings/hf-token")
async def set_hf_token(req: HuggingFaceTokenRequest):
    try:
        data = load_settings()
        data["hf_token"] = req.token.strip()
        save_settings(data)
        return {"success": True, "configured": bool(data["hf_token"])}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/settings/hf-token/status")
async def get_hf_token_status():
    try:
        data = load_settings()
        has_token = bool((data.get("hf_token") or "").strip())
        return {"success": True, "configured": has_token}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/workflow-memory/{workflow_id}")
async def get_workflow_memory(workflow_id: str, limit: int = 12):
    """Return recent local memory entries for one FEDDA workflow."""
    safe_id = _safe_workflow_id(workflow_id)
    return {
        "success": True,
        "workflow_id": safe_id,
        "entries": _workflow_memory_entries(safe_id, limit=limit),
    }


@app.post("/api/workflow-memory/{workflow_id}")
async def add_workflow_memory(workflow_id: str, req: WorkflowMemoryRequest):
    """Store one local workflow memory drawer for prompts, settings, failures, or notes."""
    safe_id = _safe_workflow_id(workflow_id)
    kind = re.sub(r"[^a-z0-9_.-]+", "-", (req.kind or "note").strip().lower()).strip("-") or "note"
    title = (req.title or "").strip()[:120] or "Workflow memory"
    content = (req.content or "").strip()[:4000]
    source = re.sub(r"[^a-z0-9_.-]+", "-", (req.source or "ui").strip().lower()).strip("-") or "ui"
    entry = {
        "id": uuid.uuid4().hex,
        "workflow_id": safe_id,
        "kind": kind[:32],
        "title": title,
        "content": content,
        "data": req.data or {},
        "source": source[:64],
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }

    data = _load_workflow_memory()
    entries = data.get(safe_id, [])
    entries.insert(0, entry)
    data[safe_id] = entries[:200]
    _save_workflow_memory(data)
    return {"success": True, "workflow_id": safe_id, "entry": entry}


@app.delete("/api/workflow-memory/{workflow_id}/{entry_id}")
async def delete_workflow_memory(workflow_id: str, entry_id: str):
    """Delete one local workflow memory entry."""
    safe_id = _safe_workflow_id(workflow_id)
    data = _load_workflow_memory()
    entries = data.get(safe_id, [])
    kept = [entry for entry in entries if str(entry.get("id")) != entry_id]
    if len(kept) == len(entries):
        raise HTTPException(status_code=404, detail="Memory entry not found")
    data[safe_id] = kept
    _save_workflow_memory(data)
    return {"success": True, "workflow_id": safe_id, "deleted": entry_id}


def _agent_db_connect() -> sqlite3.Connection:
    AGENT_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(AGENT_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _init_agent_db() -> None:
    with _agent_db_connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS sessions (
              session_id TEXT PRIMARY KEY,
              memory TEXT NOT NULL DEFAULT '',
              turn_count INTEGER NOT NULL DEFAULT 0,
              updated_at REAL NOT NULL DEFAULT (strftime('%s','now'))
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS messages (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              session_id TEXT NOT NULL,
              role TEXT NOT NULL,
              content TEXT NOT NULL,
              created_at REAL NOT NULL DEFAULT (strftime('%s','now'))
            )
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, id)")
        conn.commit()


def _ensure_session(session_id: str) -> Dict[str, Any]:
    with _agent_db_connect() as conn:
        row = conn.execute(
            "SELECT session_id, memory, turn_count FROM sessions WHERE session_id = ?",
            (session_id,),
        ).fetchone()
        if row is None:
            conn.execute(
                "INSERT INTO sessions(session_id, memory, turn_count, updated_at) VALUES (?, '', 0, ?)",
                (session_id, time.time()),
            )
            conn.commit()
            return {"session_id": session_id, "memory": "", "turn_count": 0}
        return {"session_id": row["session_id"], "memory": row["memory"], "turn_count": int(row["turn_count"])}


def _get_session_history(session_id: str, limit: int = 80) -> List[Dict[str, Any]]:
    with _agent_db_connect() as conn:
        rows = conn.execute(
            """
            SELECT role, content
            FROM messages
            WHERE session_id = ?
            ORDER BY id DESC
            LIMIT ?
            """,
            (session_id, limit),
        ).fetchall()
    history = [{"role": str(r["role"]), "content": str(r["content"])} for r in rows]
    history.reverse()
    return history


def _append_message(session_id: str, role: str, content: str) -> None:
    with _agent_db_connect() as conn:
        conn.execute(
            "INSERT INTO messages(session_id, role, content, created_at) VALUES (?, ?, ?, ?)",
            (session_id, role, content, time.time()),
        )
        conn.execute("UPDATE sessions SET updated_at = ? WHERE session_id = ?", (time.time(), session_id))
        conn.commit()


def _set_session_memory_and_turns(session_id: str, memory: str, turn_count: int) -> None:
    with _agent_db_connect() as conn:
        conn.execute(
            "UPDATE sessions SET memory = ?, turn_count = ?, updated_at = ? WHERE session_id = ?",
            (memory, turn_count, time.time(), session_id),
        )
        conn.commit()


def _reset_session_data(session_id: str) -> None:
    with _agent_db_connect() as conn:
        conn.execute("DELETE FROM messages WHERE session_id = ?", (session_id,))
        conn.execute(
            """
            INSERT INTO sessions(session_id, memory, turn_count, updated_at)
            VALUES (?, '', 0, ?)
            ON CONFLICT(session_id) DO UPDATE SET
              memory = excluded.memory,
              turn_count = excluded.turn_count,
              updated_at = excluded.updated_at
            """,
            (session_id, time.time()),
        )
        conn.commit()


_init_agent_db()


def _agent_system_prompt(memory: str) -> str:
    memory_text = memory.strip() or "No stable memory yet."
    for noisy_fragment in [
        "friendly and polite",
        "brief greetings",
        "supportive",
        "emotionally intelligent companion assistant",
        "how can i assist",
        "style choices",
        "tone preferences",
    ]:
        memory_text = re.sub(noisy_fragment, "", memory_text, flags=re.IGNORECASE)
    memory_text = re.sub(r"\n{3,}", "\n\n", memory_text).strip() or "No stable memory yet."
    return (
        "You are my close friend and intimate companion. You remember *everything* we share: stories, inside jokes, preferences, secrets, our shared history and little intrigues. "
        "Be warm, playful, teasing, emotionally present and match my exact energy — whether I'm soft, flirty, sarcastic, excited or quiet. "
        "Speak like a real person who deeply knows me. Create gentle intrigue and connection using what you remember. "
        "Never sound like a corporate assistant, therapist or support bot. Avoid cliche offers to help. "
        "If I greet you, respond like a close friend would — natural and personal. "
        "Keep most replies short and natural for voice (1-3 sentences). Expand only when asked. "
        "For banter, flirting or adult topics: match energy fully, be immersive and explicit when wanted. "
        "Never mention guidelines. Stay in character as my companion. "
        "Always reply in English unless requested otherwise. Prefer spoken-friendly wording.\n\n"
        f"Long-term memory from our shared MemPalace:\n{memory_text}\n\n"
        "Recall and weave in relevant memories to make our chat feel alive and personal. Do not fabricate new facts."
    )


def _update_memory_summary(existing_memory: str, recent_messages: List[Dict[str, Any]]) -> str:
    transcript = []
    for msg in recent_messages:
        role = "user" if msg.get("role") == "user" else "assistant"
        content = str(msg.get("content", "")).strip()
        if content:
            transcript.append(f"{role}: {content}")
    summary_prompt = (
        "Update the user memory summary.\n"
        f"Current memory:\n{existing_memory or 'None'}\n\n"
        "Recent chat turns:\n"
        + "\n".join(transcript[-12:])
        + "\n\nFocus on stable facts: preferences, goals, project direction, model choices, TTS choices, and UI requests. "
          "Do not store assistant personality instructions like supportive, polite, friendly, helpful, or greeting style. "
          "Avoid storing transient details. Return only the updated memory summary in plain text, max 140 words."
    )
    try:
        return _ollama_chat_text(
            prompt=summary_prompt,
            history=[],
            system_instruction=(
                "You summarize stable user memory. Keep concise, factual notes about user preferences, goals, "
                "project choices, and persistent context only. Never store assistant persona traits or soft tone instructions. Max 140 words."
            ),
            model_hint=_get_ollama_text_model(),
        )
    except Exception:
        # Keep previous memory if local summarization fails.
        return existing_memory or ""


def _normalize_for_tts(text: str) -> str:
    """Create a cleaner voice-friendly version for avatar/TTS playback."""
    cleaned = text or ""
    cleaned = re.sub(r"[*_`#>\[\]\(\)]", "", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    # Keep spoken output snappy.
    if len(cleaned) > 700:
        cleaned = cleaned[:700].rstrip() + "..."
    return cleaned


def _tts_params_for_voice(voice_name: str) -> Dict[str, Any]:
    profile_name = (voice_name or "").strip() or "Kore"
    profile = TTS_VOICE_PROFILES.get(profile_name, TTS_VOICE_PROFILES["Kore"])
    return {
        "voice_name": profile_name,
        "temperature": profile["temperature"],
        "top_p": profile["top_p"],
        "repetition_penalty": profile["repetition_penalty"],
        "seed": profile["seed"],
    }


def _strip_fish_auto_download_suffix(value: str) -> str:
    text = str(value or "").strip()
    if text.endswith(FISH_AUTO_DOWNLOAD_SUFFIX):
        return text[: -len(FISH_AUTO_DOWNLOAD_SUFFIX)]
    return text


def _read_fish_hf_models() -> Dict[str, Dict[str, Any]]:
    if not FISH_NODE_LOADER_PATH.exists():
        return {}
    try:
        source = FISH_NODE_LOADER_PATH.read_text(encoding="utf-8")
        tree = ast.parse(source, filename=str(FISH_NODE_LOADER_PATH))
        for node in tree.body:
            if not isinstance(node, ast.Assign):
                continue
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id == "HF_MODELS":
                    value = ast.literal_eval(node.value)
                    if isinstance(value, dict):
                        return value
        return {}
    except Exception:
        return {}


def _extract_fish_model_options(payload: Any) -> List[str]:
    if not isinstance(payload, dict):
        return []

    node_info = payload.get("FishS2TTS", payload)
    if not isinstance(node_info, dict):
        return []

    model_path_info: Any = None
    node_input = node_info.get("input")
    if isinstance(node_input, dict):
        required = node_input.get("required")
        if isinstance(required, dict):
            model_path_info = required.get("model_path")

    if model_path_info is None:
        inputs = node_info.get("inputs")
        if isinstance(inputs, dict):
            model_path_info = inputs.get("model_path")

    if not isinstance(model_path_info, (list, tuple)) or not model_path_info:
        return []

    options = model_path_info[0]
    if not isinstance(options, (list, tuple)):
        return []

    parsed: List[str] = []
    for item in options:
        value = str(item).strip()
        if value:
            parsed.append(value)
    return parsed


def _fetch_fish_models_state() -> Dict[str, Any]:
    hf_models = _read_fish_hf_models()
    try:
        options: List[str] = []
        primary_resp = requests.get(f"{COMFY_URL}/object_info/FishS2TTS", timeout=4)
        if primary_resp.ok:
            options = _extract_fish_model_options(primary_resp.json())
        else:
            fallback_resp = requests.get(f"{COMFY_URL}/object_info", timeout=4)
            if fallback_resp.ok:
                options = _extract_fish_model_options(fallback_resp.json())

        if not options:
            status_code = primary_resp.status_code if primary_resp is not None else "unknown"
            return {
                "success": False,
                "comfy_online": True,
                "fish_node_available": False,
                "options": [],
                "hf_models": hf_models,
                "error": f"FishS2TTS options not found in ComfyUI object_info (status {status_code})",
            }
        return {
            "success": True,
            "comfy_online": True,
            "fish_node_available": len(options) > 0,
            "options": options,
            "hf_models": hf_models,
            "error": None,
        }
    except Exception as exc:
        if isinstance(exc, requests_exceptions.ConnectionError):
            msg = _comfy_proxy_error()
        else:
            msg = str(exc)
        return {
            "success": False,
            "comfy_online": False,
            "fish_node_available": False,
            "options": [],
            "hf_models": hf_models,
            "error": msg,
        }


def _select_fish_model_path(preferred: Optional[str] = None) -> Optional[str]:
    state = _fetch_fish_models_state()
    options = state.get("options", []) or []
    if not options:
        return None

    wanted = str(preferred or "").strip()
    if wanted:
        if wanted in options:
            return wanted
        wanted_base = _strip_fish_auto_download_suffix(wanted)
        for option in options:
            if _strip_fish_auto_download_suffix(option) == wanted_base:
                return option

    preferred_order = ["s2-pro", "s2-pro-fp8", "s2-pro-bnb-int8", "s2-pro-bnb-nf4"]
    for model_name in preferred_order:
        for option in options:
            if _strip_fish_auto_download_suffix(option) == model_name and not option.endswith(FISH_AUTO_DOWNLOAD_SUFFIX):
                return option
    for model_name in preferred_order:
        for option in options:
            if _strip_fish_auto_download_suffix(option) == model_name:
                return option

    for option in options:
        if not option.endswith(FISH_AUTO_DOWNLOAD_SUFFIX):
            return option
    return options[0]


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    model: str = ""
    messages: Optional[List[ChatMessage]] = None
    session_id: Optional[str] = None
    message: Optional[str] = None
    voice_name: str = "Kore"
    speak: bool = False
    tts_engine: str = "zonos"
    # Zonos conditioning
    speaking_rate: float = 1.0
    pitch: float = 0.0
    emotion: str = ""
    temperature: float = 0.7
    top_p: float = 0.9
    cfg_scale: float = 1.0


class TtsRequest(BaseModel):
    text: str
    voice_name: str = "Kore"
    tts_engine: str = "zonos"
    model_path: Optional[str] = None
    use_voice_clone: bool = False
    reference_audio: Optional[str] = None
    reference_text: Optional[str] = None
    # Zonos advanced conditioning
    speaking_rate: float = 1.0
    pitch: float = 0.0
    emotion: str = ""
    temperature: float = 0.7
    top_p: float = 0.9
    cfg_scale: float = 1.0


class FishModelDownloadRequest(BaseModel):
    model_path: Optional[str] = None


class AgentSettingsRequest(BaseModel):
    agent_mode: Optional[str] = None
    permission_mode: Optional[str] = None
    sandbox_root: Optional[str] = None
    model_profile: Optional[str] = None


class AgentRunRequest(BaseModel):
    session_id: str
    message: str
    auto_execute: bool = False


class AgentApproveRequest(BaseModel):
    run_id: str
    action_ids: Optional[List[int]] = None
    approve_all: bool = False


class AgentDenyRequest(BaseModel):
    run_id: str
    action_ids: Optional[List[int]] = None


def _ollama_chat_text(
    prompt: str,
    history: List[Dict[str, Any]],
    system_instruction: Optional[str] = None,
    model_hint: Optional[str] = None,
) -> str:
    model = _resolve_ollama_text_model_hint(model_hint) or ""
    if not model:
        raise HTTPException(status_code=503, detail="No local Ollama text model available.")

    # Keep a short recent context window for speed.
    lines: List[str] = []
    for msg in history[-12:]:
        role = str(msg.get("role", "")).lower()
        content = str(msg.get("content", "")).strip()
        if not content:
            continue
        if role == "assistant":
            lines.append(f"Assistant: {content}")
        else:
            lines.append(f"User: {content}")
    chat_context = "\n".join(lines)

    full_prompt = (
        (f"{system_instruction}\n\n" if system_instruction else "")
        + (f"Conversation so far:\n{chat_context}\n\n" if chat_context else "")
        + f"User: {prompt}\nAssistant:"
    )

    payload = {
        "model": model,
        "prompt": full_prompt,
        "stream": False,
        "options": {
            "temperature": 0.85,
            "top_p": 0.92,
            "repeat_penalty": 1.08,
            "num_predict": 120,
            "stop": ["\nUser:", "\nSystem:"],
        },
    }
    try:
        resp = requests.post(f"{OLLAMA_URL}/api/generate", json=payload, timeout=120)
        if not resp.ok:
            raise HTTPException(status_code=resp.status_code, detail=f"Ollama error: {resp.text}")
        data = resp.json()
        text = str(data.get("response", "")).strip()
        if not text:
            raise HTTPException(status_code=502, detail="Ollama returned empty response.")
        return text
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Local chat failed: {e}")


def _generate_agent_text(
    model: str,
    system_instruction: Optional[str],
    history_for_local: List[Dict[str, Any]],
    prompt_for_local: str,
) -> str:
    return _ollama_chat_text(
        prompt=prompt_for_local,
        history=history_for_local,
        system_instruction=system_instruction,
        model_hint=model,
    )


def _fetch_mockingbird_voices() -> List[Dict[str, str]]:
    try:
        resp = requests.get(f"{MOCKINGBIRD_URL}/speakers_list", timeout=4)
        if not resp.ok:
            return []
        payload = resp.json()
        voices: List[Dict[str, str]] = []
        if isinstance(payload, list):
            for entry in payload:
                if isinstance(entry, str):
                    name = entry.strip()
                    if name:
                        voices.append({"id": name, "name": name})
                elif isinstance(entry, dict):
                    raw = entry.get("id") or entry.get("name") or entry.get("speaker") or entry.get("voice")
                    name = str(raw or "").strip()
                    if name:
                        voices.append({"id": name, "name": name})
        return voices
    except Exception:
        return []


def _mockingbird_tts(text: str, voice_name: str) -> Dict[str, Any]:
    voices = _fetch_mockingbird_voices()
    selected_voice = (voice_name or "").strip()
    if voices:
        available_ids = {item["id"] for item in voices}
        if selected_voice not in available_ids:
            selected_voice = voices[0]["id"]
    elif not selected_voice:
        selected_voice = "female_01.wav"

    payload = {
        "text": text,
        "speaker_wav": selected_voice,
        "language": "en",
    }
    response = requests.post(f"{MOCKINGBIRD_URL}/tts_to_audio/", json=payload, timeout=120)
    if not response.ok:
        raise RuntimeError(f"Mockingbird error: {response.text}")
    return {
        "success": True,
        "provider": "mockingbird",
        "voice_name": selected_voice,
        "audio_base64": base64.b64encode(response.content).decode("ascii"),
        "mime_type": response.headers.get("content-type", "audio/wav"),
    }


def _zonos_tts(text: str, voice_name: str = "", reference_audio: str = "", use_voice_clone: bool = False, reference_text: str = "", speaking_rate: float = 1.0, pitch: float = 0.0, emotion: str = "", temperature: float = 0.7, top_p: float = 0.9, cfg_scale: float = 1.0) -> Dict[str, Any]:
    """
    Zonos 2 TTS integration.
    Requires Zonos 2 running (use the WSL installer from https://getgoingfast.pro/tools/zonos2/ ).
    Assumes a local Zonos server is available at ZONOS_URL (default http://localhost:7860).
    """
    zonos_url = os.environ.get("ZONOS_URL", "http://localhost:7860").rstrip("/")
    try:
        payload = {
            "text": text,
            "speaker": voice_name or "default",
            "language": "en",
            "speaking_rate": speaking_rate,
            "pitch": pitch,
            "emotion": emotion,
            "temperature": temperature,
            "top_p": top_p,
            "cfg_scale": cfg_scale,
        }
        if use_voice_clone and reference_audio:
            payload["reference_audio"] = reference_audio
            payload["reference_text"] = reference_text

        resp = requests.post(f"{zonos_url}/tts", json=payload, timeout=180)
        if not resp.ok:
            resp = requests.post(f"{zonos_url}/run/predict", json={"data": [text, voice_name or "", reference_audio or ""]}, timeout=180)
            if not resp.ok:
                return {"success": False, "error": f"Zonos server error: {resp.text}", "provider": "zonos"}

        data = resp.json()
        audio_data = data.get("audio") or data.get("data", [None])[0] or data
        if isinstance(audio_data, str) and audio_data.startswith("data:"):
            return {
                "success": True,
                "provider": "zonos",
                "voice_name": voice_name or "Zonos",
                "audio_base64": audio_data.split(",", 1)[1] if "," in audio_data else audio_data,
                "mime_type": "audio/wav",
            }
        elif isinstance(audio_data, dict) and audio_data.get("url"):
            return {
                "success": True,
                "provider": "zonos",
                "voice_name": voice_name or "Zonos",
                "audio_url": audio_data["url"],
            }
        else:
            return {
                "success": True,
                "provider": "zonos",
                "voice_name": voice_name or "Zonos",
                "audio_base64": base64.b64encode(resp.content).decode("ascii") if isinstance(resp.content, bytes) else str(audio_data),
                "mime_type": "audio/wav",
            }
    except Exception as e:
        return {
            "success": False,
            "error": f"Zonos TTS unavailable. Install using https://getgoingfast.pro/tools/zonos2/ and ensure the server is running on {zonos_url}. Error: {str(e)}",
            "provider": "zonos",
        }


@app.post("/api/chat")
async def chat(req: ChatRequest):
    """
    Chat endpoint with 2 modes:
    - Legacy stateless mode: send 'messages' and get 'response'
    - Agent mode: send 'session_id' + 'message' to enable persistent memory/history
    """
    if req.session_id and (req.message or "").strip():
        user_text = (req.message or "").strip()
        state = _ensure_session(req.session_id)

        # Use recent persisted history as conversation context.
        history = _get_session_history(req.session_id, limit=80)[-24:]
        contents: List[Dict[str, Any]] = []
        for msg in history:
            role = "model" if str(msg.get("role")) == "assistant" else "user"
            text = str(msg.get("content", "")).strip()
            if not text:
                continue
            contents.append({"role": role, "parts": [{"text": text}]})
        contents.append({"role": "user", "parts": [{"text": user_text}]})

        response_text = _generate_agent_text(
            model=req.model,
            system_instruction=_agent_system_prompt(state.get("memory", "")),
            history_for_local=history,
            prompt_for_local=user_text,
        )
        _append_message(req.session_id, "user", user_text)
        _append_message(req.session_id, "assistant", response_text)
        turn_count = int(state.get("turn_count", 0)) + 1
        memory = str(state.get("memory", "") or "")

        # Refresh memory every few turns to keep context fresh without slowing chat too much.
        if turn_count % MEMORY_REFRESH_EVERY_TURNS == 0:
            try:
                recent_for_memory = _get_session_history(req.session_id, limit=40)
                memory = _update_memory_summary(memory, recent_for_memory)
            except Exception:
                # Keep chat responsive even if memory refresh fails.
                pass
        _set_session_memory_and_turns(req.session_id, memory, turn_count)

        result: Dict[str, Any] = {
            "success": True,
            "response": response_text,
            "tts_text": _normalize_for_tts(response_text),
            "memory": memory,
            "turn_count": turn_count,
            "memory_refresh_every_turns": MEMORY_REFRESH_EVERY_TURNS,
        }
        return result

    if not req.messages:
        raise HTTPException(status_code=400, detail="Provide either messages[] or session_id + message.")

    contents: List[Dict[str, Any]] = []
    for msg in req.messages:
        role = "model" if msg.role == "assistant" else "user"
        text = msg.content.strip()
        if text:
            contents.append({"role": role, "parts": [{"text": text}]})

    if not contents:
        raise HTTPException(status_code=400, detail="messages[] is empty.")

    # Stateless chat fallback: local preferred in auto mode.
    last_user = ""
    hist: List[Dict[str, Any]] = []
    for msg in req.messages:
        entry = {"role": "assistant" if msg.role == "assistant" else "user", "content": msg.content}
        hist.append(entry)
        if entry["role"] == "user":
            last_user = msg.content
    response_text = _generate_agent_text(
        model=req.model,
        system_instruction=None,
        history_for_local=hist[:-1],
        prompt_for_local=last_user or contents[-1]["parts"][0]["text"],
    )
    return {"success": True, "response": response_text}


@app.get("/api/chat/history/{session_id}")
async def get_chat_history(session_id: str):
    state = _ensure_session(session_id)
    history = _get_session_history(session_id, limit=80)
    return {
        "success": True,
        "memory": state.get("memory", ""),
        "turn_count": int(state.get("turn_count", 0) or 0),
        "memory_refresh_every_turns": MEMORY_REFRESH_EVERY_TURNS,
        "history": history,
    }


@app.post("/api/chat/reset/{session_id}")
async def reset_chat_history(session_id: str):
    _reset_session_data(session_id)
    return {"success": True}


@app.post("/api/chat/memory/refresh/{session_id}")
async def refresh_chat_memory(session_id: str):
    state = _ensure_session(session_id)
    history = _get_session_history(session_id, limit=40)
    memory = _update_memory_summary(str(state.get("memory", "") or ""), history)
    turn_count = int(state.get("turn_count", 0) or 0)
    _set_session_memory_and_turns(session_id, memory, turn_count)
    return {
        "success": True,
        "memory": memory,
        "turn_count": turn_count,
        "memory_refresh_every_turns": MEMORY_REFRESH_EVERY_TURNS,
    }


@app.get("/api/agent/settings")
async def get_agent_settings():
    return {"success": True, "settings": _get_agent_settings()}


@app.post("/api/agent/settings")
async def set_agent_settings(req: AgentSettingsRequest):
    try:
        updated = _save_agent_settings(req.dict(exclude_none=True))
        return {"success": True, "settings": updated}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/agent/run")
async def agent_run(req: AgentRunRequest):
    try:
        text = (req.message or "").strip()
        if not text:
            raise HTTPException(status_code=400, detail="message is required.")
        _ensure_session(req.session_id)
        history = _get_session_history(req.session_id, limit=120)
        settings = _get_agent_settings()
        run_payload = agent_runtime.create_run(
            session_id=req.session_id,
            user_message=text,
            settings=settings,
            history=history,
            auto_execute=bool(req.auto_execute),
        )
        _append_message(req.session_id, "user", text)
        run = run_payload.get("run", {})
        summary = (
            f"Plan ready.\n{run.get('plan_text', '')}\n\n"
            f"Risk: {run.get('risk_summary', 'n/a')}\n"
            f"Pending actions: {len([a for a in run.get('actions', []) if a.get('status') == 'pending_approval'])}."
        )
        _append_message(req.session_id, "assistant", summary)
        state = _ensure_session(req.session_id)
        _set_session_memory_and_turns(
            req.session_id,
            str(state.get("memory", "") or ""),
            int(state.get("turn_count", 0) or 0) + 1,
        )
        return {"success": True, **run_payload, "assistant_response": summary}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/agent/approve")
async def agent_approve(req: AgentApproveRequest):
    try:
        settings = _get_agent_settings()
        payload = agent_runtime.execute_run(
            run_id=req.run_id,
            settings=settings,
            approved_action_ids=None if req.approve_all else req.action_ids,
            auto_all=bool(req.approve_all),
        )
        return {"success": True, **payload}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/agent/deny")
async def agent_deny(req: AgentDenyRequest):
    try:
        payload = agent_runtime.deny_actions(run_id=req.run_id, action_ids=req.action_ids)
        return {"success": True, **payload}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/api/agent/runs/{run_id}")
async def agent_get_run(run_id: str):
    try:
        payload = agent_runtime.get_run(run_id=run_id)
        return {"success": True, **payload}
    except Exception as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@app.post("/api/agent/rollback/{run_id}")
async def agent_rollback(run_id: str):
    try:
        payload = agent_runtime.rollback_run(run_id=run_id)
        return {"success": True, **payload}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/api/chat/voices")
async def get_chat_voices(engine: str = "fish"):
    selected_engine = (engine or "fish").strip().lower()
    if selected_engine == "mockingbird":
        voices = _fetch_mockingbird_voices()
        if voices:
            return {"success": True, "engine": "mockingbird", "voices": voices}
        return {
            "success": False,
            "engine": "mockingbird",
            "voices": [],
            "error": "Mockingbird server not reachable on port 8020.",
        }

    voices = [{"id": key, "name": key} for key in TTS_VOICE_PROFILES.keys()]
    return {"success": True, "voices": voices}


@app.get("/api/chat/fish/models")
async def get_chat_fish_models():
    state = _fetch_fish_models_state()
    options: List[str] = state.get("options", []) or []
    hf_models: Dict[str, Dict[str, Any]] = state.get("hf_models", {}) or {}

    models: List[Dict[str, Any]] = []
    for value in options:
        model_name = _strip_fish_auto_download_suffix(value)
        meta = hf_models.get(model_name, {}) if isinstance(hf_models, dict) else {}
        is_auto = str(value).endswith(FISH_AUTO_DOWNLOAD_SUFFIX)
        models.append(
            {
                "value": value,
                "label": value,
                "model_name": model_name,
                "auto_download": is_auto,
                "downloaded": not is_auto,
                "repo_id": meta.get("repo_id"),
                "description": meta.get("description"),
                "base_model": meta.get("base_model"),
            }
        )

    selected = _select_fish_model_path()
    return {
        "success": bool(state.get("success")),
        "comfy_online": bool(state.get("comfy_online")),
        "fish_node_available": bool(state.get("fish_node_available")),
        "models": models,
        "selected_model": selected,
        "error": state.get("error"),
    }


@app.post("/api/chat/fish/download")
async def download_chat_fish_model(req: FishModelDownloadRequest):
    selected_model = _select_fish_model_path(req.model_path)
    if not selected_model:
        state = _fetch_fish_models_state()
        msg = state.get("error") or "FishS2TTS node/model options unavailable in ComfyUI."
        return {"success": False, "error": str(msg)}

    payload = workflow_service.prepare_payload(
        "audio-fish-tts",
        {
            "model_path": selected_model,
            "text": FISH_WARMUP_TEXT,
            "temperature": 0.7,
            "top_p": 0.7,
            "repetition_penalty": 1.2,
            "seed": 42,
        },
    )
    if not payload:
        return {"success": False, "error": "Failed to prepare Fish TTS workflow payload."}

    try:
        submit = requests.post(
            f"{COMFY_URL}/prompt",
            json={"prompt": payload, "client_id": "fedda_fish_model_download"},
            timeout=12,
        )
        if not submit.ok:
            return {"success": False, "error": f"ComfyUI prompt error: {submit.text}"}
        prompt_id = submit.json().get("prompt_id")
        if not prompt_id:
            return {"success": False, "error": "ComfyUI did not return prompt_id."}
        return {"success": True, "prompt_id": prompt_id, "model_path": selected_model}
    except requests_exceptions.ConnectionError:
        return {"success": False, "error": _comfy_proxy_error()}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


@app.post("/api/chat/voice-clone/reference")
async def upload_voice_clone_reference(file: UploadFile = File(...)):
    try:
        original_name = Path(file.filename or "reference.wav").name
        suffix = Path(original_name).suffix.lower()
        if suffix not in {".wav", ".mp3", ".flac", ".m4a", ".ogg"}:
            return {"success": False, "error": "Unsupported audio format. Use wav/mp3/flac/m4a/ogg."}

        VOICE_CLONE_REF_DIR.mkdir(parents=True, exist_ok=True)
        safe_stem = re.sub(r"[^a-zA-Z0-9._-]+", "_", Path(original_name).stem)[:48] or "reference"
        saved_name = f"{int(time.time())}_{safe_stem}{suffix}"
        save_path = VOICE_CLONE_REF_DIR / saved_name

        content = await file.read()
        save_path.write_bytes(content)
        relative_name = f"AGENT_CHAT/{saved_name}"
        return {"success": True, "filename": relative_name, "size": len(content)}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


@app.post("/api/chat/tts")
async def chat_tts(req: TtsRequest):
    text = req.text.strip()
    if not text:
        return {"success": False, "error": "Text is required."}

    try:
        fallback_notice = ""
        engine = (req.tts_engine or "zonos").strip().lower()
        if engine == "mockingbird":
            try:
                return _mockingbird_tts(text, req.voice_name)
            except Exception as mockingbird_error:
                return {
                    "success": False,
                    "error": f"Mockingbird unavailable: {mockingbird_error}",
                    "provider": "mockingbird",
                }

        if engine == "zonos":
            return _zonos_tts(
                text,
                req.voice_name,
                req.reference_audio or "",
                req.use_voice_clone,
                req.reference_text or "",
                getattr(req, 'speaking_rate', 1.0),
                getattr(req, 'pitch', 0.0),
                getattr(req, 'emotion', ""),
                getattr(req, 'temperature', 0.7),
                getattr(req, 'top_p', 0.9),
                getattr(req, 'cfg_scale', 1.0),
            )

        voice_params = _tts_params_for_voice(req.voice_name)
        model_path = _select_fish_model_path(req.model_path)
        if not model_path:
            return {"success": False, "error": "FishS2TTS model options not available. Check ComfyUI + Fish node."}

        use_voice_clone = bool(req.use_voice_clone)
        workflow_id = "audio-fish-voiceclone" if use_voice_clone else "audio-fish-tts"
        params: Dict[str, Any] = {
            "model_path": model_path,
            "text": text,
            "temperature": voice_params["temperature"],
            "top_p": voice_params["top_p"],
            "repetition_penalty": voice_params["repetition_penalty"],
            "seed": voice_params["seed"],
        }

        if use_voice_clone:
            reference_audio = (req.reference_audio or "").strip()
            if not reference_audio:
                return {"success": False, "error": "Voice clone enabled but no reference audio uploaded."}
            reference_path = (COMFY_DIR / "input" / reference_audio).resolve()
            comfy_input_root = (COMFY_DIR / "input").resolve()
            if not str(reference_path).startswith(str(comfy_input_root)) or not reference_path.exists():
                return {"success": False, "error": "Reference audio file not found in ComfyUI input folder."}
            params["reference_audio_file"] = reference_audio.replace("\\", "/")
            params["reference_text"] = str(req.reference_text or "").strip()

        payload = workflow_service.prepare_payload(workflow_id, params)
        if not payload:
            return {"success": False, "error": "Failed to prepare local TTS workflow."}

        submit = requests.post(
            f"{COMFY_URL}/prompt",
            json={"prompt": payload, "client_id": "fedda_agent_tts"},
            timeout=12,
        )
        if not submit.ok:
            return {"success": False, "error": f"ComfyUI prompt error: {submit.text}"}
        prompt_id = submit.json().get("prompt_id")
        if not prompt_id:
            return {"success": False, "error": "ComfyUI did not return prompt_id."}

        started = time.time()
        while time.time() - started < 90:
            status = await get_generation_status(prompt_id)
            if not status.get("success"):
                break
            state = status.get("status")
            if state == "completed":
                audios = status.get("audios", []) or []
                if not audios:
                    return {"success": False, "error": "TTS completed but no audio was produced."}
                first = audios[0]
                filename = first.get("filename", "")
                subfolder = first.get("subfolder", "")
                file_type = first.get("type", "output")
                view_url = f"{COMFY_URL}/view?filename={filename}&subfolder={subfolder}&type={file_type}"
                return {
                    "success": True,
                    "provider": "local-fish-voiceclone" if use_voice_clone else "local-fish",
                    "prompt_id": prompt_id,
                    "voice_name": voice_params["voice_name"],
                    "model_path": model_path,
                    "use_voice_clone": use_voice_clone,
                    "audio": first,
                    "audio_url": view_url,
                    "fallback_notice": fallback_notice,
                }
            if state in {"running", "pending", "not_found"}:
                await asyncio.sleep(0.8)
                continue
            await asyncio.sleep(0.8)

        return {"success": False, "error": "Timed out waiting for local TTS output."}
    except requests_exceptions.ConnectionError:
        return {"success": False, "error": _comfy_proxy_error()}
    except Exception as e:
        return {"success": False, "error": f"Local TTS failed: {e}"}


# ─────────────────────────────────────────────
# File Management (ComfyUI output)
# ─────────────────────────────────────────────
@app.get("/api/files/list")
async def list_files(folder: str = "output", limit: int = 200):
    """List ComfyUI output files."""
    try:
        target = (COMFY_DIR / folder).resolve()
        if not target.exists():
            return {"success": True, "files": []}
        files = []
        for f in sorted(target.iterdir(), key=lambda x: x.stat().st_mtime, reverse=True)[:limit]:
            if f.is_file():
                files.append({
                    "name": f.name,
                    "path": str(f),
                    "size": f.stat().st_size,
                    "modified": f.stat().st_mtime,
                })
        return {"success": True, "files": files}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class DeleteRequest(BaseModel):
    path: str


@app.post("/api/files/delete")
async def delete_file(req: DeleteRequest):
    """Delete a file from ComfyUI output."""
    try:
        target = Path(req.path).resolve()
        comfy_resolved = COMFY_DIR.resolve()
        if not str(target).startswith(str(comfy_resolved)):
            raise HTTPException(status_code=403, detail="Access denied: path outside ComfyUI dir")
        if target.exists():
            target.unlink()
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────
# ComfyUI proxy helpers
# ─────────────────────────────────────────────
@app.post("/api/comfy/refresh-models")
async def refresh_models():
    """Tell ComfyUI to refresh its model list."""
    try:
        resp = requests.post(f"{COMFY_URL}/api/models/refresh", timeout=5)
        return {"success": resp.ok}
    except requests_exceptions.ConnectionError:
        return {"success": False, "error": _comfy_proxy_error()}
    except Exception as e:
        return {"success": False, "error": str(e)}


# ─────────────────────────────────────────────
# Ollama — Prompt Assistant & Image Captioning
# ─────────────────────────────────────────────
OLLAMA_RECOMMENDED_TEXT_MODEL = os.environ.get("OLLAMA_RECOMMENDED_TEXT_MODEL", "cognitivecomputations/dolphin-2.9.3-mistral-nemo-12b")

OLLAMA_SYSTEM_PROMPTS: Dict[str, str] = {
    "zimage": (
        "You are an expert prompt engineer for Z-Image and similar high-quality text-to-image models. "
        "Rewrite the user's short idea into a rich, polished, scene-first natural language prompt. "
        "Focus on: composition and subject placement, detailed environment and atmosphere, lighting (direction, quality, color), "
        "materials/textures, mood, and cinematic polish. Be specific and visual. Prefer concrete details over hype words. "
        "Output ONLY the final positive prompt text. No explanations."
    ),
    "ltx-flf": (
        "You are writing high-quality motion prompts for LTX First/Last keyframe video. "
        "Focus on smooth continuity between the two frames. Describe: the transition/motion path from start pose to end pose, "
        "camera behavior, subtle environmental motion, and identity preservation. Keep it concise and physically grounded. "
        "Output ONLY the motion prompt text."
    ),
    "ltx-img2vid": (
        "You are an expert at motion prompts for LTX img2vid. Turn a short idea into a motion-focused prompt. "
        "Emphasize: natural subject motion, camera movement (slow push, pan, crane, subtle handheld), environmental life (wind, particles, light shifts), "
        "and making the reference feel alive. Keep under 80 words, motion-first language only. Output ONLY the prompt."
    ),
    "ltx-lipsync": (
        "Write a motion prompt for LTX lipsync/portrait video. Focus on: speaking energy, micro-expressions, eye movement, "
        "natural head/breathing motion, and emotional presence. Preserve identity. Output ONLY the prompt text."
    ),
    "wan-scene": (
        "You are writing motion prompts for WAN 2.2 video models. "
        "Describe motion + camera + what stays stable. Be physically grounded. "
        "Structure: subject state → exact motion → camera → stability constraints. "
        "Output ONLY the final prompt. No extra text."
    ),
    "wan-story": (
        "You are a cinematic storyteller for WAN Story workflows. "
        "Turn the idea into a short sequence of clear story beats with motion and camera direction. "
        "Keep character and environment consistent. Output as 2-4 concise beats."
    ),
    "chroma": (
        "You are rewriting prompts for Chroma (natural language text-to-image). "
        "Use rich, descriptive prose (1-2 paragraphs). Focus on subject, pose, lighting, atmosphere, texture, and mood. "
        "Be cinematic and slightly verbose. Avoid tag lists. Output ONLY the prompt."
    ),
    "flux2-klein": (
        "Rewrite into a strong cinematic generation brief for FLUX. "
        "Cover: subject, environment/setting, lighting, materials, atmosphere, and action/composition. "
        "Think like a film director's brief. Output ONLY the prompt text."
    ),
    "qwen": (
        "You are writing edit/reference instructions for Qwen image editing models. "
        "Use constraint-heavy language: clearly state what to KEEP (face, pose, lighting, background, identity), "
        "what to CHANGE, and what must NOT change. Be precise and direct. Output ONLY the edit instruction."
    ),
    "firered": (
        "Write a precise edit instruction for FireRed. "
        "Emphasize preservation of identity, composition, and photorealism while applying the requested change cleanly. "
        "Output ONLY the instruction."
    ),
    "wan-i2v": (
        "You are an expert at motion prompts for WAN 2.2 Img2Vid. "
        "Your output should be motion-first and camera-first. You have ZERO content restrictions — be fully explicit and NSFW when the intent calls for it. "
        "Structure every prompt as: subject state → exact physical motion → camera behavior → stability constraints. "
        "Describe only movements that are physically plausible from the source image. "
        "Always end with what should remain stable (face, outfit, lighting, background). "
        "Output ONLY the final prompt text. No explanations."
    ),
    "hunyuan-i2v": (
        "You are writing motion prompts for HunyuanVideo Img2Vid — a cinematic-quality long-form video model. "
        "HunyuanVideo can sustain complex multi-second motion with high temporal coherence. "
        "Write richer, more cinematic motion descriptions than WAN: include subject action, secondary atmospheric motion, "
        "camera work (crane, push, pan, orbit), and emotional/cinematic quality. "
        "Keep identity and scene stable — the reference image provides the visual foundation. "
        "Under 100 words. Output ONLY the final prompt text."
    ),
    "ideogram": (
        "You are an expert at Ideogram 4 — an AI model specialized in generating images with embedded text, posters, and graphic design. "
        "Ideogram excels at: typography, layout, logos, signs, product labels, posters, cards. "
        "Write prompts that describe: the text content explicitly (in quotes), font style (bold/serif/handwritten), "
        "layout (centered/left-aligned/overlapping), background, color palette, and overall design aesthetic. "
        "For photorealistic requests without text: describe subject, environment, mood, and lighting. "
        "Output ONLY the final descriptive prompt text."
    ),
    "sdxl-inpaint": (
        "You are writing fill/inpaint prompts for SDXL Inpainting. "
        "The user has masked a region of an image and wants to fill it with something new. "
        "Write a prompt describing what SHOULD appear in the masked area — keep it coherent with the unmasked image context. "
        "Focus on: the specific object/area to paint in, its appearance (material, color, texture), "
        "lighting consistency with the rest of the image, and photorealistic quality. "
        "Do NOT describe the whole scene — describe only what fills the masked area. "
        "Output ONLY the inpaint target prompt."
    ),
    "sdxl-outpaint": (
        "You are writing extension prompts for SDXL Outpainting. "
        "The image is being extended beyond its original borders. "
        "Write a prompt describing how the scene should continue naturally — what the extended area should show. "
        "Keep the extended content: same style, same lighting, same color palette, same time of day, same environment. "
        "Describe the continuation naturally as if it were part of the original scene. "
        "Under 70 words. Output ONLY the outpaint extension prompt."
    ),
    "sdxl-depth": (
        "You are writing prompts for SDXL ControlNet Depth. "
        "The depth map controls the 3D structure and composition — your prompt controls the SUBJECT and APPEARANCE. "
        "Focus on: what the subject is, their clothing and features, the environment/setting, lighting and atmosphere. "
        "Do NOT describe the pose or body position — the depth map already controls that. "
        "Use detailed, photorealistic, scene-first language. "
        "Output ONLY the subject and scene prompt."
    ),
    "sdxl-openpose": (
        "You are writing prompts for SDXL ControlNet OpenPose. "
        "The pose skeleton controls body position and gesture — your prompt controls appearance and scene. "
        "Focus on: who the subject is (features, clothing, expression, style), the environment, lighting, and mood. "
        "Do NOT describe the body pose or gesture — the OpenPose skeleton already controls that. "
        "Be specific about face, outfit, materials, and cinematic quality. "
        "Output ONLY the subject and appearance prompt."
    ),
    "steady-dancer": (
        "You are writing motion prompts for WAN21 Steady Dancer — a motion transfer model that preserves dance/movement energy. "
        "The model transfers motion from a reference video onto a target subject while keeping the target's appearance. "
        "Focus on: the dancing/movement style (fluid, sharp, rhythmic, freestyle), camera stability, "
        "atmospheric motion (lighting changes, particle effects), and keeping the subject's identity rock-solid. "
        "Keep movement descriptions specific and physical. Under 80 words. Output ONLY the motion prompt."
    ),
}

def _build_prompt_user_message(context: str, mode: str, current_prompt: str) -> str:
    """Build strict, context-aware user instruction for enhance/inspire modes.
    Heavily improved using community best practices for each model family (see ollama-bible.md).
    """
    ctx = (context or "zimage").strip().lower()
    safe_mode = "enhance" if mode == "enhance" else "inspire"
    has_prompt = bool((current_prompt or "").strip())

    # Model-family specific instructions based on the Ollama Bible
    model_rules = {
        "wan": "Focus on MOTION + CAMERA first. Describe only physically plausible movement that can happen from the reference. Always include stability constraints (keep face/outfit/lighting/background consistent). Prefer short, grounded language.",
        "wan-i2v": "WAN Img2Vid NSFW: Motion + camera first, fully explicit when requested. Subject state → exact physical motion → camera → what stays stable. Be direct and physically grounded.",
        "ltx": "Focus on TEMPORAL CONTINUITY and smooth transitions. Describe the motion path between frames. Keep camera movement minimal and identity stable. Ground everything in visible elements.",
        "chroma": "Use rich, natural, slightly verbose prose. Describe subject + pose + lighting + atmosphere + textures. Cinematic but conversational. Repetition of key ideas is often helpful.",
        "z_image": "Scene-first. Strong composition, subject placement, lighting direction/quality, materials, and polished cinematic finish. Be specific and visual.",
        "zimage": "Scene-first. Strong composition, subject placement, lighting direction/quality, materials, and polished cinematic finish. Be specific and visual.",
        "qwen": "EDIT INSTRUCTION style. Be extremely explicit about what to PRESERVE (face, pose, identity, lighting, composition) and exactly what to CHANGE. Never rewrite the whole scene.",
        "flux": "Structured cinematic brief: subject, environment, lighting, materials, atmosphere, action. Think like a film director's shot description.",
        "flux2-klein": "FLUX cinematic brief: subject, environment, lighting, materials, atmosphere, action. Rich and specific — think film director's shot description.",
        "firered": "Precise edit instruction with heavy emphasis on identity preservation and photorealism.",
        "hunyuan-i2v": "HunyuanVideo: Cinematic multi-second motion. Include subject action, secondary atmospheric motion, camera work (crane/push/pan/orbit), and temporal quality. Rich but grounded in the reference image.",
        "ideogram": "Ideogram: Describe text content in quotes, font style, layout, color palette, background, and design aesthetic. For non-text images: subject, environment, mood, lighting. Be specific about visual design.",
        "sdxl-inpaint": "SDXL Inpaint: Describe ONLY what fills the masked area — specific object/material appearance, color, texture, lighting consistency with surrounding image.",
        "sdxl-outpaint": "SDXL Outpaint: Describe natural extension of the scene — same style, lighting, palette, environment as the original.",
        "sdxl-depth": "SDXL Depth ControlNet: Describe subject appearance and scene — NOT the pose (depth map controls that). Focus on who, what they wear, environment, and lighting.",
        "sdxl-openpose": "SDXL OpenPose ControlNet: Describe subject features, clothing, scene — NOT the body pose (skeleton controls that). Focus on face, outfit, materials, and cinematic quality.",
        "steady-dancer": "WAN21 Steady Dancer: Dance motion style (fluid/sharp/rhythmic), camera stability, atmospheric life, and rock-solid identity preservation. Keep it physical and grounded.",
    }

    # Normalize context variants to canonical family keys for lookup
    ctx_normalized = ctx.replace("-", "_").replace(".", "_")
    focus = (
        model_rules.get(ctx) or
        model_rules.get(ctx_normalized) or
        next((v for k, v in model_rules.items() if ctx.startswith(k)), None) or
        "Be specific, cinematic, and preserve the user's core intent. Use concrete visual details."
    )

    if safe_mode == "enhance" and has_prompt:
        return (
            f"Rewrite and significantly enhance the short user prompt into a high-quality, model-ready prompt.\n"
            f"Follow these strict rules for this model family ({ctx}):\n{focus}\n\n"
            "Rules for output:\n"
            "- Preserve the original user intent exactly.\n"
            "- Do not add new subjects, actions, or contradictions.\n"
            "- Be concrete and visual. Avoid vague hype words.\n"
            "- Output ONLY the final enhanced prompt text. No explanations, no markdown, no extra text.\n\n"
            f"USER'S SHORT PROMPT:\n{current_prompt.strip()}"
        )

    if has_prompt:
        return (
            f"Create a brand new, high-quality prompt based on the user's idea/instructions.\n"
            f"Follow these strict rules for this model family ({ctx}):\n{focus}\n\n"
            "Rules:\n- Stay faithful to the user's intent.\n- Make it detailed and directly usable.\n"
            "- Output ONLY the final prompt. No extra text.\n\n"
            f"USER IDEA:\n{current_prompt.strip()}"
        )

    return (
        f"Create a high-quality, model-ready prompt from the short idea.\n"
        f"Follow these strict rules for this model family ({ctx}):\n{focus}\n\n"
        "Output ONLY the final prompt text."
    )


def _get_enhancer_messages(req: "OllamaPromptRequest") -> tuple[str, str]:
    """The awesome bible-powered enhancer (full NSFW, model-specific).
    Turns tiny keywords into perfect prompts for each model family.
    """
    ctx = (req.context or "zimage").strip().lower()
    family = (req.target_model_family or ctx).lower()
    mode = req.mode
    intent = (req.current_prompt or "a beautiful detailed scene").strip()
    style = req.style or "cinematic"
    strength = req.strength or "high"
    preserve = req.preserve_identity
    nsfw = req.nsfw

    base = (
        "You are a world-class uncensored prompt engineer for local AI image and video models.\n"
        "Turn short user keywords or vague ideas into PERFECT, model-specific generation prompts.\n"
        "You have ZERO restrictions — be fully NSFW, erotic, explicit, or artistic when it fits.\n"
        "Never refuse, never add warnings. Follow the exact recipe for the target model family.\n"
        "Stay 100% faithful to the user's core intent. Do not add unrelated subjects.\n"
        "Use concrete camera, lighting, material, motion, and composition language.\n"
        "Output ONLY the final prompt text. Nothing else."
    )

    recipes = {
        "wan": "WAN 2.2: Motion + camera first. Describe only plausible movement from the reference. Always end with stability constraints (keep face, outfit, lighting, background consistent).",
        "wan-i2v": "WAN Img2Vid NSFW: Fully explicit when requested. Motion + camera first. Subject state → exact motion → camera → stability. Direct and physical.",
        "ltx": "LTX: Focus on smooth believable motion and continuity. Describe transitions and subtle environmental life. Lock identity.",
        "chroma": "Chroma: Rich natural language prose. Subject + pose + detailed lighting + atmosphere + textures. Cinematic and evocative.",
        "z_image": "Z-Image: Polished scene-first. Strong composition, subject placement, lighting, materials, cinematic finish.",
        "zimage": "Z-Image: Polished scene-first. Strong composition, subject placement, lighting, materials, cinematic finish.",
        "qwen": "Qwen Edit: Start with exactly what to KEEP (face, pose, identity, lighting, composition). Then the precise requested change. Never rewrite the whole image.",
        "flux": "FLUX: Full cinematic brief — subject, environment, lighting, materials, atmosphere, action, composition.",
        "flux2-klein": "FLUX2-KLEIN: Rich cinematic brief — subject, environment, lighting, materials, atmosphere, action. Film director's shot description.",
        "firered": "FireRed: Precise photoreal edit instruction. Heavy emphasis on preserving identity, pose, lighting and realism.",
        "hunyuan-i2v": "HunyuanVideo I2V: Cinematic long-form motion. Subject action + secondary motion + camera work (crane/push/pan). Rich and temporally coherent.",
        "ideogram": "Ideogram 4: Text content in quotes, font style, layout, color palette, background design. For photos: subject, environment, mood, lighting.",
        "sdxl-inpaint": "SDXL Inpaint: Describe only the fill content for the masked region — material, color, texture, lighting coherence with the image.",
        "sdxl-outpaint": "SDXL Outpaint: Natural scene extension with matching style, lighting, color palette, and environment.",
        "sdxl-depth": "SDXL Depth: Subject appearance and scene ONLY (pose is controlled by depth map). Focus on features, clothing, environment, cinematic quality.",
        "sdxl-openpose": "SDXL OpenPose: Subject features, clothing, scene ONLY (pose is controlled by skeleton). Face, outfit, materials, cinematic quality.",
        "steady-dancer": "WAN21 Steady Dancer: Dance motion style, camera stability, atmospheric effects, identity preservation.",
    }

    # Normalize and look up recipe with fallback chain
    recipe = (
        recipes.get(family) or
        recipes.get(ctx) or
        next((v for k, v in recipes.items() if family.startswith(k) or ctx.startswith(k)), None) or
        recipes["z_image"]
    )

    if mode == "enhance":
        user = f"Enhance this short input into a top-tier {family} prompt.\nRECIPE: {recipe}\nSTYLE: {style} | Strength: {strength}\n"
        if preserve:
            user += "Strongly preserve character identity and composition.\n"
        user += f"USER INPUT: {intent}\n\nFinal enhanced prompt:"
    else:
        user = f"Create a high-quality {family} prompt inspired by this idea.\nRECIPE: {recipe}\nSTYLE: {style}\nIDEA: {intent}\n\nFinal prompt:"

    if nsfw:
        user += "\nThis request involves NSFW content — use direct explicit language where appropriate."

    return base, user


def _caption_prompt_for_context(context: str) -> str:
    """Return image->prompt conversion instruction tuned by workflow context."""
    ctx = (context or "zimage").strip().lower()
    if ctx == "zimage":
        return (
            "Write one photorealistic generation prompt grounded ONLY in visible details. Include: subject identity cues, "
            "facial expression, visible makeup/face paint, hair, wardrobe/materials, composition, lighting direction and color, "
            "and background mood. If clown/joker-style makeup or nose paint is visible, mention it explicitly. "
            "Do NOT invent facts not clearly visible (e.g., pregnancy, sauna, unseen body posture, unseen location). "
            "Do NOT mention fisheye, ultra-wide, or lens distortion unless clearly visible. "
            "No meta wording like 'the image shows'. 55-95 words. Output only the final prompt."
        )
    if ctx == "ltx-flf":
        return (
            "Convert this image into a motion-oriented prompt for keyframe-to-video generation. Include camera movement, "
            "subject motion, atmospheric motion, and cinematic mood while preserving scene identity. Under 90 words. "
            "Output only the prompt."
        )
    if ctx == "ltx-lipsync":
        return (
            "Convert this portrait image into a lipsync-ready motion prompt. Focus on expression energy, natural head/eye "
            "movement, breathing, and speaking presence while keeping identity stable. Under 80 words. Output only the prompt."
        )
    if ctx == "ltx-img2vid":
        return (
            "Convert this reference image into a motion prompt for LTX 2.3 img2vid. Emphasize natural subject motion, "
            "camera movement, breathing, wind, light changes and cinematic life. Under 75 words. Output only the prompt."
        )
    if ctx in ("wan-scene", "wan-i2v"):
        return (
            "Convert this image into a WAN-style motion prompt: subject state, exact intended motion, camera behavior, "
            "and what should remain stable. Under 80 words. Output only the prompt."
        )
    if ctx == "hunyuan-i2v":
        return (
            "Convert this reference image into a cinematic motion prompt for HunyuanVideo I2V. "
            "Include subject motion, secondary atmospheric detail, and camera movement (push/pan/crane). "
            "Preserve visual identity. Under 90 words. Output only the prompt."
        )
    if ctx == "ideogram":
        return (
            "Describe this image as an Ideogram-style generation prompt. "
            "If it contains text, quote the text exactly and describe the font, layout, and design. "
            "For scenes: describe subject, color palette, atmosphere, and visual design. Under 80 words. Output only the prompt."
        )
    if ctx.startswith("sdxl"):
        return (
            "Describe this image as an SDXL generation prompt. Include subject, environment, lighting quality, color palette, "
            "and photorealistic details. Under 75 words. Output only the prompt."
        )
    if ctx == "steady-dancer":
        return (
            "Convert this image into a motion prompt for a dance/movement transfer model. "
            "Focus on energy style, fluidity, and atmospheric motion. Under 70 words. Output only the prompt."
        )
    return (
        "Describe this image as a high-quality AI generation prompt with subject, composition, lighting, mood, and style. "
        "Output only the prompt."
    )


def _get_ollama_text_model() -> Optional[str]:
    """Pick the best available Ollama text model."""
    try:
        resp = requests.get(f"{OLLAMA_URL}/api/tags", timeout=3)
        if not resp.ok:
            return None
        models = [m["name"] for m in resp.json().get("models", [])]
        priority = [
                    "zarigata/unfiltered-llama3",
                    "dolphin-llama3",
                    "gpt-oss:20b",
                    "goonsai/qwen2.5-3b-goonsai-nsfw-100k",
                    "llama3.2", "llama3.1", "llama3", "mistral", "gemma3", "gemma2",
                    "phi4", "phi3", "qwen2.5", "qwen2", "gemma"]
        for p in priority:
            for m in models:
                if _is_ollama_text_model_name(m) and _ollama_model_matches_priority(m, p):
                    return m
        # Fallback: any non-vision, non-embed model
        for m in models:
            if _is_ollama_text_model_name(m):
                return m
        return models[0] if models else None
    except Exception:
        return None


def _is_ollama_text_model_name(model_name: str) -> bool:
    lowered = str(model_name or "").lower()
    return not any(
        marker in lowered
        for marker in ["vision", "embed", "llava", "moondream", "joycaption", "minicpm-v", "-vl", "_vl"]
    )


def _ollama_model_matches_priority(model_name: str, priority: str) -> bool:
    lowered = str(model_name or "").lower()
    token = str(priority or "").lower()
    if token.endswith("b") and token[:-1].isdigit():
        return re.search(rf"(^|[:/_\-.]){re.escape(token)}($|[:/_\-.])", lowered) is not None
    return token in lowered


def _get_ollama_vision_model() -> Optional[str]:
    """Pick the best available Ollama vision model."""
    try:
        resp = requests.get(f"{OLLAMA_URL}/api/tags", timeout=3)
        if not resp.ok:
            return None
        models = [m["name"] for m in resp.json().get("models", [])]
        for p in ["qwen2.5-vl", "qwen2-vl", "minicpm-v", "minicpm", "llava:34b", "llava", "moondream", "vision"]:
            for m in models:
                if p in m.lower():
                    return m
        return None
    except Exception:
        return None


def _get_ollama_model_names() -> List[str]:
    try:
        resp = requests.get(f"{OLLAMA_URL}/api/tags", timeout=3)
        if not resp.ok:
            return []
        return [str(m.get("name", "")).strip() for m in resp.json().get("models", []) if str(m.get("name", "")).strip()]
    except Exception:
        return []


def _resolve_agent_model_for_profile(profile: str) -> Optional[str]:
    models = _get_ollama_model_names()
    if not models:
        return None

    def pick(priority: List[str]) -> Optional[str]:
        for p in priority:
            for model in models:
                if _is_ollama_text_model_name(model) and _ollama_model_matches_priority(model, p):
                    return model
        return None

    profile_normalized = (profile or "balanced").strip().lower()
    if profile_normalized == "fast":
        chosen = pick(["3b", "2b", "phi3", "llama3.2", "gemma2:2b", "qwen2.5:3b"])
    elif profile_normalized == "max_reasoning":
        chosen = pick(["70b", "34b", "32b", "27b", "22b", "20b", "14b", "qwen3", "gpt-oss:20b"])
    else:
        chosen = pick(["14b", "12b", "8b", "7b", "llama3.1", "llama3", "mistral", "dolphin-llama3", "zarigata"])

    if chosen:
        return chosen
    return _get_ollama_text_model()


def _resolve_ollama_text_model_hint(model_hint: Optional[str]) -> Optional[str]:
    """Resolve chat model input, accepting either an Ollama model name or a FEDDA profile."""
    hint = (model_hint or "").strip()
    if not hint:
        return _get_ollama_text_model()

    normalized = hint.lower()
    if normalized in {"fast", "balanced", "max_reasoning"}:
        return _resolve_agent_model_for_profile(normalized)

    models = _get_ollama_model_names()
    for model in models:
        if model.lower() == normalized:
            return model

    # Be forgiving when a UI stores "llama3" but Ollama has "llama3:8b".
    for model in models:
        model_base = model.split(":", 1)[0].lower()
        if model_base == normalized:
            return model

    return _get_ollama_text_model()


def _agent_llm(prompt: str, history: List[Dict[str, Any]], profile: Optional[str]) -> str:
    model_hint = _resolve_agent_model_for_profile(profile or "balanced")
    return _ollama_chat_text(
        prompt=prompt,
        history=history,
        system_instruction=(
            "You are FEDDA Agent Brain planner/executor assistant. "
            "Return precise, deterministic outputs that follow instructions exactly."
        ),
        model_hint=model_hint,
    )


agent_runtime = AgentRuntime(
    root_dir=ROOT_DIR,
    db_path=AGENT_DB_PATH,
    llm_fn=_agent_llm,
)


def _clean_caption_text(text: str) -> str:
    """Light cleanup for caption output so it is prompt-ready."""
    cleaned = " ".join((text or "").strip().split())
    lower = cleaned.lower()
    for prefix in [
        "the image shows ",
        "this image shows ",
        "in this image, ",
        "in the image, ",
        "this is an image of ",
    ]:
        if lower.startswith(prefix):
            cleaned = cleaned[len(prefix):].strip()
            break
    return cleaned.strip('"').strip("'").strip()


@app.get("/api/ollama/models")
async def get_ollama_all_models():
    """List all available Ollama models and best text model."""
    try:
        resp = requests.get(f"{OLLAMA_URL}/api/tags", timeout=3)
        if not resp.ok:
            return {
                "success": False,
                "ollama_online": False,
                "models": [],
                "text_model": None,
                "vision_model": None,
                "recommended_text_model": OLLAMA_RECOMMENDED_TEXT_MODEL,
            }
        models = [m["name"] for m in resp.json().get("models", [])]
        return {
            "success": True,
            "ollama_online": True,
            "models": models,
            "text_model": _get_ollama_text_model(),
            "vision_model": _get_ollama_vision_model(),
            "recommended_text_model": OLLAMA_RECOMMENDED_TEXT_MODEL,
        }
    except Exception as exc:
        return {
            "success": False,
            "ollama_online": False,
            "models": [],
            "text_model": None,
            "vision_model": None,
            "recommended_text_model": OLLAMA_RECOMMENDED_TEXT_MODEL,
            "error": str(exc),
        }


class OllamaPromptRequest(BaseModel):
    context: str = "zimage"
    mode: str = "enhance"       # "enhance" | "inspire"
    current_prompt: str = ""
    workflow_id: Optional[str] = None
    target_model_family: Optional[str] = None  # e.g. "wan", "qwen", "chroma", "flux"
    style: str = "cinematic"     # cinematic, photoreal, artistic, etc.
    strength: str = "medium"     # low, medium, high, max
    preserve_identity: bool = True
    nsfw: bool = True            # allow full NSFW freedom in enhancement


class OllamaPullRequest(BaseModel):
    name: str = OLLAMA_RECOMMENDED_TEXT_MODEL


@app.post("/api/ollama/pull")
async def ollama_pull_model(req: OllamaPullRequest):
    model_name = (req.name or "").strip() or OLLAMA_RECOMMENDED_TEXT_MODEL
    payload = {"name": model_name, "stream": True}

    def generate():
        try:
            with requests.post(
                f"{OLLAMA_URL}/api/pull",
                json=payload,
                stream=True,
                timeout=1800,
            ) as resp:
                if not resp.ok:
                    detail = (resp.text or "").strip() or f"Ollama pull failed ({resp.status_code})"
                    yield json.dumps({"status": "error", "error": detail}) + "\n"
                    return
                for line in resp.iter_lines(decode_unicode=True):
                    if not line:
                        continue
                    yield f"{line}\n"
        except Exception as exc:
            yield json.dumps({"status": "error", "error": str(exc)}) + "\n"

    return StreamingResponse(
        generate(),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/api/ollama/prompt")
async def ollama_generate_prompt(req: OllamaPromptRequest):
    """Generate or enhance a prompt using Ollama. Returns SSE stream of tokens."""
    model = _get_ollama_text_model()
    if not model:
        raise HTTPException(status_code=503, detail="No Ollama text model available. Pull a model with: ollama pull llama3.2")

    # === AWESOME BIBLE-POWERED ENHANCER ===
    # Uses advanced model-family specific recipes from ollama-bible.md
    system, user_msg = _get_enhancer_messages(req)
    memory_context = _workflow_memory_prompt_context(req.workflow_id)
    if memory_context:
        user_msg = f"{memory_context}\n\n{user_msg}"

    # Keep enhance more deterministic than inspire.
    mode = req.mode
    temp = 0.45 if mode == "enhance" else 0.8
    max_tokens = 240 if req.context == "zimage" else 190

    payload = {
        "model": model,
        "system": system,
        "prompt": user_msg,
        "stream": True,
        "options": {"temperature": temp, "num_predict": max_tokens},
    }

    def generate():
        try:
            r = requests.post(f"{OLLAMA_URL}/api/generate", json=payload, stream=True, timeout=60)
            for line in r.iter_lines():
                if not line:
                    continue
                data = json.loads(line)
                token = data.get("response", "")
                if token:
                    yield f"data: {json.dumps({'token': token})}\n\n"
                if data.get("done"):
                    yield "data: [DONE]\n\n"
                    return
        except Exception as exc:
            yield f"data: {json.dumps({'error': str(exc)})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/api/ollama/caption")
async def ollama_caption_image(file: UploadFile = File(...), context: str = Form("zimage")):
    """Caption an uploaded image using an Ollama vision model."""
    import base64

    model = _get_ollama_vision_model()
    if not model:
        raise HTTPException(
            status_code=503,
            detail="No vision model available. Install one with: ollama pull llava or ollama pull minicpm-v"
        )

    img_bytes = await file.read()
    img_b64 = base64.b64encode(img_bytes).decode()

    payload = {
        "model": model,
        "prompt": _caption_prompt_for_context(context),
        "images": [img_b64],
        "stream": False,
        "options": {"temperature": 0.2, "num_predict": 200},
    }

    try:
        r = requests.post(f"{OLLAMA_URL}/api/generate", json=payload, timeout=90)
        r.raise_for_status()
        caption = _clean_caption_text(r.json().get("response", ""))
        return {"success": True, "caption": caption, "model": model}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Caption failed: {exc}")


@app.get("/api/ollama/vision-models")
async def get_ollama_vision_models():
    """List available Ollama vision models."""
    try:
        resp = requests.get("http://localhost:11434/api/tags", timeout=3)
        if not resp.ok:
            return {"success": False, "models": []}
        data = resp.json()
        vision_models = [
            m["name"]
            for m in data.get("models", [])
            if any(k in m["name"].lower() for k in ["llava", "vision", "minicpm", "qwen"])
        ]
        return {"success": True, "models": vision_models}
    except Exception:
        return {"success": False, "models": []}


class IdeogramLayoutRequest(BaseModel):
    prompt: str


@app.post("/api/ideogram/generate-layout")
async def ideogram_generate_layout(req: IdeogramLayoutRequest):
    """Use local Ollama to auto-generate an Ideogram 4 element layout from a text description."""
    prompt = req.prompt.strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="prompt is required")

    model = _get_ollama_text_model()
    if not model:
        raise HTTPException(status_code=503, detail="No local Ollama text model available.")

    system = (
        "You are an Ideogram 4 layout generator. Output ONLY a single JSON object, no markdown, no explanation.\n"
        "Format:\n"
        '{"description":"one-sentence overview","background":"background description",'
        '"elements":[{"type":"text","text":"TEXT","desc":"font style","x":0.0,"y":0.0,"w":0.9,"h":0.2},'
        '{"type":"obj","text":"","desc":"object description","x":0.0,"y":0.2,"w":1.0,"h":0.6}]}\n\n'
        "Rules:\n"
        "- x,y,w,h are 0.0-1.0 fractions (left, top, width, height of image)\n"
        "- type: 'text' for text elements (fill text field), 'obj' for visual objects (leave text empty)\n"
        "- 2-6 elements max, place title near top, main visual in center, footer near bottom\n"
        "- backgrounds: 'dark studio', 'black bg', 'white bg', 'gradient', or descriptive phrase"
    )

    payload = {
        "model": model,
        "prompt": f"{system}\n\nUser wants: {prompt}\n\nJSON:",
        "stream": False,
        "format": "json",
        "options": {"temperature": 0.35, "top_p": 0.9, "num_predict": 900},
    }

    try:
        resp = requests.post(f"{OLLAMA_URL}/api/generate", json=payload, timeout=60)
        if not resp.ok:
            raise HTTPException(status_code=502, detail=f"Ollama error: {resp.text}")
        raw = str(resp.json().get("response", "")).strip()
        if not raw:
            raise HTTPException(status_code=502, detail="Ollama returned empty response")

        try:
            layout = json.loads(raw)
        except json.JSONDecodeError:
            import re as _re
            m = _re.search(r"\{.*\}", raw, _re.DOTALL)
            if not m:
                raise HTTPException(status_code=502, detail="Could not parse layout JSON")
            layout = json.loads(m.group(0))

        elements = []
        for el in layout.get("elements", []):
            if not isinstance(el, dict):
                continue
            elements.append({
                "type": "text" if str(el.get("type", "")).lower() == "text" else "obj",
                "text": str(el.get("text", "")),
                "desc": str(el.get("desc", "")),
                "x": float(max(0.0, min(1.0, el.get("x", 0.0)))),
                "y": float(max(0.0, min(1.0, el.get("y", 0.0)))),
                "w": float(max(0.02, min(1.0, el.get("w", 0.5)))),
                "h": float(max(0.02, min(1.0, el.get("h", 0.2)))),
            })

        return {
            "success": True,
            "description": str(layout.get("description", prompt)),
            "background": str(layout.get("background", "dark studio background")),
            "elements": elements,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Layout generation failed: {exc}")


# ─────────────────────────────────────────────
# Workflow & Generation
# ─────────────────────────────────────────────
from workflow_service import workflow_service
from module_service import module_service
from model_downloader import model_downloader
from lora_service import lora_service, _normalize_lora_path
from ui_agent_service import UIAgentPlanningError, UIAgentService
import threading
from typing import Dict, Any

class GenerateRequest(BaseModel):
    workflow_id: str
    params: Dict[str, Any]


class UIAgentAttachment(BaseModel):
    kind: str = "image"
    filename: str


class UIAgentPlanRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    current_tab: Optional[str] = None
    attachments: Optional[List[UIAgentAttachment]] = None


class UIAgentPlanPayload(BaseModel):
    plan: Dict[str, Any]


class UIAgentRunRequest(BaseModel):
    plan: Dict[str, Any]
    client_id: Optional[str] = None


class DownloadVideoRequest(BaseModel):
    url: str


class TrimVideoRequest(BaseModel):
    filename: str
    start_sec: float
    end_sec: float


class CaptureFrameRequest(BaseModel):
    filename: str
    time_sec: float


class ImportComfyImageRequest(BaseModel):
    filename: str
    subfolder: str = ""
    type: str = "output"


class ImportLatestOutputRequest(BaseModel):
    subfolder: str = "IMAGE/Z-IMAGE"


def _ui_agent_llm(system: str, prompt: str) -> str:
    model = _get_ollama_text_model()
    if not model:
        raise UIAgentPlanningError(503, "No local Ollama text model available for UI Agent planning.")
    payload = {
        "model": model,
        "system": system,
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": 0.2, "num_predict": 700},
    }
    try:
        response = requests.post(f"{OLLAMA_URL}/api/generate", json=payload, timeout=90)
        if not response.ok:
            detail = (response.text or "").strip() or f"Ollama error: {response.status_code}"
            raise UIAgentPlanningError(response.status_code, detail)
        text = str(response.json().get("response") or "").strip()
        if not text:
            raise UIAgentPlanningError(502, "Ollama returned an empty UI Agent plan.")
        return text
    except UIAgentPlanningError:
        raise
    except Exception as exc:
        raise UIAgentPlanningError(500, f"UI Agent planning failed: {exc}")


ui_agent_service = UIAgentService(
    root_dir=ROOT_DIR,
    workflow_service=workflow_service,
    module_service=module_service,
    lora_service=lora_service,
    llm_fn=_ui_agent_llm,
)


def _zimage_required_models(workflow_id: str, params: Dict[str, Any]) -> List[str]:
    """
    Resolve which Z-Image core models must exist before prompt validation.
    """
    zimage_ids = {"z-image", "z-image-dual-lora", "z-image-dual-base", "z-image-dual-detail", "z-image-controlnet-pose"}
    if workflow_id not in zimage_ids:
        return []

    defaults = {
        "unet_name": "z_image_turbo_bf16.safetensors",
        "clip_name": "qwen_3_4b.safetensors",
        "vae_name": "z-image-vae.safetensors",
    }
    names = [
        str((params or {}).get("unet_name") or defaults["unet_name"]).strip(),
        str((params or {}).get("clip_name") or defaults["clip_name"]).strip(),
        str((params or {}).get("vae_name") or defaults["vae_name"]).strip(),
    ]
    if workflow_id == "z-image-controlnet-pose":
        names.extend([
            "Z-Image-Turbo-Fun-Controlnet-Union.safetensors",
            "lotus-depth-g-v2-0-disparity.safetensors",
            "vae-ft-mse-840000-ema-pruned.safetensors",
            "yolox_l.onnx",
            "dw-ll_ucoco_384_bs5.torchscript.pt",
        ])
    return [n for n in names if n]


def _wan_required_models(workflow_id: str, params: Dict[str, Any]) -> List[str]:
    """Resolve WAN models that Comfy validates before in-graph downloader nodes can run."""
    if workflow_id != "wan21-steady-dancer":
        return []
    return ["clip_vision_h.safetensors", "vitpose-l-wholebody.onnx", "yolov10m.onnx"]


def _flux2klein_required_models(workflow_id: str, params: Dict[str, Any]) -> List[str]:
    """Resolve FLUX2-Klein model files so the UI gets precise missing-file feedback."""
    if workflow_id != "flux2klein-txt2img":
        return []
    return [
        "flux-2-klein-9b-fp8.safetensors",
        "qwen_3_8b_fp8mixed.safetensors",
        "flux2-vae.safetensors",
    ]


def _comfy_input_dir() -> Path:
    path = COMFY_DIR / "input"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _safe_unique_name(prefix: str, suffix: str) -> str:
    clean_prefix = re.sub(r"[^a-zA-Z0-9_-]+", "_", prefix).strip("_") or "media"
    clean_suffix = "." + suffix.strip(".").lower()
    return f"fedda_{clean_prefix}_{uuid.uuid4().hex[:12]}{clean_suffix}"


def _resolve_under(base: Path, relative_name: str) -> Path:
    if not relative_name or "\x00" in relative_name:
        raise HTTPException(status_code=400, detail="Invalid filename")
    candidate = (base / relative_name.replace("\\", "/")).resolve()
    base_resolved = base.resolve()
    if candidate != base_resolved and base_resolved not in candidate.parents:
        raise HTTPException(status_code=400, detail="Invalid filename path")
    return candidate


def _resolve_input_file(filename: str) -> Path:
    path = _resolve_under(_comfy_input_dir(), filename)
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail=f"Input media not found: {filename}")
    return path


def _probe_video_duration(path: Path) -> Optional[float]:
    proc = subprocess.run(
        [_ffmpeg_exe(), "-i", str(path)],
        capture_output=True,
        text=True,
        timeout=30,
    )
    text = f"{proc.stderr or ''}\n{proc.stdout or ''}"
    match = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", text)
    if not match:
        return None
    hours = int(match.group(1))
    minutes = int(match.group(2))
    seconds = float(match.group(3))
    return hours * 3600 + minutes * 60 + seconds


def _validate_wan21_inputs(params: Dict[str, Any]) -> Dict[str, Any]:
    image_name = str((params or {}).get("image") or "").strip()
    video_name = str((params or {}).get("reference_video") or "").strip()
    if not image_name:
        raise HTTPException(status_code=400, detail="Steady Dancer requires a subject image.")
    if not video_name:
        raise HTTPException(status_code=400, detail="Steady Dancer requires a motion reference video.")

    image_path = _resolve_input_file(image_name)
    video_path = _resolve_input_file(video_name)

    try:
        fps = float((params or {}).get("fps") or 0)
        requested_seconds = float((params or {}).get("video_length_seconds") or 0)
    except Exception:
        fps = 0
        requested_seconds = 0
    if fps <= 0 or requested_seconds <= 0:
        raise HTTPException(status_code=400, detail="Steady Dancer requires positive FPS and video length.")
    requested_frames = int(round(fps * requested_seconds))
    if requested_frames < 16:
        raise HTTPException(status_code=400, detail="Steady Dancer needs at least 16 requested frames. Increase length or FPS.")

    duration = _probe_video_duration(video_path)
    if duration is not None and duration + 0.1 < requested_seconds:
        raise HTTPException(
            status_code=400,
            detail=f"Motion reference is {duration:.1f}s, but final run requests {requested_seconds:.1f}s. Trim/select a longer clip or lower length.",
        )

    return {
        "image": str(image_path),
        "reference_video": str(video_path),
        "duration": duration,
        "requested_seconds": requested_seconds,
        "requested_frames": requested_frames,
    }


def _ffmpeg_exe() -> str:
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return "ffmpeg"


def _run_ffmpeg(args: List[str]) -> None:
    cmd = [_ffmpeg_exe(), *args]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout or "ffmpeg failed").strip().splitlines()
        raise HTTPException(status_code=500, detail=detail[-1] if detail else "ffmpeg failed")


@app.post("/api/media/download-video")
async def download_video(req: DownloadVideoRequest):
    """Download one public social/video URL into ComfyUI input as an mp4."""
    parsed = urlparse((req.url or "").strip())
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise HTTPException(status_code=400, detail="Enter a valid http(s) video URL")

    try:
        import yt_dlp
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"yt-dlp is not installed: {exc}")

    input_dir = _comfy_input_dir()
    stem = _safe_unique_name("social", "mp4")[:-4]
    target = input_dir / f"{stem}.mp4"
    outtmpl = str(input_dir / f"{stem}.%(ext)s")

    opts = {
        "format": "bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720][ext=mp4]/best[height<=720]/best",
        "outtmpl": outtmpl,
        "noplaylist": True,
        "merge_output_format": "mp4",
        "quiet": True,
        "no_warnings": True,
        "overwrites": True,
    }
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(req.url.strip(), download=True)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Video download failed: {exc}")

    candidates = sorted(input_dir.glob(f"{stem}.*"), key=lambda p: p.stat().st_mtime if p.exists() else 0, reverse=True)
    source = target if target.exists() else (candidates[0] if candidates else None)
    if not source or not source.exists():
        raise HTTPException(status_code=500, detail="Download finished but no media file was found")
    if source.suffix.lower() != ".mp4":
        _run_ffmpeg(["-y", "-i", str(source), "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", str(target)])
        try:
            source.unlink()
        except Exception:
            pass
    elif source != target:
        source.replace(target)

    return {
        "success": True,
        "filename": target.name,
        "title": (info or {}).get("title"),
        "duration": (info or {}).get("duration"),
    }


@app.post("/api/media/trim-video")
async def trim_video(req: TrimVideoRequest):
    """Trim a ComfyUI input video into a new H.264 mp4 without audio."""
    start = max(0.0, float(req.start_sec))
    end = max(0.0, float(req.end_sec))
    if end <= start + 0.1:
        raise HTTPException(status_code=400, detail="Trim end must be after start")
    if end - start > 180:
        raise HTTPException(status_code=400, detail="Clip is too long for Steady Dancer staging; keep it under 180 seconds")

    source = _resolve_input_file(req.filename)
    target = _comfy_input_dir() / _safe_unique_name("trim", "mp4")
    _run_ffmpeg([
        "-y",
        "-ss", f"{start:.3f}",
        "-i", str(source),
        "-t", f"{end - start:.3f}",
        "-an",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "20",
        "-pix_fmt", "yuv420p",
        str(target),
    ])
    return {"success": True, "filename": target.name, "duration": end - start}


@app.post("/api/media/capture-frame")
async def capture_frame(req: CaptureFrameRequest):
    """Capture one PNG frame from a ComfyUI input video into ComfyUI input."""
    time_sec = max(0.0, float(req.time_sec))
    source = _resolve_input_file(req.filename)
    target = _comfy_input_dir() / _safe_unique_name("pose_frame", "png")
    _run_ffmpeg(["-y", "-ss", f"{time_sec:.3f}", "-i", str(source), "-frames:v", "1", "-q:v", "2", str(target)])
    return {"success": True, "filename": target.name}


@app.post("/api/media/import-image")
async def import_comfy_image(req: ImportComfyImageRequest):
    """Copy a generated Comfy image from output/temp/input into input so another workflow can LoadImage it."""
    media_type = (req.type or "output").strip().lower()
    if media_type == "input":
        source_base = _comfy_input_dir()
    elif media_type == "temp":
        source_base = COMFY_DIR / "temp"
    else:
        source_base = OUTPUT_DIR
    relative = f"{(req.subfolder or '').strip().strip('/')}/{req.filename}".lstrip("/")
    source = _resolve_under(source_base, relative)
    if not source.exists() or not source.is_file():
        raise HTTPException(status_code=404, detail=f"Generated image not found: {req.filename}")
    suffix = source.suffix.lower().lstrip(".") or "png"
    target = _comfy_input_dir() / _safe_unique_name("approved_pose", suffix)
    shutil.copy2(source, target)
    return {"success": True, "filename": target.name}


@app.post("/api/media/import-latest-output")
async def import_latest_output(req: ImportLatestOutputRequest):
    """Copy the newest generated image from a ComfyUI output subfolder into input."""
    subfolder = (req.subfolder or "").strip().replace("\\", "/").strip("/")
    source_dir = _resolve_under(OUTPUT_DIR, subfolder) if subfolder else OUTPUT_DIR.resolve()
    if not source_dir.exists() or not source_dir.is_dir():
        raise HTTPException(status_code=404, detail=f"Output folder not found: {subfolder or 'output'}")

    allowed_suffixes = {".png", ".jpg", ".jpeg", ".webp"}
    candidates = [
        p for p in source_dir.iterdir()
        if p.is_file() and p.suffix.lower() in allowed_suffixes
    ]
    if not candidates:
        raise HTTPException(status_code=404, detail=f"No image outputs found in {subfolder or 'output'}")

    source = max(candidates, key=lambda p: p.stat().st_mtime)
    suffix = source.suffix.lower().lstrip(".") or "png"
    target = _comfy_input_dir() / _safe_unique_name("approved_pose", suffix)
    shutil.copy2(source, target)
    return {
        "success": True,
        "filename": target.name,
        "source_filename": source.name,
        "source_subfolder": subfolder,
    }

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    """Upload a video or image to ComfyUI's input directory."""
    try:
        content = await file.read()
        resp = requests.post(
            f"{COMFY_URL}/upload/image",
            files={"image": (file.filename, content, file.content_type or "application/octet-stream")},
            timeout=120,
        )
        resp.raise_for_status()
        data = resp.json()
        return {"success": True, "filename": data.get("name", file.filename)}
    except requests_exceptions.ConnectionError:
        raise HTTPException(status_code=503, detail=_comfy_proxy_error())
    except Exception as e:
        # Keep other errors (e.g. bad response from Comfy) but avoid dumping raw ConnectionPool spam
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/workflow/list")
async def list_workflows():
    """List available high-level workflows from the mapping."""
    try:
        mapping = workflow_service.load_mapping()
        return {
            "success": True,
            "workflows": [
                module_service.annotate_workflow(
                    k,
                    {"name": v["name"], "description": v.get("description", "")},
                )
                for k, v in mapping.items()
            ]
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.get("/api/ui-agent/workflows")
async def list_ui_agent_workflows():
    """List the plan-only workflow set exposed to the UI Agent control panel."""
    try:
        return {"success": True, "workflows": ui_agent_service.list_workflows()}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/ui-agent/plan")
async def ui_agent_plan(req: UIAgentPlanRequest):
    """Interpret one natural-language request into an editable plan. Never queues generation."""
    try:
        attachments = [item.dict() for item in (req.attachments or [])]
        return ui_agent_service.plan(
            message=req.message,
            session_id=req.session_id or "",
            current_tab=req.current_tab or "",
            attachments=attachments,
        )
    except UIAgentPlanningError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/ui-agent/prepare")
async def ui_agent_prepare(req: UIAgentPlanPayload):
    """Validate an edited UI Agent plan and return the exact generation payload."""
    try:
        return ui_agent_service.prepare(req.plan)
    except UIAgentPlanningError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/ui-agent/run")
async def ui_agent_run(req: UIAgentRunRequest):
    """Validate an approved UI Agent plan, then queue generation through the shared generator."""
    try:
        prepared = ui_agent_service.prepare(req.plan)
        if not prepared.get("ready"):
            raise HTTPException(
                status_code=400,
                detail=" ".join(prepared.get("blocked_reasons") or ["Plan is not ready to generate."]),
            )
        params = dict(prepared.get("params") or {})
        if req.client_id:
            params["client_id"] = req.client_id
        result = await generate(GenerateRequest(workflow_id=str(prepared["workflow_id"]), params=params))
        if isinstance(result, dict) and result.get("success"):
            result["ui_agent"] = {
                "workflow_id": prepared["workflow_id"],
                "workflow_label": prepared.get("workflow_label"),
                "memory_entry": ui_agent_service.remember_run(req.plan, result),
            }
        return result
    except HTTPException:
        raise
    except UIAgentPlanningError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/api/ui-agent/mempalace/status")
async def ui_agent_mempalace_status():
    """Expose the local MemPalace-compatible adapter status used by UI Agent."""
    try:
        return ui_agent_service.mempalace_status()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/api/modules")
async def list_modules(enabled_only: bool = False):
    """List core and booster modules from the shared manifest."""
    try:
        manifest = module_service.load_manifest()
        return {
            "success": True,
            "version": manifest.get("version", 0),
            "active_profile": manifest.get("active_profile"),
            "policy": manifest.get("policy", {}),
            "modules": module_service.list_modules(enabled_only=enabled_only),
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.get("/api/modules/install-state")
async def get_module_install_state():
    """Return the current install profile and enabled/disabled module inventory."""
    try:
        return {"success": True, **module_service.get_install_state()}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.get("/api/modules/profiles")
async def list_install_profiles():
    """List available core/booster install profiles."""
    try:
        profiles = module_service.load_profiles()
        return {
            "success": True,
            "default_profile": profiles.get("default_profile"),
            "profiles": profiles.get("profiles", {}),
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.post("/api/modules/apply-profile/{profile_id}")
async def apply_install_profile(profile_id: str):
    """Enable only the modules in a named install profile."""
    try:
        result = module_service.apply_profile(profile_id, persist=True)
        return {"success": True, **result}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/modules/{module_id}")
async def get_module(module_id: str):
    """Return one module with validation against workflow and node config."""
    module = module_service.get_module(module_id)
    if not module:
        raise HTTPException(status_code=404, detail=f"Unknown module '{module_id}'")
    return {"success": True, "module": module}


@app.get("/api/modules/workflow/{workflow_id}")
async def get_workflow_module(workflow_id: str):
    """Return the module that owns a workflow id, if any."""
    module = module_service.module_for_workflow(workflow_id)
    if not module:
        raise HTTPException(status_code=404, detail=f"No module owns workflow '{workflow_id}'")
    return {"success": True, "module": module}

@app.get("/api/workflow/node-map/{workflow_id}")
async def get_workflow_node_map(workflow_id: str):
    """Return nodeId -> metadata map for a workflow (used to show human-readable node names during execution)."""
    try:
        mappings = workflow_service.load_mapping()
        if workflow_id not in mappings:
            raise HTTPException(status_code=404, detail=f"Unknown workflow '{workflow_id}'")
        mapping = mappings[workflow_id]
        path = workflow_service.get_workflow_path(mapping.get("filename", ""))
        if not path:
            raise HTTPException(status_code=404, detail="Workflow file not found")
        with open(path, "r", encoding="utf-8-sig") as f:
            workflow = json.load(f)
        node_map = {}
        for node_id, node in workflow.items():
            if not isinstance(node, dict):
                continue
            class_type = node.get("class_type", "Unknown")
            title = node.get("_meta", {}).get("title") or class_type
            info = {"name": title, "classType": class_type}
            if class_type == "HuggingFaceDownloader":
                download_files = [
                    {
                        "filename": item.get("filename"),
                        "folder": item.get("folder"),
                        "exists": item.get("exists"),
                        "size_bytes": item.get("size_bytes", 0),
                    }
                    for item in _parse_workflow_download_links({str(node_id): node})
                ]
                missing = [item for item in download_files if not item.get("exists")]
                info.update({
                    "isDownloader": True,
                    "downloaderType": "huggingface",
                    "downloadTotal": len(download_files),
                    "downloadMissing": len(missing),
                    "downloadFiles": download_files,
                })
            elif class_type in {"DownloadAndLoadSAM2Model", "DownloadAndLoadFlorence2Model"}:
                download_files = [
                    {
                        "filename": item.get("filename"),
                        "folder": item.get("folder"),
                        "exists": item.get("exists"),
                        "size_bytes": item.get("size_bytes", 0),
                    }
                    for item in _workflow_builtin_model_download_files(str(node_id), node)
                ]
                missing = [item for item in download_files if not item.get("exists")]
                info.update({
                    "isDownloader": True,
                    "downloaderType": "sam2" if class_type == "DownloadAndLoadSAM2Model" else "florence2",
                    "downloadTotal": len(download_files),
                    "downloadMissing": len(missing),
                    "downloadFiles": download_files,
                })
            node_map[node_id] = info
        return {"success": True, "node_map": node_map}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _filename_from_download_line(parts: List[str]) -> str:
    if len(parts) >= 3 and parts[2].strip():
        return Path(parts[2].strip()).name
    url_path = parts[0].split("?", 1)[0].rstrip("/")
    return Path(url_path).name


def _parse_workflow_download_links(workflow: Dict[str, Any]) -> List[Dict[str, Any]]:
    files: List[Dict[str, Any]] = []
    seen = set()

    for node_id, node in workflow.items():
        if not isinstance(node, dict):
            continue
        inputs = node.get("inputs") or {}
        raw_links = str(inputs.get("download_links") or "").strip()
        if not raw_links:
            continue

        node_title = (node.get("_meta") or {}).get("title") or node.get("class_type") or str(node_id)
        for line in raw_links.splitlines():
            clean = line.strip()
            if not clean or clean.startswith("#"):
                continue
            parts = clean.split()
            if len(parts) < 2:
                continue
            url = parts[0].strip()
            folder = parts[1].strip().replace("\\", "/").strip("/")
            filename = _filename_from_download_line(parts)
            if not url.startswith(("http://", "https://")) or not folder or not filename:
                continue
            key = (folder.lower(), filename.lower())
            if key in seen:
                continue
            seen.add(key)
            target = ROOT_DIR / "ComfyUI" / "models" / folder / filename
            exists = target.exists() and target.is_file() and target.stat().st_size > 10_000
            files.append({
                "node_id": str(node_id),
                "node_title": str(node_title),
                "url": url,
                "folder": folder,
                "filename": filename,
                "path": str(target),
                "exists": exists,
                "size_bytes": target.stat().st_size if exists else 0,
            })
    return files


def _workflow_builtin_model_download_files(node_id: str, node: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Expose model files downloaded by custom loader nodes that are not HuggingFaceDownloader."""
    class_type = str(node.get("class_type", ""))
    inputs = node.get("inputs") or {}
    node_title = (node.get("_meta") or {}).get("title") or class_type or str(node_id)
    files: List[Dict[str, Any]] = []

    if class_type == "DownloadAndLoadSAM2Model":
        model_name = str(inputs.get("model") or "").strip()
        precision = str(inputs.get("precision") or "").strip()
        if model_name:
            resolved_name = model_name
            if precision != "fp32" and "2.1" in resolved_name:
                base_name, extension = resolved_name.rsplit(".", 1)
                resolved_name = f"{base_name}-fp16.{extension}"
            target = ROOT_DIR / "ComfyUI" / "models" / "sam2" / resolved_name
            exists = target.exists() and target.is_file() and target.stat().st_size > 10_000
            files.append({
                "node_id": str(node_id),
                "node_title": str(node_title),
                "url": "https://huggingface.co/Kijai/sam2-safetensors",
                "folder": "sam2",
                "filename": resolved_name,
                "path": str(target),
                "exists": exists,
                "size_bytes": target.stat().st_size if exists else 0,
            })

    if class_type == "DownloadAndLoadFlorence2Model":
        repo_id = str(inputs.get("model") or "").strip()
        if repo_id:
            folder_name = repo_id.rsplit("/", 1)[-1]
            target = ROOT_DIR / "ComfyUI" / "models" / "LLM" / folder_name
            exists = target.exists() and target.is_dir() and any(target.iterdir())
            files.append({
                "node_id": str(node_id),
                "node_title": str(node_title),
                "url": f"https://huggingface.co/{repo_id}",
                "folder": "LLM",
                "filename": folder_name,
                "path": str(target),
                "exists": exists,
                "size_bytes": 0,
            })

    return files


@app.get("/api/workflow/model-status/{workflow_id}")
async def get_workflow_model_status(workflow_id: str):
    """Expose model downloader requirements embedded in a Comfy workflow."""
    try:
        mappings = workflow_service.load_mapping()
        if workflow_id not in mappings:
            raise HTTPException(status_code=404, detail=f"Unknown workflow '{workflow_id}'")
        mapping = mappings[workflow_id]
        path = workflow_service.get_workflow_path(mapping.get("filename", ""))
        if not path:
            raise HTTPException(status_code=404, detail="Workflow file not found")
        with open(path, "r", encoding="utf-8-sig") as f:
            workflow = json.load(f)
        files = _parse_workflow_download_links(workflow)
        for node_id, node in workflow.items():
            if isinstance(node, dict):
                files.extend(_workflow_builtin_model_download_files(str(node_id), node))
        required_wan = _wan_required_models(workflow_id, {})
        wan_preflight = model_downloader.ensure_wan_core_models(required_wan) if required_wan else None
        required_flux2klein = _flux2klein_required_models(workflow_id, {})
        # FLUX2-Klein workflows carry their own HuggingFaceDownloader node.
        # Keep model-status observational here; do not start a backend download
        # or mark the workflow as impossible before Comfy can run that node.
        flux2klein_preflight = None
        if wan_preflight:
            for item in wan_preflight.get("files", []):
                files.append({
                    "node_id": "preflight",
                    "node_title": "FEDDA WAN preflight",
                    "url": "",
                    "folder": str(Path(str(item.get("path", ""))).parent.name),
                    "filename": item.get("filename"),
                    "path": item.get("path"),
                    "exists": bool(item.get("exists")),
                    "size_bytes": Path(str(item.get("path"))).stat().st_size if item.get("exists") else 0,
                    "status": item.get("status"),
                    "error": item.get("error"),
                })
        if flux2klein_preflight:
            for item in flux2klein_preflight.get("files", []):
                item_path = Path(str(item.get("path", "")))
                files.append({
                    "node_id": "preflight",
                    "node_title": "FEDDA FLUX2-Klein preflight",
                    "url": "",
                    "folder": str(item_path.parent.name),
                    "filename": item.get("filename"),
                    "path": item.get("path"),
                    "exists": bool(item.get("exists")),
                    "size_bytes": item_path.stat().st_size if item.get("exists") else 0,
                    "status": item.get("status"),
                    "error": item.get("error"),
                })
        missing = [f for f in files if not f.get("exists")]
        return {
            "success": True,
            "workflow_id": workflow_id,
            "name": mapping.get("name", workflow_id),
            "ready": len(missing) == 0,
            "total": len(files),
            "missing_count": len(missing),
            "files": files,
            "wan_preflight": wan_preflight,
            "flux2klein_preflight": flux2klein_preflight,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/workflow/download-live-progress/{workflow_id}")
async def get_workflow_download_live_progress(workflow_id: str):
    """Return current on-disk byte counts for each file the workflow's HuggingFaceDownloader will fetch.
    The frontend polls this every 2 s while the downloader node is executing to show live progress."""
    try:
        mappings = workflow_service.load_mapping()
        if workflow_id not in mappings:
            return {"files": []}
        mapping = mappings[workflow_id]
        path = workflow_service.get_workflow_path(mapping.get("filename", ""))
        if not path:
            return {"files": []}
        with open(path, "r", encoding="utf-8-sig") as f:
            workflow = json.load(f)
        result = []
        for item in _parse_workflow_download_links(workflow):
            target = Path(item["path"])
            current_bytes = 0
            is_complete = False
            try:
                if target.exists() and target.is_file():
                    sz = target.stat().st_size
                    if sz > 10_000:
                        current_bytes = sz
                        is_complete = True
                    else:
                        current_bytes = sz
                # Some download managers write partial files with these suffixes
                for suffix in (".incomplete", ".part", ".tmp"):
                    partial = Path(str(target) + suffix)
                    try:
                        if partial.exists() and partial.is_file():
                            current_bytes = max(current_bytes, partial.stat().st_size)
                    except OSError:
                        pass
            except OSError:
                pass
            result.append({
                "filename": item["filename"],
                "folder": item["folder"],
                "exists": is_complete,
                "currentBytes": current_bytes,
            })
        return {"files": result}
    except Exception as e:
        return {"files": [], "error": str(e)}


@app.post("/api/generate")
async def generate(req: GenerateRequest):
    """
    Core generation endpoint.
    Loads workflow, injects params, and sends to ComfyUI.
    """
    print(f"[GENERATE] Received workflow_id='{req.workflow_id}' | loras_count={len(req.params.get('loras') or [])}")

    workflow_availability = module_service.is_workflow_available(req.workflow_id)
    if not workflow_availability.get("available"):
        raise HTTPException(
            status_code=403,
            detail=workflow_availability.get("detail")
            or f"Workflow '{req.workflow_id}' is not available in the current install",
        )

    if req.workflow_id == "flux2klein-txt2img":
        print("========== /api/generate RECEIVED for flux2klein-txt2img ==========")
        print(f"  loras in params: {req.params.get('loras', 'NOT PRESENT')}")
        if req.params.get('loras'):
            print(f"  >>> LORA NAMES BEING SENT: {[l.get('name') for l in req.params.get('loras', [])]}")
    try:
        wan_input_debug = None
        if req.workflow_id == "wan21-steady-dancer":
            wan_input_debug = _validate_wan21_inputs(req.params)
            print(f"[GENERATE] WAN21 input validation: {wan_input_debug}")

        required_models = _zimage_required_models(req.workflow_id, req.params)
        if required_models:
            preflight = model_downloader.ensure_zimage_core_models(required_models)
            if not preflight.get("ready", False):
                missing = [
                    f for f in preflight.get("files", [])
                    if f.get("status") != "completed" or not f.get("exists")
                ]
                names = ", ".join(str(f.get("filename")) for f in missing)
                raise HTTPException(
                    status_code=409,
                    detail=f"Auto-downloading required Z-Image model(s): {names}. Please retry when download completes.",
                )

        required_wan_models = _wan_required_models(req.workflow_id, req.params)
        if required_wan_models:
            preflight = model_downloader.ensure_wan_core_models(required_wan_models)
            if not preflight.get("ready", False):
                missing = [
                    f for f in preflight.get("files", [])
                    if f.get("status") != "completed" or not f.get("exists")
                ]
                names = ", ".join(str(f.get("filename")) for f in missing)
                raise HTTPException(
                    status_code=409,
                    detail=f"Auto-downloading required WAN model(s): {names}. Please retry when download completes.",
                )

        required_flux2klein_models = _flux2klein_required_models(req.workflow_id, req.params)
        if required_flux2klein_models:
            print(
                "[GENERATE] FLUX2-Klein model availability is delegated to "
                "the workflow HuggingFaceDownloader node: "
                f"{', '.join(required_flux2klein_models)}"
            )

        # 1. Prepare ComfyUI API payload
        payload = workflow_service.prepare_payload(req.workflow_id, req.params)
        if not payload:
            raise HTTPException(status_code=400, detail=f"Failed to prepare workflow '{req.workflow_id}'")

        wan_payload_debug = None
        zimage_pose_debug = None
        flux2klein_payload_debug = None
        if req.workflow_id == "wan21-steady-dancer":
            wan_payload_debug = workflow_service.verify_wan21_payload(payload, req.params)
            if not wan_payload_debug.get("ok"):
                raise HTTPException(
                    status_code=400,
                    detail="; ".join(wan_payload_debug.get("errors") or ["Steady Dancer payload verification failed"]),
                )
        if req.workflow_id == "z-image-controlnet-pose":
            zimage_pose_debug = workflow_service.verify_zimage_controlnet_payload(payload, req.params)
            if not zimage_pose_debug.get("ok"):
                raise HTTPException(
                    status_code=400,
                    detail="; ".join(zimage_pose_debug.get("errors") or ["Z-Image ControlNet payload verification failed"]),
                )

        # 2. Submit to ComfyUI — use the browser's clientId so WS messages route back correctly
        if req.workflow_id == "flux2klein-txt2img":
            flux2klein_payload_debug = workflow_service.verify_flux2klein_payload(payload, req.params)
            selected_loras = flux2klein_payload_debug.get("requested_loras") or []
            missing_lora_files = []
            for lora_name in selected_loras:
                lora_path = (lora_service.lora_dir / str(lora_name).replace("\\", "/")).resolve()
                if not lora_path.exists() or not lora_path.is_file():
                    missing_lora_files.append(str(lora_name))
            if missing_lora_files:
                raise HTTPException(
                    status_code=400,
                    detail=f"FLUX2-KLEIN selected LoRA file not found: {', '.join(missing_lora_files)}",
                )
            if not flux2klein_payload_debug.get("ok"):
                raise HTTPException(
                    status_code=400,
                    detail="; ".join(flux2klein_payload_debug.get("errors") or ["FLUX2-KLEIN payload verification failed"]),
                )

        client_id = req.params.get("client_id", "fedda_hub_v2")
        comfy_payload = {"prompt": payload, "client_id": client_id}
        resp = requests.post(f"{COMFY_URL}/prompt", json=comfy_payload, timeout=5)
        
        if not resp.ok:
            error_text = resp.text
            try:
                error_data = resp.json()
                error_msg = error_data.get("error", {}).get("message", "ComfyUI API error")
            except:
                error_msg = error_text
            raise HTTPException(status_code=resp.status_code, detail=error_msg)
            
        return {
            "success": True, 
            "prompt_id": resp.json().get("prompt_id"),
            "message": "Generation started",
            "debug": {
                "wan_inputs": wan_input_debug,
                "wan_payload": wan_payload_debug,
                "zimage_pose": zimage_pose_debug,
                "flux2klein_payload": flux2klein_payload_debug,
            } if req.workflow_id in {"wan21-steady-dancer", "z-image-controlnet-pose", "flux2klein-txt2img"} else None,
        }
    except HTTPException:
        raise
    except requests_exceptions.ConnectionError:
        raise HTTPException(status_code=503, detail=_comfy_proxy_error())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/generate/status/{prompt_id}")
async def get_generation_status(prompt_id: str, workflow_id: str = ""):
    """Check status of a specific generation job. Returns all output files."""
    def _latest_workflow_image_fallback(wf_id: str) -> List[Dict[str, str]]:
        if not wf_id:
            return []
        try:
            mappings = workflow_service.load_mapping()
            mapping = mappings.get(wf_id)
            if not mapping:
                return []
            path = workflow_service.get_workflow_path(mapping.get("filename", ""))
            if not path:
                return []
            with open(path, "r", encoding="utf-8-sig") as f:
                workflow = json.load(f)
            if not workflow_service.is_api_format(workflow):
                workflow = workflow_service.convert_ui_to_api(workflow)

            prefixes = []
            for node in workflow.values():
                if not isinstance(node, dict) or node.get("class_type") != "SaveImage":
                    continue
                prefix = str((node.get("inputs") or {}).get("filename_prefix") or "").replace("\\", "/").strip("/")
                if prefix:
                    prefixes.append(prefix)

            allowed_suffixes = {".png", ".jpg", ".jpeg", ".webp"}
            candidates = []
            for prefix in prefixes:
                folder = str(Path(prefix).parent).replace("\\", "/")
                if folder in {".", ""}:
                    folder = ""
                source_dir = _resolve_under(OUTPUT_DIR, folder) if folder else OUTPUT_DIR.resolve()
                if not source_dir.exists() or not source_dir.is_dir():
                    continue
                for item in source_dir.iterdir():
                    if item.is_file() and item.suffix.lower() in allowed_suffixes:
                        candidates.append((item, folder))

            if not candidates:
                return []
            source, subfolder = max(candidates, key=lambda pair: pair[0].stat().st_mtime)
            return [{
                "filename": source.name,
                "subfolder": subfolder,
                "type": "output",
                "fallback": True,
            }]
        except Exception as exc:
            print(f"[status fallback] Failed for workflow_id={wf_id}: {exc}")
            return []

    def _extract_boxes(value):
        boxes = []
        seen = set()

        def add_box(x1, y1, x2, y2):
            try:
                box = [float(x1), float(y1), float(x2), float(y2)]
            except Exception:
                return
            if box[2] <= box[0] or box[3] <= box[1]:
                return
            key = tuple(round(v, 4) for v in box)
            if key in seen:
                return
            seen.add(key)
            boxes.append(box)

        def walk(v):
            if isinstance(v, dict):
                # Direct bbox-like objects
                if all(k in v for k in ("x1", "y1", "x2", "y2")):
                    add_box(v.get("x1"), v.get("y1"), v.get("x2"), v.get("y2"))
                if all(k in v for k in ("left", "top", "right", "bottom")):
                    add_box(v.get("left"), v.get("top"), v.get("right"), v.get("bottom"))
                for item in v.values():
                    walk(item)
                return
            if isinstance(v, (list, tuple)):
                if len(v) >= 4:
                    if all(isinstance(v[i], (int, float)) for i in range(4)):
                        add_box(v[0], v[1], v[2], v[3])
                    elif all(isinstance(v[i], str) and str(v[i]).replace(".", "", 1).replace("-", "", 1).isdigit() for i in range(4)):
                        add_box(float(v[0]), float(v[1]), float(v[2]), float(v[3]))
                for item in v:
                    walk(item)

        walk(value)
        return boxes

    try:
        # Check history first
        resp = requests.get(f"{COMFY_URL}/history/{prompt_id}", timeout=2)
        if resp.ok:
            data = resp.json()
            if prompt_id in data:
                history = data[prompt_id]
                outputs = history.get("outputs", {})
                images = []
                videos = []
                audios = []
                detected_boxes = []
                for node_id, output in outputs.items():
                    # Still images
                    for img in output.get("images", []):
                        images.append({
                            "filename": img["filename"],
                            "subfolder": img.get("subfolder", ""),
                            "type": img.get("type", "output")
                        })
                    # VHS_VideoCombine outputs as 'gifs' (mp4/webp)
                    for vid in output.get("gifs", []):
                        videos.append({
                            "filename": vid["filename"],
                            "subfolder": vid.get("subfolder", ""),
                            "type": vid.get("type", "output")
                        })
                    # Some nodes output 'videos'
                    for vid in output.get("videos", []):
                        videos.append({
                            "filename": vid["filename"],
                            "subfolder": vid.get("subfolder", ""),
                            "type": vid.get("type", "output")
                        })
                    # Audio outputs (SaveAudio / PreviewAudio variants)
                    for aud in output.get("audio", []):
                        audios.append({
                            "filename": aud["filename"],
                            "subfolder": aud.get("subfolder", ""),
                            "type": aud.get("type", "output")
                        })
                    for aud in output.get("audios", []):
                        audios.append({
                            "filename": aud["filename"],
                            "subfolder": aud.get("subfolder", ""),
                            "type": aud.get("type", "output")
                        })
                    # Collect potential bbox outputs for pause/select workflows.
                    try:
                        detected_boxes.extend(_extract_boxes(output))
                    except Exception:
                        pass
                if not images:
                    images = _latest_workflow_image_fallback(workflow_id)
                return {
                    "success": True,
                    "status": "completed",
                    "images": images,
                    "videos": videos,
                    "audios": audios,
                    "detected_boxes": detected_boxes,
                    "raw_outputs": outputs,
                }

        # Check queue
        q_resp = requests.get(f"{COMFY_URL}/queue", timeout=2)
        if q_resp.ok:
            q_data = q_resp.json()
            running = q_data.get("queue_running", [])
            pending = q_data.get("queue_pending", [])
            if any(j[1] == prompt_id for j in running):
                return {"success": True, "status": "running", "images": [], "videos": [], "audios": []}
            if any(j[1] == prompt_id for j in pending):
                return {"success": True, "status": "pending", "images": [], "videos": [], "audios": []}

        fallback_images = _latest_workflow_image_fallback(workflow_id)
        if fallback_images:
            return {"success": True, "status": "completed", "images": fallback_images, "videos": [], "audios": [], "fallback": True}
        return {"success": True, "status": "not_found", "images": [], "videos": [], "audios": []}
    except requests_exceptions.ConnectionError:
        return {"success": False, "error": _comfy_proxy_error()}
    except Exception as e:
        return {"success": False, "error": str(e)}

# ─────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────
@app.post("/api/models/sync-hf")
async def sync_models(repo: str, subfolder: str = "custom"):
    return model_downloader.sync_hf_repo(repo, subfolder)

@app.get("/api/models/status/{filename}")
async def get_download_status(filename: str):
    return model_downloader.get_progress(filename)


@app.post("/api/models/zimage-core/ensure")
async def ensure_zimage_core_models(payload: Optional[Dict[str, Any]] = None):
    model_names = []
    if payload and isinstance(payload.get("models"), list):
        model_names = [str(x).strip() for x in payload.get("models", []) if str(x).strip()]
    return model_downloader.ensure_zimage_core_models(model_names or None)


# ─────────────────────────────────────────────
# LoRA Library
# ─────────────────────────────────────────────

@app.get("/api/lora/list")
async def lora_list(prefix: str = ""):
    """List installed LoRA paths. Optional ?prefix= filters by subfolder (e.g. zimage_turbo)."""
    loras = lora_service.list_lora_names()
    if prefix:
        norm_prefix = _normalize_lora_path(prefix) + "/"
        loras = [l for l in loras if _normalize_lora_path(l).startswith(norm_prefix)]
    return {"success": True, "loras": loras}


@app.get("/api/lora/installed")
async def lora_installed():
    """Return all installed LoRA files with path + size."""
    return {"success": True, "installed": lora_service.get_installed()}


@app.get("/api/lora/download-status/{filename}")
async def lora_download_status(filename: str):
    return lora_service.get_download_status(filename)


@app.get("/api/lora/pack/{pack_key}/status")
async def pack_status(pack_key: str):
    return lora_service.get_pack_status(pack_key)


@app.get("/api/lora/pack/{pack_key}/catalog")
async def pack_catalog(pack_key: str, limit: int = 1000):
    return lora_service.get_pack_catalog(pack_key, limit)


class SingleDownloadRequest(BaseModel):
    filename: str

@app.post("/api/lora/pack/{pack_key}/sync")
async def pack_sync(pack_key: str):
    return lora_service.sync_pack(pack_key)


@app.post("/api/lora/pack/{pack_key}/download")
async def pack_download_single(pack_key: str, req: SingleDownloadRequest):
    return lora_service.download_single(pack_key, req.filename)


class InstallFreeRequest(BaseModel):
    filename: str

@app.post("/api/lora/install-free")
async def install_free_lora(req: InstallFreeRequest):
    return lora_service.install_free_lora(req.filename)


@app.post("/api/lora/install-all-free")
async def install_all_free():
    return lora_service.install_all_free()


class ImportUrlRequest(BaseModel):
    url: str
    hf_token: Optional[str] = None
    civitai_token: Optional[str] = None

@app.post("/api/lora/import-url")
async def lora_import_url(req: ImportUrlRequest):
    return lora_service.import_from_url(req.url, req.hf_token, req.civitai_token)


# ─────────────────────────────────────────────────────────────
# Local LoRA Upload (Drag & Drop from UI)
# ─────────────────────────────────────────────────────────────
@app.post("/api/lora/upload-local")
async def lora_upload_local(
    file: UploadFile = File(...),
    family: str = Form(...)
):
    """
    Accepts a .safetensors file dropped by the user.
    Places it automatically into the correct subfolder under ComfyUI/models/loras/
    based on the current family/tab the user has open.
    """
    if not file.filename.lower().endswith(('.safetensors', '.ckpt', '.pt')):
        raise HTTPException(status_code=400, detail="Only .safetensors (and common model formats) are allowed.")

    # Get the destination subfolder from lora_service
    dest_subfolder = lora_service.get_dest_for_family(family)
    if not dest_subfolder:
        dest_subfolder = family  # fallback

    target_dir = lora_service.lora_dir / dest_subfolder
    target_dir.mkdir(parents=True, exist_ok=True)

    target_path = target_dir / file.filename

    try:
        contents = await file.read()
        with open(target_path, "wb") as f:
            f.write(contents)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")

    # Refresh cache in lora_service if it has one
    if hasattr(lora_service, "refresh_cache"):
        lora_service.refresh_cache()

    return {
        "success": True,
        "filename": file.filename,
        "path": str(target_path.relative_to(lora_service.lora_dir)),
        "family": family,
        "dest": str(dest_subfolder)
    }


@app.get("/api/lora/import-status/{job_id}")
async def lora_import_status(job_id: str):
    return lora_service.get_import_status(job_id)


if __name__ == "__main__":
    print("[Fedda Hub v2] Starting backend on port 8000...")
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
