function Get-FeddaNodeConfig {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RootPath,
        [bool]$EnabledOnly = $true,
        [scriptblock]$Logger = $null
    )

    function Write-ModuleNodeLog {
        param([string]$Message, [string]$Color = "Gray")
        if ($Logger) {
            & $Logger $Message $Color
        }
    }

    $NodesPath = Join-Path $RootPath "config\nodes.json"
    if (-not (Test-Path $NodesPath)) {
        throw "config/nodes.json not found"
    }

    $ParsedNodes = Get-Content $NodesPath -Raw | ConvertFrom-Json
    $AllNodes = @()
    foreach ($Node in $ParsedNodes) {
        $AllNodes += $Node
    }
    $ManifestPath = Join-Path $RootPath "config\modules.json"
    if (-not (Test-Path $ManifestPath)) {
        Write-ModuleNodeLog "Module manifest not found; installing all nodes from nodes.json." "Yellow"
        return $AllNodes
    }

    try {
        $Manifest = Get-Content $ManifestPath -Raw | ConvertFrom-Json
        $Modules = @()
        foreach ($Module in $Manifest.modules) {
            $Modules += $Module
        }
        if ($EnabledOnly) {
            $Modules = @($Modules | Where-Object { $_.enabled -ne $false })
        }

        $WantedNodeNames = [ordered]@{}
        foreach ($Module in $Modules) {
            foreach ($NodeName in @($Module.custom_nodes)) {
                if (-not [string]::IsNullOrWhiteSpace($NodeName)) {
                    $WantedNodeNames[$NodeName] = $true
                }
            }
        }

        # Auto-include node packages required by workflows in enabled modules
        # This makes adding new workflows (e.g. SDXL INPAINT) automatically pull their custom nodes
        try {
            $WorkflowApiFile = Join-Path $RootPath "config\workflow_api.json"
            $WorkflowsDir = Join-Path $RootPath "backend\workflows"
            if ((Test-Path $WorkflowApiFile) -and (Test-Path $WorkflowsDir)) {
                $WfApi = Get-Content $WorkflowApiFile -Raw | ConvertFrom-Json
                $WorkflowClassTypes = @{}
                foreach ($Mod in $Modules) {
                    if ($Mod.workflows) {
                        foreach ($wfId in $Mod.workflows) {
                            if ($WfApi.PSObject.Properties.Name -contains $wfId) {
                                $entry = $WfApi.$wfId
                                if ($entry.filename) {
                                    $wfPath = Join-Path $WorkflowsDir $entry.filename
                                    if (Test-Path $wfPath) {
                                        $wf = Get-Content $wfPath -Raw | ConvertFrom-Json
                                        foreach ($prop in $wf.PSObject.Properties) {
                                            $ct = $prop.Value.class_type
                                            if ($ct -and -not [string]::IsNullOrWhiteSpace($ct)) {
                                                $WorkflowClassTypes[$ct] = $true
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                $ClassTypeNodeMap = @{
                    "String Literal" = "ComfyUI-KJNodes"
                    "InpaintCropImproved" = "ComfyUI-Inpaint-CropAndStitch"
                    "InpaintStitchImproved" = "ComfyUI-Inpaint-CropAndStitch"
                    "LayerMask: PersonMaskUltra V2" = "ComfyUI_LayerStyle_Advance"
                    "Text Multiline" = "was-node-suite-comfyui"
                    "UnetLoaderGGUF" = "ComfyUI-GGUF"
                    "DualCLIPLoaderGGUF" = "ComfyUI-GGUF"
                    "Ideogram4PromptBuilderKJ" = "ComfyUI-KJNodes"
                    "Ideogram4Scheduler" = "ComfyUI-KJNodes"
                    "PrimitiveInt" = "ComfyLiterals"
                    "JsonExtractString" = "ComfyLiterals"
                    "StringReplace" = "ComfyLiterals"
                    "ComfyMathExpression" = "ComfyMath"
                    "ComfyNumberConvert" = "ComfyMath"
                    "ImpactSwitch" = "ComfyUI-Impact-Pack"
                    # Add more class_type -> node package mappings here as new workflows are introduced
                }

                $AutoAddedForWorkflows = @()
                foreach ($ct in $WorkflowClassTypes.Keys) {
                    if ($ClassTypeNodeMap.ContainsKey($ct)) {
                        $nodePkg = $ClassTypeNodeMap[$ct]
                        if (-not $WantedNodeNames.Contains($nodePkg)) {
                            $WantedNodeNames[$nodePkg] = $true
                            $AutoAddedForWorkflows += $nodePkg
                        }
                    }
                }
                if ($AutoAddedForWorkflows.Count -gt 0) {
                    Write-ModuleNodeLog "Auto-added nodes for workflows: $($AutoAddedForWorkflows -join ', ')" "Yellow"
                }
            }
        } catch {
            Write-ModuleNodeLog "Workflow auto node detection skipped: $_" "Yellow"
        }

        if ($WantedNodeNames.Count -eq 0) {
            Write-ModuleNodeLog "Module manifest has no custom node entries; installing all nodes from nodes.json." "Yellow"
            return $AllNodes
        }

        $SelectedNodes = @($AllNodes | Where-Object { $WantedNodeNames.Contains($_.name) })
        $SelectedNames = @{}
        foreach ($Node in $SelectedNodes) {
            $SelectedNames[$Node.name] = $true
        }

        $MissingConfigs = @()
        foreach ($NodeName in $WantedNodeNames.Keys) {
            if (-not $SelectedNames.ContainsKey($NodeName)) {
                $MissingConfigs += $NodeName
            }
        }

        if ($MissingConfigs.Count -gt 0) {
            Write-ModuleNodeLog "Module manifest references missing node config(s): $($MissingConfigs -join ', ')" "Yellow"
        }

        Write-ModuleNodeLog "Module-aware node set: $($SelectedNodes.Count) of $($AllNodes.Count) configured nodes selected." "Green"
        return $SelectedNodes
    }
    catch {
        Write-ModuleNodeLog "Module manifest could not be read; installing all nodes from nodes.json. $_" "Yellow"
        return $AllNodes
    }
}
