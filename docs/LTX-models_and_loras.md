# LTX‑modeller og LoRAer (LTX‑Video & LTX‑2)

## Oversikt

Denne rapporten oppsummerer de viktigste åpne LTX‑modellene (LTX‑Video / LTXV og LTX‑2), både som safetensors og GGUF‑varianter, samt sentrale offisielle og community‑LoRAer for bevegelseskontroll, stil og hastighets‑/distillasjonsbruk per april 2026.[^1][^2][^3]

## Base‑modeller: LTX‑Video / LTXV

### Offisielle LTX‑Video‑safetensors

Lightricks publiserer de offisielle LTX‑Video‑vektene og tilhørende latent‑upsamplere på Hugging Face under `Lightricks/LTX-Video`.[^4][^5][^6]

Viktige filer (safetensors):

- **Hoved‑U‑Net / transformer (13B, 0.9.7‑dev)**: `ltxv-13b-0.9.7-dev.safetensors`.[^6]
- **FP8‑variant for raskere kjøring**: `ltxv-13b-0.9.7-dev-fp8.safetensors`.[^6]
- **Spatial upscaler 0.9.7**: `ltxv-spatial-upscaler-0.9.7.safetensors`.[^6]
- **Temporal upscaler 0.9.7**: `ltxv-temporal-upscaler-0.9.7.safetensors`.[^6]
- Nyere dev‑checkpoint 0.9.8 brukes sammen med `ltxv-spatial-upscaler-0.9.8` i offisielle diffusers‑eksempler.[^4]

Disse modellene brukes i både tekst‑til‑video og image/video‑til‑video pipelines i diffusers og ComfyUI.[^5][^1][^4]

### LTX‑Video GGUF‑modeller

Flere maintainere har konvertert LTX‑Video til GGUF for lav‑VRAM‑oppsett.[^7][^8][^6]

Vesentlige repos:

| Repo | Innhold | Notater |
|------|---------|--------|
| `city96/LTX-Video-gguf` | Direkte GGUF‑konvertering av Lightricks/LTX‑Video, for bruk med ComfyUI‑GGUF | Modellfiler plasseres i `ComfyUI/models/unet`.[^9] |
| `wsbagnsv1/ltxv-13b-0.9.7-dev-GGUF` | GGUF‑filer for 13B 0.9.7‑dev, inkl. eksempel‑workflow | Brukes mye i ComfyUI‑tutorials for 13B‑modellen.[^6] |
| `calcuis/ltxv-gguf` | GGUF‑kvantiserte og FP8‑skalerte varianter av LTX‑Video 2B v0.9 | Viser bruk med `GGUFQuantizationConfig` i diffusers.[^7] |

Disse reposene dekker både større 13B‑modellen og mindre 2B‑varianten i flere kvantiseringer (Q4, Q8 osv.).[^7][^6]

## Base‑modeller: LTX‑2 og LTX‑2.3

### Offisielle LTX‑2 safetensors

Den offisielle 19B LTX‑2‑modellen ligger under `Lightricks/LTX-2` på Hugging Face.[^2]

Modelltreet (safetensors) inneholder blant annet:[^3]

- `ltx-2-19b-dev` (full 19B‑modell i bf16).
- `ltx-2-19b-dev-fp8` (FP8‑variant for lavere VRAM).[^3]
- `ltx-2-19b-dev-fp4` (NVFP4‑variant, optimalisert for RTX 40‑serie).[^3]
- `ltx-2-19b-distilled` (distillert versjon, 8 steg, CFG=1).[^3]
- `ltx-2-19b-distilled-lora-384.safetensors` (distillert LoRA brukt på fullmodellen).[^2][^3]
- `ltx-2-spatial-upscaler-x2-1.0.safetensors` (x2 spatial latent‑upscaler).[^3]
- `ltx-2-temporal-upscaler-x2-1.0.safetensors` (x2 temporal latent‑upscaler).[^3]

