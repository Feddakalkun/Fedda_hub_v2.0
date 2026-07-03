# FEDDA Pre-Push Smoke Checklist

Run this before pushing to `main` to avoid breaking fresh installs.

## 1) Fast file sanity
From project root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\smoke_clean_install.ps1
```

This verifies critical startup files and key workflow files exist (including `frontend/src/config/preview.ts`).

## 2) Build sanity (recommended)
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\smoke_clean_install.ps1 -BuildFrontend
```

This catches Vite/TypeScript import errors before users hit them.

## 3) Runtime sanity (when services are running)
Start app (`run.bat`) and then run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\smoke_clean_install.ps1 -CheckRuntime
```

Optional full check:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\smoke_clean_install.ps1 -BuildFrontend -CheckRuntime
```

## 4) Release gate
Only push if all checks pass.

If smoke fails:
- Fix root cause first
- Re-run smoke script
- Push after green result

