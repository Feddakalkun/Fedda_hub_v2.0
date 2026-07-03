"""
Quick verification script: test FLUX2-KLEIN workflow payload preparation
exactly as the UI would invoke it via /api/generate.

Run from the repository root:
  python backend/test_flux2klein_injection.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from workflow_service import workflow_service


NODE_PROMPT = "180"
NODE_NEGATIVE = "205:189"
NODE_SEED = "192"
NODE_STEPS = "204"
NODE_CFG = "205:185"
NODE_LORA = "205:522"


def require(condition, message):
    if not condition:
        print(f"[FAIL] {message}")
        sys.exit(1)


def main():
    workflow_id = "flux2klein-txt2img"

    print("=" * 70)
    print("TEST: FLUX2-KLEIN 9B Txt2Img payload injection (no LoRAs)")
    print("=" * 70)

    params_no_lora = {
        "prompt": "beautiful young woman, freckles, soft smile, natural lighting, highly detailed",
        "negative": "blurry, low quality, deformed, ugly",
        "seed": 123456789,
        "steps": 14,
        "cfg": 1.0,
        "width": 1024,
        "height": 1024,
    }

    payload = workflow_service.prepare_payload(workflow_id, params_no_lora)
    require(payload, "prepare_payload returned None / falsy")
    print("[OK] Payload prepared successfully (API format)")

    prompt_val = payload[NODE_PROMPT]["inputs"].get("value", "")
    neg_val = payload[NODE_NEGATIVE]["inputs"].get("text", "")
    seed_val = payload[NODE_SEED]["inputs"].get("noise_seed")
    steps_val = payload[NODE_STEPS]["inputs"].get("value")
    cfg_val = payload[NODE_CFG]["inputs"].get("cfg")

    require(prompt_val == params_no_lora["prompt"], f"prompt was not injected into node {NODE_PROMPT}")
    require(neg_val == params_no_lora["negative"], f"negative prompt was not injected into node {NODE_NEGATIVE}")
    require(seed_val == params_no_lora["seed"], f"seed was not injected into node {NODE_SEED}")
    require(steps_val == params_no_lora["steps"], f"steps were not injected into node {NODE_STEPS}")
    require(cfg_val == params_no_lora["cfg"], f"cfg was not injected into node {NODE_CFG}")

    print(f"  {NODE_PROMPT} (prompt) value starts with: {prompt_val[:60]!r}...")
    print(f"  {NODE_NEGATIVE} (negative) text: {neg_val[:50]!r}...")
    print(f"  {NODE_SEED}/{NODE_STEPS}/{NODE_CFG} seed/steps/cfg: {seed_val}/{steps_val}/{cfg_val}")

    n_lora = payload.get(NODE_LORA, {})
    lora_slots = [k for k in n_lora.get("inputs", {}).keys() if k.startswith("lora_")]
    require(not lora_slots, f"node {NODE_LORA} should have no lora slots when no LoRAs are sent")
    print(f"  {NODE_LORA} (rgthree) lora slots present: none (correct)")

    print()
    print("=" * 70)
    print("TEST: FLUX2-KLEIN 9B Txt2Img payload injection (WITH LoRAs)")
    print("=" * 70)

    params_with_lora = dict(params_no_lora)
    params_with_lora["loras"] = [
        {"name": "flux2klein/character_freckles_v1.safetensors", "strength": 0.85},
        {"name": "flux1dev/detailer_v2.safetensors", "strength": 0.55},
    ]

    payload2 = workflow_service.prepare_payload(workflow_id, params_with_lora)
    require(payload2, "prepare_payload (with loras) returned None")

    n_lora_2 = payload2.get(NODE_LORA, {})
    lora_slots_2 = {k: v for k, v in n_lora_2.get("inputs", {}).items() if k.startswith("lora_")}
    print(f"[OK] rgthree node {NODE_LORA} received {len(lora_slots_2)} lora slot(s)")
    for slot, data in lora_slots_2.items():
        print(f"    {slot}: on={data.get('on')}, lora={data.get('lora')}, strength={data.get('strength')}")

    require(len(lora_slots_2) == 1, f"expected exactly one compatible LoRA on node {NODE_LORA}")
    injected = next(iter(lora_slots_2.values()))
    injected_name = injected.get("lora", "").replace("\\", "/")
    require(injected_name.startswith("flux2klein/"), "injected LoRA must be flux2klein-prefixed")
    require("flux1dev" not in injected_name, "incompatible flux1dev LoRA was not filtered")

    classic_lora_nodes = [nid for nid in payload2.keys() if nid.startswith("_lora_")]
    require(not classic_lora_nodes, f"unexpected classic _lora_ nodes were created: {classic_lora_nodes}")
    print("[OK] No classic _lora_ replacement nodes were created (correct for rgthree path)")

    require(NODE_LORA in payload2, f"rgthree node {NODE_LORA} was removed - wiring will break")
    print(f"[OK] rgthree node {NODE_LORA} still present in final payload (not deleted)")

    print()
    print("=" * 70)
    print("ALL INJECTION TESTS PASSED")
    print("=" * 70)
    print("The UI should now be able to generate with FLUX2-KLEIN")
    print("both with and without LoRAs from the flux2klein tab.")
    print()
    print("Next manual step: run the v15 app and click through")
    print("RichHome > Image Studio > Flux2-Klein Txt2Img and hit Generate.")


if __name__ == "__main__":
    main()