Tekst‑encoder (Gemma 3 12B) og embeddings‑connector leveres som egne safetensors og brukes sammen med video‑ og audio‑VAEer.[^10][^11]

### LTX‑2.3 oppdatert modell

`Lightricks/LTX-2.3` beskriver en oppdatert versjon av LTX‑2 med bedre bilde‑ og lydkvalitet samt bedre prompt‑adheranse.[^12]

Det finnes også offisielle IC‑LoRAer og kontroll‑LoRAer trent på toppen av LTX‑2.3‑22B‑varianten, se LoRA‑seksjonen under.[^13][^14]

### LTX‑2 safetensors‑pakker for ComfyUI

Civitai‑pakken **“LTX 2 :19B (All You Need is Here!)”** samler lenker til offisielle LTX‑2‑safetensors (dev, FP8‑distilled, spatial/temporal upscalere osv.) og er nyttig som “one‑stop” oversikt.[^15]

Veiledninger for ComfyUI viser typisk katalogstruktur som:

```text
ComfyUI/models/
  vae/
    LTX2_audio_vae_bf16.safetensors
    LTX2_video_vae_bf16.safetensors
  text_encoders/
    ltx-2-19b-embeddings_connector_bf16.safetensors
    gemma_3_12B_it_fp8_e4m3fn.safetensors
  diffusion_models/
    ltx2-19b-Q4_K_M.gguf (eller annen kvantisering)
  latent_upscale_models/
    ltx-2-spatial-upscaler-x2-1.0.safetensors
  loras/
    ltx-2-19b-distilled-lora-384.safetensors
```

## LTX‑2 GGUF‑modeller (lav VRAM)

LTX‑2 er bredt portet til GGUF for å støtte 8–16 GB‑GPUer i ComfyUI‑oppsett.[^16][^10]

Viktige GGUF‑repositorier:

| Repo | Type | Innhold |
|------|------|---------|
| `unsloth/LTX-2-GGUF` | GGUF kvantisering av hele LTX‑2 | Inneholder flere kvantiseringer (Q2–Q4 osv.) av `ltx-2-19b-dev` og relaterte checkpoints.[^3][^11] |
| `QuantStack/LTX-2-GGUF` | Direkte GGUF‑konvertering | Gir tabell over hvor U‑Net, tekst‑encodere og VAEer skal plasseres i ComfyUI.[^17] |
| `gguf-org/ltx2-gguf` | Strukturert GGUF‑pakke | Kombinerer dev‑modell, Gemma‑encoder og VAE‑filer i én repo.[^18] |
| `gguf-org/ltx2-gguf` (enkeltfiler) | Individuell kvantisering | Eksempel: `ltx2-19b-distilled-q2_k.gguf`.[^19] |
| `smthem/LTX-2-Test-gguf` | Test‑GGUF | 22B‑variant i Q4_K_S, ment for eksperimenter på 4 GB‑VRAM + stor system‑RAM.[^20] |
| `unsloth/LTX-2.3-GGUF` | GGUF‑versjon av LTX‑2.3 | Kvantisert 2.3‑modell med Unsloth‑optimalisering for ComfyUI‑GGUF.[^21] |

Flere guider (bloggposter og videoer) beskriver hvordan man velger riktig kvantisering (Q2_K, Q4_K_M, Q4_K_S osv.) for 8, 12 og 16 GB‑kort samt hvordan man legger inn tilhørende VAE‑ og encoder‑safetensors.[^11][^16][^10]

## LoRAer for LTX‑2 og LTX‑2.3

### “Speed‑up” / distillasjons‑LoRAer

Den viktigste hastighets‑LoRAen er den offisielle distillerings‑LoRAen fra Lightricks:[^2][^3]

