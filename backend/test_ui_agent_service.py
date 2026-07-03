from pathlib import Path

from ui_agent_service import UIAgentService


WORKFLOW_INPUTS = {
    "z-image": ["prompt", "negative", "width", "height", "seed", "steps", "cfg", "loras"],
    "flux2klein-txt2img": ["prompt", "negative", "seed", "steps", "cfg", "sampler_name", "loras"],
    "firered-image-edit": ["image", "prompt", "seed", "use_lightning", "steps", "cfg"],
    "qwen-rapid-edit-v23": ["image", "prompt", "negative", "width", "height", "seed", "steps", "cfg", "sampler_name"],
    "ltx-img2vid": ["image", "prompt", "negative", "seed", "lora_name", "lora_strength"],
}


class FakeWorkflowService:
    def load_mapping(self):
        return {
            workflow_id: {
                "name": workflow_id,
                "description": "",
                "inputs": {key: {} for key in keys},
            }
            for workflow_id, keys in WORKFLOW_INPUTS.items()
        }


class FakeModuleService:
    def module_for_workflow(self, workflow_id):
        return {"id": workflow_id, "enabled": True}


class FakeLoraService:
    def list_lora_names(self):
        return [
            "zimage_turbo/sara-zimageturbo-120526_copy_0.safetensors",
            "flux2klein/auroraskonberg_flux2-klein-base9b_000001250.safetensors",
            "qwen/not-for-flux.safetensors",
        ]


def fake_llm(_system, _prompt):
    return "{}"


def build_service():
    return UIAgentService(
        root_dir=Path(__file__).resolve().parent.parent,
        workflow_service=FakeWorkflowService(),
        module_service=FakeModuleService(),
        lora_service=FakeLoraService(),
        llm_fn=fake_llm,
    )


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def main():
    service = build_service()
    workflows = service.list_workflows()
    ids = {item["workflow_id"] for item in workflows}
    require(ids == set(WORKFLOW_INPUTS), f"unexpected workflow ids: {ids}")

    sara = service.plan("create a image using sara zimage lora and in a clown costume")
    sara_plan = sara["plan"]
    require(sara_plan["workflow_id"] == "z-image", "Sara prompt should route to Z-Image")
    require(sara_plan["params"]["steps"] == 11, "Z-Image should use 11 steps")
    require(sara_plan["params"]["cfg"] == 1, "Z-Image should use CFG 1")
    require(sara_plan["params"]["loras"][0]["name"].startswith("zimage_turbo/"), "Sara LoRA must be Z-Image")

    aurora = service.plan("make Aurora with flux klein, fashion photo, red dress")
    aurora_plan = aurora["plan"]
    require(aurora_plan["workflow_id"] == "flux2klein-txt2img", "Aurora prompt should route to FLUX2-KLEIN")
    require(aurora_plan["params"]["width"] == 1024, "FLUX2-KLEIN should keep width in editable plan params")
    require(aurora_plan["params"]["height"] == 1024, "FLUX2-KLEIN should keep height in editable plan params")
    require(aurora_plan["params"]["steps"] == 8, "FLUX2-KLEIN should use 8 steps")
    require(aurora_plan["params"]["cfg"] == 1.2, "FLUX2-KLEIN should use CFG 1.2")
    require(aurora_plan["params"]["loras"][0]["name"].startswith("flux2klein/"), "Aurora LoRA must be FLUX2-KLEIN")
    require("qwen-edit-2512" not in ids, "parked Qwen Txt2Img must not be exposed")

    prepared = service.prepare(aurora_plan)
    require(prepared["ready"], "Valid FLUX2-KLEIN plan should prepare")
    require(prepared["params"]["loras"][0]["name"].startswith("flux2klein/"), "Prepared LoRA must stay FLUX2-KLEIN")

    bad_flux = dict(aurora_plan)
    bad_flux["params"] = dict(aurora_plan["params"])
    bad_flux["params"]["loras"] = [{"name": "qwen/not-for-flux.safetensors", "strength": 1}]
    bad_prepared = service.prepare(bad_flux)
    require("loras" not in bad_prepared["params"], "Wrong-family LoRA should be stripped before generation")

    edit = service.plan("edit this image with qwen rapid")
    edit_prepared = service.prepare(edit["plan"])
    require(not edit_prepared["ready"], "Image edit plan without source image should not be ready")
    require(edit_prepared["blocked_reasons"], "Missing source image should be reported")

    status = service.mempalace_status()
    require(status["mode"] == "fedda-local-palace", "MemPalace adapter should run in local palace mode")

    print("UI Agent service smoke test passed.")


if __name__ == "__main__":
    main()
