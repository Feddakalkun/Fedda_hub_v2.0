import { Bot, Download, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { useOllamaManager } from '../hooks/useOllamaManager';
import { useOllamaStatus } from '../hooks/useOllamaStatus';

function formatBytes(value: number) {
  if (!value) return 'Unknown size';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export const OllamaModelsPage = () => {
  const status = useOllamaStatus();
  const manager = useOllamaManager();
  const selectedOption = manager.activeList.find((model) => model.id === manager.selectedModel);

  return (
    <div className="h-full overflow-y-auto custom-scrollbar bg-[#07080d] px-6 py-6">
      <div className="mx-auto max-w-[1300px] space-y-5">
        <div className="flex flex-col gap-4 border-b border-white/10 pb-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="v14-kicker text-white/45">Ollama Models</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">Local text and vision models</h1>
            <p className="mt-2 text-sm text-slate-500">Manage the Ollama models FEDDA uses for prompt assistance and visual captioning.</p>
          </div>
          <div className={`rounded-lg border px-4 py-3 text-xs font-semibold ${status.isConnected ? 'border-white/10 bg-white/[0.04] text-zinc-300' : 'border-rose-400/25 bg-rose-500/10 text-rose-200'}`}>
            {status.isLoading ? 'Checking Ollama...' : status.isConnected ? 'Ollama online' : 'Ollama offline'}
          </div>
        </div>

        <section className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
          <div className="rounded-lg border border-white/10 bg-[#0d0f16] p-5">
            <div className="mb-4 flex items-center gap-2">
              <Download className="h-4 w-4 text-cyan-300" />
              <h2 className="text-sm font-semibold text-white">Download model</h2>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-2">
              {(['text', 'vision'] as const).map((kind) => (
                <button
                  key={kind}
                  onClick={() => manager.setModelCategory(kind)}
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold capitalize transition ${manager.modelCategory === kind ? 'border-white bg-white text-black' : 'border-white/10 bg-white/[0.03] text-white/55 hover:text-white'}`}
                >
                  {kind}
                </button>
              ))}
            </div>

            <label className="block text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Recommended model</label>
            <select
              value={manager.selectedModel}
              onChange={(event) => manager.setSelectedModel(event.target.value)}
              className="mt-2 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white/80 outline-none focus:border-cyan-400/40"
            >
              {manager.activeList.map((model) => (
                <option key={model.id} value={model.id}>{model.label}</option>
              ))}
            </select>
            {selectedOption && <p className="mt-2 text-xs leading-5 text-slate-500">{selectedOption.description}</p>}

            <label className="mt-5 block text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Custom model name</label>
            <input
              value={manager.customModel}
              onChange={(event) => manager.setCustomModel(event.target.value)}
              placeholder="Optional, e.g. llama3.2-vision:11b"
              className="mt-2 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white/80 outline-none focus:border-cyan-400/40"
            />

            <button
              onClick={manager.handlePull}
              disabled={manager.isPulling || !status.isConnected}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/30"
            >
              {manager.isPulling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {manager.isPulling ? 'Downloading...' : 'Pull model'}
            </button>

            {manager.pullProgress && (
              <div className="mt-4 rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-slate-300">
                <div className="mb-1 text-white/70">{manager.pullProgress.status}</div>
                {manager.pullProgress.total ? (
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full bg-cyan-300" style={{ width: `${Math.min(100, ((manager.pullProgress.completed ?? 0) / manager.pullProgress.total) * 100)}%` }} />
                  </div>
                ) : null}
              </div>
            )}
            {manager.pullError && <p className="mt-3 text-xs text-rose-300">{manager.pullError}</p>}
          </div>

          <div className="rounded-lg border border-white/10 bg-[#0d0f16] p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-cyan-300" />
                <h2 className="text-sm font-semibold text-white">Installed models</h2>
              </div>
              <button onClick={manager.refreshModels} className="v15-home-btn inline-flex items-center gap-2">
                <RefreshCw className="h-3.5 w-3.5" /> Refresh
              </button>
            </div>

            {manager.isLoadingModels ? (
              <div className="flex h-48 items-center justify-center text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading models...</div>
            ) : manager.installedModels.length === 0 ? (
              <div className="flex h-48 items-center justify-center rounded-lg border border-white/10 bg-black/30 text-slate-500">No Ollama models installed.</div>
            ) : (
              <div className="space-y-2">
                {manager.installedModels.map((model) => (
                  <div key={model.name} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/25 px-3 py-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-white">{model.name}</div>
                      <div className="mt-1 text-xs text-slate-500">{formatBytes(model.size)} - {new Date(model.modified_at).toLocaleString()}</div>
                    </div>
                    <button onClick={() => manager.handleDelete(model.name)} className="rounded-lg border border-rose-400/25 bg-rose-500/10 p-2 text-rose-200 hover:bg-rose-500/20" title="Delete model">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

