param(
    [string]$RootPath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

# ComfyUI core (>= the version pinned by this install) detects LTX audio VAEs
# natively inside the standard VAE class (comfy/sd.py "LTX Audio" branch), so
# KJNodes' VAELoaderKJ special-case is obsolete AND broken: both the upstream
# is_audio_vae block and our old v22 patch call AudioVAE with arguments the
# new core no longer accepts (AudioVAE now takes metadata only).
# This patch replaces the whole special-case with a plain core-VAE call and
# lets comfy/sd.py dispatch audio VAEs itself.

$NodeFile = Join-Path $RootPath "ComfyUI\custom_nodes\ComfyUI-KJNodes\nodes\nodes.py"
if (-not (Test-Path $NodeFile)) {
    Write-Host "  [KJNodes] nodes.py not found, patch skipped." -ForegroundColor Yellow
    exit 0
}

$Content = Get-Content -LiteralPath $NodeFile -Raw

$New = @'
        # FEDDA patch: core ComfyUI VAE() detects LTX audio VAEs natively now.
        vae = VAE(sd=sd, device=device, dtype=dtype, metadata=metadata)
        if hasattr(vae, "throw_exception_if_invalid"):
            vae.throw_exception_if_invalid()
'@

if ($Content.Contains("FEDDA patch: core ComfyUI VAE() detects LTX audio VAEs natively")) {
    Write-Host "  [KJNodes] LTX audio VAE compatibility patch already applied." -ForegroundColor Green
    exit 0
}

# Match from the is_audio_vae detection block through the invalid-check line,
# covering both the upstream original and the old v22 FEDDA patch shape.
$Pattern = '(?s)        is_audio_vae = \(.*?\)\s*\n        if is_audio_vae:.*?(?:vae\.throw_exception_if_invalid\(\)|            vae\.throw_exception_if_invalid\(\))'

if (-not [regex]::IsMatch($Content, $Pattern)) {
    Write-Host "  [KJNodes] Audio VAE special-case block not found (may already be fixed upstream), patch skipped." -ForegroundColor Yellow
    exit 0
}

$Content = [regex]::Replace($Content, $Pattern, [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $New }, 1)
Set-Content -LiteralPath $NodeFile -Value $Content -Encoding UTF8
Write-Host "  [KJNodes] Applied LTX audio VAE compatibility patch (core-native dispatch)." -ForegroundColor Green