- **`ltx-2-19b-distilled-lora-384.safetensors`** (Lightricks/LTX‑2)
  - Brukes på toppen av full 19B‑modellen.[^2]
  - Lar Stage 2 kjøres med kun tre inference‑steg i kombinasjon med forhåndsberegnede sigma‑verdier, noe som dramatisk reduserer kjøretid sammenlignet med 40+ steg standardsetup.[^2]

Civitai‑pakken “LTX 2 :19B (All You Need is Here!)” lister også distillert FP8‑modell og tilhørende LoRA som hurtig‑alternativ.[^15]

### Offisielle IC‑LoRAer og bevegelseskontroll (motion)

Lightricks har introdusert flere **IC‑LoRAer (In‑Context LoRA)** for LTX‑2.3 som gir eksplisitt kontroll over bevegelse og kameraføring.[^14][^22]

Viktige eksempler:

- **LTX‑2.3‑22B IC‑LoRA Motion Track Control** (`Lightricks/LTX-2.3-22b-IC-LoRA-Motion-Track-Control`)
  - Lar brukeren styre bevegelse ved å tegne eller spore spline‑baner i referansevideo; generert video følger disse bevegelsesbanene.[^14]
- **LTX‑2.3‑22B IC‑LoRA Union Control** (`Lightricks/LTX-2.3-22b-IC-LoRA-Union-Control`)
  - Brukes sammen med Motion Track‑LoRA i avanserte ComfyUI‑workflows for å kombinere flere kontrollsignaler (kamera, objekter osv.).[^13]

Blogg og treningsguider fra LTX forklarer at IC‑LoRAer generelt finnes i moduser som **Canny**, **Depth** og **Pose**, som henholdsvis fokuserer på kanter, 3D‑geometri/kamera og menneskelig bevegelse.[^22][^23]

### Kvalitets‑ og detalj‑LoRAer

Flere høyprofilerte LoRAer forbedrer detaljnivå og skarphet i LTX‑2‑videoer:

- **IC‑LoRA Detailer – LTX‑2** (`ltx-2-19b-ic-lora-detailer`) på Civitai.[^24]
  - Designet for å øke mikrodetaljer, teksturer og lokal klarhet uten å endre overordnet komposisjon eller bevegelse.[^24]
  - Anbefales brukt med moderat vekt og gjerne før spatiale oppskalingssteg.[^24]
- En offisiell IC‑LoRA Detailer finnes også som Hugging‑Face‑repo fra Lightricks, brukt i flere GGUF‑workflows.[^25]

### Motion‑ og effekt‑LoRAer (stil + bevegelsesmønstre)

Det finnes en voksende LoRA‑økologi rundt LTX‑2 som koder bestemte bevegelsesmønstre eller kameraføringer.[^26][^23]

Representative eksempler:

- **Image2Video Adapter LoRA** for LTX‑2 (`MachineDelusions/LTX-2_Image2Video_Adapter_LoRa`).[^27]
  - Forbedrer bevegelse i image‑to‑video‑pipelines ved å gi bedre bevegelseskoherens fra stillbilde til animert sekvens.[^27]
- **Kiss the Viewer – LTX‑2 LoRA** (Civitai).[^28]
  - Video + audio‑LoRA som får karakteren til å gå mot kamera, se inn i linsen og kysse den; nyttig som ferdig koreografert bevegelsesscene.[^28]
- **Clair Obscur Expedition 33 – LTX‑2** (Civitai).[^29]
  - Video + audio‑LoRA som lærer både stil og spesifikke kampanimajoner (armor materializing, kamerabaner rundt karakteren osv.).[^29]

Treningsguider for LTX‑2.3 beskriver hvordan motion‑LoRAer trenes på korte, koherente klipp for å lære kamera‑panorer, objektrotasjoner og transformasjonseffekter som kan overføres til nye scener.[^26]

### LoRA‑samlinger og workflows med LoRA‑støtte

Flere Civitai‑workflows er eksplisitt bygget rundt LTX‑2‑LoRAer:

