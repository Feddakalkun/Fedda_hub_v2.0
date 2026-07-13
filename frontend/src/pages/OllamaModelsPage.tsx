import { useEffect, useState } from 'react';
import { Bot, Download, Loader2, MessageSquareText, RefreshCw, ScanEye, Trash2 } from 'lucide-react';
import { useOllamaManager } from '../hooks/useOllamaManager';
import { useOllamaStatus } from '../hooks/useOllamaStatus';
import { BACKEND_API } from '../config/api';

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

const isVisionName = (name: string) =>
  ['vision', 'llava', 'minicpm-v', 'moondream', 'joycaption', '-vl', '_vl'].some((k) => name.toLowerCase().includes(k));

export const OllamaModelsPage = () => {
  const status = useOllamaStatus();
  const manager = useOllamaManager();
  const selectedOption = manager.activeList.find((model) => model.id === manager.selectedModel);

  // user-preferred defaults for every prompt/caption tool in the app
  const [prefText, setPrefText] = useState('');
  const [prefVision, setPrefVision] = useState('');
  const [effText, setEffText] = useState<string | null>(null);
  const [effVision, setEffVision] = useState<string | null>(null);

  const loadDefaults = () => {
    fetch(`${BACKEND_API.BASE_URL}/api/settings/ollama-defaults`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) return;
        setPrefText(d.text_model); setPrefVision(d.vision_model);
        setEffText(d.effective_text); setEffVision(d.effective_vision);
      })
      .catch(() => {});
  };
  useEffect(loadDefaults, []);

  const setDefault = async (kind: 'text' | 'vision', name: string) => {
    const body = kind === 'text' ? { text_model: name } : { vision_model: name };
    try {
      const r = await fetch(`${BACKEND_API.BASE_URL}/api/settings/ollama-defaults`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (d.success) {
        setPrefText(d.text_model); setPrefVision(d.vision_model);
        setEffText(d.effective_text); setEffVision(d.effective_vision);
      }
    } catch { /* backend offline */ }
  };

  const groups = (['SFW', 'Uncensored'] as const).map((tag) => ({
    tag,
    entries: manager.activeList.filter((m) => (m as { tag?: string }).tag === tag),
  }));

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

        {/* Active defaults for the whole app */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-cyan-400/15 bg-cyan-400/[0.04] px-4 py-3 text-xs">
          <span className="flex items-center gap-2 text-white/70">
            <MessageSquareText className="h-3.5 w-3.5 text-cyan-300" />
            Prompts use: <b className="text-cyan-200">{effText || 'none installed'}</b>
            {prefText ? <span className="text-white/35">(your pick)</span> : <span className="text-white/35">(auto)</span>}
          </span>
          <span className="flex items-center gap-2 text-white/70">
            <ScanEye className="h-3.5 w-3.5 text-cyan-300" />
            Vision uses: <b className="text-cyan-200">{effVision || 'none installed'}</b>
            {prefVision ? <span className="text-white/35">(your pick)</span> : <span className="text-white/35">(auto)</span>}
          </span>
          {(prefText || prefVision) && (
            <button
              onClick={() => { void setDefault('text', ''); void setDefault('vision', ''); }}
              className="text-white/40 underline-offset-2 hover:text-white hover:underline"
            >
              Reset to auto
            </button>
          )}
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

            <label className="block text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Popular models</label>
            <select
              value={manager.selectedModel}
              onChange={(event) => manager.setSelectedModel(event.target.value)}
              className="mt-2 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white/80 outline-none focus:border-cyan-400/40"
            >
              {groups.map(({ tag, entries }) => entries.length > 0 && (
                <optgroup key={tag} label={tag === 'SFW' ? '── Popular (SFW) ──' : '── Uncensored / NSFW ──'}>
                  {entries.map((model) => (
                    <option key={model.id} value={model.id}>{model.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            {selectedOption && <p className="mt-2 text-xs leading-5 text-slate-500">{selectedOption.description}</p>}

            <label className="mt-5 block text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Custom model name</label>
            <input
              value={manager.customModel}
              onChange={(event) => manager.setCustomModel(event.target.value)}
              placeholder="Any Ollama tag, e.g. huihui_ai/llama3.2-abliterated"
              className="mt-2 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white/80 outline-none focus:border-cyan-400/40"
            />
            <p className="mt-1 text-[11px] text-slate-600">Browse thousands more at ollama.com/search — paste any tag here and pull.</p>

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
              <button onClick={() => { manager.refreshModels(); loadDefaults(); }} className="v15-home-btn inline-flex items-center gap-2">
                <RefreshCw className="h-3.5 w-3.5" /> Refresh
              </button>
            </div>

            {manager.isLoadingModels ? (
              <div className="flex h-48 items-center justify-center text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading models...</div>
            ) : manager.installedModels.length === 0 ? (
              <div className="flex h-48 items-center justify-center rounded-lg border border-white/10 bg-black/30 text-slate-500">No Ollama models installed.</div>
            ) : (
              <div className="space-y-2">
                {manager.installedModels.map((model) => {
                  const vision = isVisionName(model.name);
                  const isActive = vision ? model.name === effVision : model.name === effText;
                  return (
                    <div key={model.name} className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-3 ${isActive ? 'border-cyan-400/30 bg-cyan-400/[0.05]' : 'border-white/10 bg-black/25'}`}>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold text-white">{model.name}</span>
                          {isActive && (
                            <span className="shrink-0 rounded bg-cyan-400/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-cyan-200">
                              {vision ? 'Active vision' : 'Active prompts'}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">{formatBytes(model.size)} - {new Date(model.modified_at).toLocaleString()}</div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {!isActive && (
                          <button
                            onClick={() => void setDefault(vision ? 'vision' : 'text', model.name)}
                            className="rounded-lg border border-cyan-400/25 bg-cyan-400/10 px-2.5 py-2 text-[10px] font-bold uppercase tracking-wider text-cyan-200 hover:bg-cyan-400/20"
                            title={vision ? 'Use this model for all image captioning' : 'Use this model for all prompt tools'}
                          >
                            {vision ? 'Use for vision' : 'Use for prompts'}
                          </button>
                        )}
                        <button onClick={() => manager.handleDelete(model.name)} className="rounded-lg border border-rose-400/25 bg-rose-500/10 p-2 text-rose-200 hover:bg-rose-500/20" title="Delete model">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
