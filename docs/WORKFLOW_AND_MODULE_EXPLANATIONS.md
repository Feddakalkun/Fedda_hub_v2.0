# Workflow and Module Explanations

This document serves as the master catalog for all FEDDA Hub workflows, used for consistent messaging in promotional posters and UI cards.

## Core & System Modules
- **Image Studio**: Primary workspace for image generation workflows and asset management.
- **Video Studio**: Central hub for video generation, motion transfer, and animation workflows.
- **Gallery**: Interface for viewing, organizing, and managing generated media assets.
- **LoRA & Character**: Library for managing and applying LoRA models and character-specific fine-tunes.
- **Ollama Models**: Integration for running local large language models for chat and automation.
- **Venice.ai**: Interface for interacting with Venice.ai cloud services.
- **Grok**: Integration for specialized Grok model workflows.
- **Zonos TTS**: Text-to-speech engine integration for voice generation.
- **Companion**: Interactive AI persona or assistant interface.

## Image Generation Modules
- **Z-Image Txt2Img**: Core text-to-image generation using the Z-Image Turbo model.
- **Z-Image Dual LoRA**: Advanced refinement pack applying two simultaneous LoRAs for high-detail generation.
- **Chroma1-HD**: High-definition base image generation with softer artistic defaults.
- **Chroma Simple**: Simplified version of the Chroma pipeline for quick, high-quality results.
- **FLUX2-KLEIN**: Txt2img workflow based on the FLUX2 family, tuned for high aesthetic fidelity.
- **FLUX KLEIN UNCENSORED**: Unrestricted variant of FLUX2-KLEIN for unconstrained artistic expression.
- **IDEOGRAM**: Specialized local workflow for precise text and object placement, allowing complex layout editing.
- **FireRed Edit**: Image editing and manipulation pipeline utilizing the FireRed transformer model.
- **Qwen Image**: General image-to-image editing suite powered by Qwen vision models.
- **Qwen Reference**: Image generation constrained by a provided reference image.
- **Qwen Rapid Edit**: High-speed, iterative editing workflow for rapid prototyping of image changes.
- **Qwen Multi Angle**: Generates multiple viewing angles for a single subject based on a reference.
- **SDXL INPAINT AUTOMASK**: Performs intelligent, automated masking for seamless inpainting with SDXL.
- **SDXL OUTPAINT**: Expands existing images outward to create new backgrounds or wider compositions.
- **SDXL ControlNet Depth**: Precise spatial control using depth mapping for complex scenes.
- **SDXL ControlNet OpenPose**: Exact pose control using skeleton-based OpenPose tracking.

## Video & Motion Modules
- **WAN 2.2 Img2Vid**: Animate a single static reference image into a video clip.
- **WAN 2.2 Vid2Vid**: Transform and extend existing video clips into new visual styles.
- **WAN Story**: Generates video sequences based on a structured six-frame story layout.
- **Steady Dancer**: Transfers dance motion from a source reference video onto a new character.
- **SCAIL-2**: Animates reference photos using dance/pose motion data via SCAIL-2 GGUF models.
- **LTX Img2Vid**: Image-to-video animation using the LTX model family.
- **LTX First / Last**: Motion interpolation workflow generating frames between two specified keyframes.