- **LTX‑2.3 DEV/DIST workflow** med Power LoRA Loader, som anbefaler:
  - Image‑to‑Video Adapter‑LoRA for bedre motion.[^27]
  - Detailer‑LoRA og spatial upscale‑LoRA i en to‑pass pipeline (motion + upscale).[^27]
- **LTX‑2 GGUF I2V workflow** med Power LoRA Loaders, som lar deg laste kamera‑LoRAer og sfw/nsfw‑LoRAer i et subgraph på Stage 2.[^30]
- **LTX‑2 19B GGUF 12GB workflows** (t2v/i2v/v2v/ta2v/ia2v), som setter opp LoRA‑slots for detalj‑ og stil‑LoRAer sammen med GGUF‑modellen.[^31]

## Oppsummering for praktisk bruk

- **Store modeller**: LTX‑Video 13B (0.9.7/0.9.8) og LTX‑2 19B/22B som fulle safetensors gir best kvalitet, men krever høy VRAM.[^12][^4][^6][^2]
- **Små/lav‑VRAM‑valg**: 2B LTX‑Video GGUF (`calcuis/ltxv-gguf`) og flere LTX‑2 GGUF‑kvantiseringer fra Unsloth, QuantStack, gguf‑org og andre dekker 8–16 GB‑GPUer.[^17][^18][^7][^3]
- **Speed‑up**: bruk `ltx-2-19b-distilled` + `ltx-2-19b-distilled-lora-384.safetensors` for svært få sampling‑steg på LTX‑2, eventuelt tilsvarende distillerte LTX‑Video‑checkpoints.[^32][^15][^2]
- **Motion‑kontroll**: sats på IC‑LoRA Motion Track/Union‑Control for presis kamerabevegelse og objektbaner i LTX‑2.3.[^22][^13][^14]
- **Kvalitet/detaljer**: kombiner IC‑LoRA Detailer og stil‑LoRAer (for eksempel Clair Obscur, Kiss the Viewer) med spatial/temporal upscalere for skarp, filmatisk output.[^29][^28][^24][^3]

Denne oversikten dekker de mest sentrale offisielle og community‑drevne modellene og LoRAene per april 2026; nye varianter publiseres fortløpende, spesielt på Hugging Face (Lightricks‑organisasjonen, Unsloth, QuantStack, gguf‑org) og Civitai under tagger som `ltx-2`, `ltxv` og `gguf`.[^33][^15][^2]

---

## References

