# FEDDA + RunPod Quickstart (Local UI + Remote GPU)

Denne guiden er for deg som vil kjore FEDDA lokalt, men bruke RunPod GPU (f.eks. RTX 5090) til rendering.

## 1) Start FEDDA lokalt

1. Start FEDDA som vanlig (`run.bat`).
2. Aapne UI lokalt (vanligvis `http://localhost:5173`).

## 2) Start en RunPod GPU pod

1. Gaa til RunPod Console -> `Pods`.
2. Velg GPU (f.eks. RTX 5090).
3. Velg **Pod template**:
   - `PyTorch 2.8+` (RTX 5090 krever dette)
   - Hvis RunPod viser warning om 2.8+, folg warningen.
4. Sett `Network Volume` ON.
5. Sett `Container Disk` minst 60GB.
6. Opprett pod.
7. Vent til pod er `Running`.

Tips:
- RTX 5090 fungerer fint for denne hybrid-modusen.
- Tilgjengelighet varierer per region/tidspunkt.

### Konkret anbefalt deploy-oppsett (RTX 5090)

- GPU: `RTX 5090`
- Pod template: `PyTorch 2.8+`
- GPU count: `1`
- Network Volume: `ON`
- Volume size: `120 GB+` (modeller + output vokser fort)
- Container disk: `60 GB+`
- Pricing: `On-Demand` for stabilitet (Spot kan avbrytes)

## 3) Finn URLene FEDDA trenger

Naar poden er oppe, bruk pod-id i disse formatene:

- ComfyUI endpoint:
  - `https://<POD_ID>-8199.proxy.runpod.net/prompt`
- ComfyUI base (for test i nettleser):
  - `https://<POD_ID>-8199.proxy.runpod.net/`
- File Explorer (valgfri):
  - `https://<POD_ID>-8888.proxy.runpod.net/lab/tree`

## 4) Lim inn i FEDDA Settings

`Settings -> Cloud Engines / RunPod Integration`

1. `Compute Mode` -> `RunPod Pod (Remote ComfyUI)`
2. `RunPod Endpoint URL` -> lim inn `...-8199.../prompt`
3. `RunPod Bearer Token` -> valgfri (kun hvis ditt endpoint krever auth)
4. `RunPod File Explorer URL` -> valgfri (`...-8888.../lab/tree`)
5. Trykk `Save Cloud Settings`

## 5) Verifiser

1. Trykk `Open ComfyUI` fra settings.
2. Kjor en liten test-jobb.
3. Hvis output kommer i FEDDA-preview, er alt riktig satt opp.

## 6) Disk vs Volume (viktig)

- **Container Disk**: brukes av OS/runtime/packages midlertidig i pod.
- **Network Volume**: persistent lagring for modeller og outputs.

Hvis du skal laste mange modeller, er det **Network Volume** du maa gi god plass.

## 7) Hvis du vil bruke FEDDA sin ferdige Docker direkte (beste praksis)

Hvis du bruker deploy-scriptet i repoet, bruk image:

- `ghcr.io/feddakalkun/comfyuifeddafront:latest`

Da slipper du manuell install i Pytorch-template og faar riktig service-stack (frontend/backend/comfy) automatisk.

## Vanlige feil

- `ECONNREFUSED`:
  - Pod er stoppet, feil port, eller feil endpoint-URL.
- Ingen output:
  - Sjekk at endpoint slutter med `/prompt`.
- Timeout/pod_loading:
  - Første kjoring kan bruke tid (model load/cold start).

## Om Google login pa landing page

Google login alene forenkler normalt ikke RunPod-koblingen.
RunPod-integrasjonen trenger fortsatt endpoint + token (eller annen RunPod-spesifikk auth).

Det er mulig aa legge til Google-login for FEDDA-konto/profiler senere, men det erstatter ikke RunPod-credentials i v1.
