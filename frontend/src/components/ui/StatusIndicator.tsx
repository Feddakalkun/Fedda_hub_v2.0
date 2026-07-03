// Status Indicator Component
import { useComfyStatus } from '../../hooks/useComfyStatus';
import { useOllamaStatus } from '../../hooks/useOllamaStatus';
import { Activity, AlertCircle, Loader2, BrainCircuit } from 'lucide-react';
import { IS_RUNPOD } from '../../config/api';

export const StatusIndicator = () => {
    const comfy = useComfyStatus();
    const ollama = useOllamaStatus();

    return (
        <div className="space-y-2">
            {/* ComfyUI Status */}
            <div
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${comfy.isConnected
                    ? 'bg-emerald-500/10 border-emerald-500/30'
                    : 'bg-red-500/10 border-red-500/30'
                    }`}
            >
                {comfy.isLoading ? (
                    <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
                ) : comfy.isConnected ? (
                    <Activity className="w-4 h-4 text-emerald-400" />
                ) : (
                    <AlertCircle className="w-4 h-4 text-red-400" />
                )}

                <div className="text-xs">
                    <div className={`${comfy.isConnected ? 'text-emerald-400' : 'text-red-400'} font-medium`}>
                        {comfy.isConnected ? 'ComfyUI Online' : 'ComfyUI Offline'}
                    </div>
                </div>
            </div>

            {/* LLM Status — RunPod: IF_AI_tools (always via ComfyUI), Local: Ollama */}
            {IS_RUNPOD ? (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg border transition-all bg-purple-500/10 border-purple-500/30">
                    <BrainCircuit className="w-4 h-4 text-purple-400" />
                    <div className="text-xs">
                        <div className="text-purple-400 font-medium">IF_AI_tools</div>
                    </div>
                </div>
            ) : (
                <div
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${ollama.isConnected
                        ? 'bg-emerald-500/10 border-emerald-500/30'
                        : 'bg-red-500/10 border-red-500/30'
                        }`}
                >
                    {ollama.isLoading ? (
                        <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
                    ) : ollama.isConnected ? (
                        <BrainCircuit className="w-4 h-4 text-emerald-400" />
                    ) : (
                        <BrainCircuit className="w-4 h-4 text-red-400" />
                    )}

                    <div className="text-xs">
                        <div className={`${ollama.isConnected ? 'text-emerald-400' : 'text-red-400'} font-medium`}>
                            {ollama.isConnected ? 'Ollama Online' : 'Ollama Offline'}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