1. [LTX-Video - Hugging Face](https://huggingface.co/docs/diffusers/en/api/pipelines/ltx_video) - We’re on a journey to advance and democratize artificial intelligence through open source and open s...

2. [Lightricks/LTX-2 - Hugging Face](https://huggingface.co/Lightricks/LTX-2) - LTX-2 is a DiT-based audio-video foundation model designed to generate synchronized video and audio ...

3. [unsloth/LTX-2-GGUF - Hugging Face](https://huggingface.co/unsloth/LTX-2-GGUF) - We’re on a journey to advance and democratize artificial intelligence through open source and open s...

4. [Lightricks/LTX-Video - Hugging Face](https://huggingface.co/Lightricks/LTX-Video) - We’re on a journey to advance and democratize artificial intelligence through open source and open s...

5. [diffusers/docs/source/en/api/pipelines/ltx_video.md at main · huggingface/diffusers](https://github.com/huggingface/diffusers/blob/main/docs/source/en/api/pipelines/ltx_video.md) - 🤗 Diffusers: State-of-the-art diffusion models for image, video, and audio generation in PyTorch and...

6. [LTX Video 13B In ComfyUI - Still The Most Fastest AI VIdeo Generation Model Locally](https://www.youtube.com/watch?v=2asTwiDn0y0) - LTX Video 13B In ComfyUI - Still The Most Fastest AI VIdeo Generation Model Locally

In this video, ...

7. [calcuis/ltxv-gguf - Hugging Face](https://huggingface.co/calcuis/ltxv-gguf) - We’re on a journey to advance and democratize artificial intelligence through open source and open s...

8. [LTX 13 billion GGUF model for low V-RAM - Generate AI videos](https://www.youtube.com/watch?v=msD0_uOEqnA) - 🌟 LTX 0.9.7 released a 13 billion model, and in this tutorial, I will be using the GGUF models in Co...

9. [city96/LTX-Video-gguf - Hugging Face](https://huggingface.co/city96/LTX-Video-gguf) - We’re on a journey to advance and democratize artificial intelligence through open source and open s...

10. [How to Install and Configure LTX-2 GGUF Models in ComfyUI](https://dev.to/gary_yan_86eb77d35e0070f5/how-to-install-and-configure-ltx-2-gguf-models-in-comfyui-complete-2026-guide-1d3m) - ltx2-19b-Q4_0.gguf (~10GB). For 12GB VRAM (Recommended):. ltx2-19b-Q4_K_S.gguf (~11GB); ltx2 ...

11. [LTX 2: LOW VRAM GGUF WORKFLOW | AI VIDEO GENERATOR | (FREE WORKFLOW INCLUDED)](https://www.youtube.com/watch?v=qBtNIWDHCOQ) - This video shows how to run LTX-2 on LOW VRAM using GGUF models in ComfyUI.
If you don’t have a 32GB...

12. [Lightricks/LTX-2.3 - Hugging Face](https://huggingface.co/Lightricks/LTX-2.3) - This model card focuses on the LTX-2.3 model, which is a significant update to the LTX-2 model with ...

13. [ICLORA|How to PERFECTLY Control AI Video Motion (LTX 2.3)](https://www.youtube.com/watch?v=Qr2LKowf7NE) - ICLORA|How to PERFECTLY Control AI Video Motion (LTX 2.3). 2.4K views · 10 days ago. #ComfyUI #LoRA ...

14. [Lightricks/LTX-2.3-22b-IC-LoRA-Motion-Track-Control - Hugging Face](https://huggingface.co/Lightricks/LTX-2.3-22b-IC-LoRA-Motion-Track-Control) - LTX-2.3 22B IC-LoRA Motion Track Control. This is a motion track control IC-LoRA trained on top of L...

15. [LTX 2 :19B (All You Need is Here!) - Civitai](https://civitai.com/models/2291679/ltx-2-19b-all-you-need-is-here) - LTX2 19B DISTILLED LORA. LTX2 SPATIAL UPSCALER. LTX2 TEMPORAL UPSCALER ... GGUF. LTX2 Audio VAE BF16...

16. [How to Install and Configure LTX-2 GGUF Models in ComfyUI ...](https://ltx-2.run/blog/how-to-install-ltx-2-gguf-models-comfyui/) - 详细的分步指南，教你在消费级GPU上运行LTX-2。了解GGUF量化和性能优化。

17. [QuantStack/LTX-2-GGUF - Hugging Face](https://huggingface.co/QuantStack/LTX-2-GGUF) - We’re on a journey to advance and democratize artificial intelligence through open source and open s...

18. [gguf-org/ltx2-gguf - Hugging Face](https://huggingface.co/gguf-org/ltx2-gguf) - Model tree for gguf-org/ltx2-gguf. Base model. Lightricks/LTX-2.

19. [ltx2-19b-distilled-q2_k.gguf - Hugging Face](https://huggingface.co/gguf-org/ltx2-gguf/blob/main/ltx2-19b-distilled-q2_k.gguf) - gguf-org. /. ltx2-gguf. like 16. Follow. gguf 150 ... This file is stored with Xet . It is too big t...

20. [smthem/LTX-2-Test-gguf - Hugging Face](https://huggingface.co/smthem/LTX-2-Test-gguf) - LTX-2 gguf for test.. Example. sample in Vram=4G ,Ram >32G,GGUF Q4_K_S. Downloads last month: 820. G...

21. [unsloth/LTX-2.3-GGUF - Hugging Face](https://huggingface.co/unsloth/LTX-2.3-GGUF) - LTX-2.3 Model Card. This model card focuses on the LTX-2.3 model, which is a significant update to t...

22. [Learn How to Use IC-LoRA in LTX-2](https://ltx.io/model/model-blog/how-to-use-ic-lora-in-ltx-2) - IC-LoRA (In-Context LoRA) transfers structure and motion from reference videos into LTX-2 generation...

23. [LTX-2.3 IC-LoRA Training: Motion Control and Audio-to-Video ...](https://www.runcomfy.com/trainer/ai-toolkit/ltx-2-3-ic-lora-motion-control-audio-to-video) - This early-guide page explains what LTX-2.3 IC-LoRAs are trying to do, how motion-track and audio-to...

24. [IC LORA DETAILER - LTX2 - Civitai](https://civitai.com/models/2293339/ltx2-ic-lora-detailer) - This LoRA is designed to enhance fine visual details and local clarity in LTX-2 generated videos, im...

25. [GGUF LTX2 FOR LOW VRAM 1080p 10 seconds - YouTube](https://www.youtube.com/watch?v=lYeLa1evx0Q) - ... 19b-IC-LoRA-Detailer/tree/main GGUF file, embeddings, and Gemma I ... GGUF LTX2 FOR LOW VRAM 108...

26. [LTX-2.3 LoRA Training Guide: Style, Motion & IC-LoRA Control (2026)](https://wavespeed.ai/blog/posts/ltx-2-3-lora-training-guide-2026/) - Train custom LoRAs on LTX-2.3 using the official ltx-trainer. Covers style LoRAs, IC-LoRA structural...

27. [LTX-2.3 DEV/DIST - IMAGE to Video and TEXT to Video with Ollama ...](https://civitai.com/models/2318870/ltx-23-devdist-image-to-video-and-text-to-video-with-ollamartx-vsr) - Image to Video and a Text to Video workflow, both can use own Prompts or Ollama generated/enhanced p...

28. [Kiss the Viewer - LTX-2 LoRA - v1.0 - Civitai](https://civitai.com/models/2291037/kiss-the-viewer-ltx-2-lora) - A video + audio LoRA for LTX-2 that creates that intimate "kiss the camera" effect. Character walks ...

29. [Clair Obscur Expedition 33 - LTX-2 - v1.0 | LTXV LoRA - Civitai](https://civitai.com/models/2287974/clair-obscur-expedition-33-ltx-2) - This is a video + audio LoRA for LTX-2 that turns characters into Clair Obscure Expedition 33 style ...

30. [LTX-2 GGUF I2V image-to-video workflow with power lora loaders ...](https://civitai.com/models/2313807/ltx-2-gguf-i2v-image-to-video-workflow-with-power-lora-loaders-good-quality-outputs) - LTX-2 GGUF I2V image-to-video workflow with power lora loaders and tiled vae decode, I modified this...

31. [LTX-2 19B GGUF 12GB ComfyUI Workflows 5 TOTAL! t2v/i2v/v2v ...](https://civitai.com/models/2304098/ltx-2-19b-gguf-12gb-comfyui-workflows-5-total-t2vi2vv2via2vta2v) - Feed ltx2 a few seconds of video, create a prompt to continue the video and watch the magic happen!!...

32. [LTX Distilled and GGUF Models - Comfy UI](https://www.youtube.com/watch?v=FonWzq7CRUg) - 🌟 LTX 0.9.7 released a 13 billion distilled model, and in this tutorial, I will be using the distill...

33. [ltx-2 AI Models - Civitai](https://civitai.com/tag/ltx-2) - Browse 26 Stable Diffusion & Flux models, LoRAs, checkpoints, and embeddings tagged with ltx-2. High...

