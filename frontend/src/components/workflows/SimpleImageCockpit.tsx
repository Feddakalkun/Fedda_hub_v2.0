import { useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { Brain, CheckCircle2, ChevronDown, Loader2, Maximize2, Plus, RefreshCw, Sparkles, Trash2, Upload } from 'lucide-react';
import { PromptAssistant, type PromptContext } from '../ui/PromptAssistant';
import { LoraCharacterCard } from '../ui/LoraCharacterCard';
import { BACKEND_API } from '../../config/api';

export type SimpleImageLoraEntry = {
  name: string;
  strength: number;
};

export type SimpleImageAspectPreset = {
  label: string;
  w: number;
  h: number;
};

export type SimpleImagePromptPreset = {
  label: string;
  prompt: string;
  group?: string;
};

type SimpleImageAccent = 'emerald' | 'violet';

type WorkflowMemoryEntry = {
  id: string;
  kind?: string;
  title?: string;
  content?: string;
  created_at?: string;
};

interface SimpleImageCockpitProps {
  promptContext: PromptContext;
  workflowId?: string;
  prompt: string;
  setPrompt: (value: string) => void;
  promptPresets?: SimpleImagePromptPreset[];
  characterPrompt?: string;
  setCharacterPrompt?: (value: string) => void;
  characterPromptLabel?: string;
  characterPromptPlaceholder?: string;
  familyLabel: string;
  accent?: SimpleImageAccent;

  requireImageUpload?: boolean;
  imageLabel?: string;
  uploadedImage?: string | null;
  uploadedImageName?: string | null;
  uploadingImage?: boolean;
  fileInputRef?: RefObject<HTMLInputElement | null>;
  onUploadImage?: (file: File) => void;

  enableLoras?: boolean;
  availableLoras: string[];
  loraEntries: SimpleImageLoraEntry[];
  setLoraEntries: Dispatch<SetStateAction<SimpleImageLoraEntry[]>>;
  getLoraPreview: (loraPath: string) => string | null;
  loraLimit?: number;

  aspectPresets: SimpleImageAspectPreset[];
  width: number;
  height: number;
  setWidth: Dispatch<SetStateAction<number>>;
  setHeight: Dispatch<SetStateAction<number>>;

  steps: number;
  setSteps: Dispatch<SetStateAction<number>>;
  maxSteps: number;

  showCfgControl?: boolean;
  cfg: number;
  setCfg: Dispatch<SetStateAction<number>>;
  minCfg: number;
  maxCfg: number;

  seed: number;
  setSeed: Dispatch<SetStateAction<number>>;

  negativePrompt: string;
  setNegativePrompt: Dispatch<SetStateAction<string>>;
  negExpanded: boolean;
  setNegExpanded: Dispatch<SetStateAction<boolean>>;

  missingModels?: string[];
  canGenerate: boolean;
  isGenerating: boolean;
  onGenerate: () => void;

  showMaskSettings?: boolean;
  maskFace?: boolean;
  setMaskFace?: (value: boolean) => void;
  maskHair?: boolean;
  setMaskHair?: (value: boolean) => void;
  maskBody?: boolean;
  setMaskBody?: (value: boolean) => void;
  maskClothes?: boolean;
  setMaskClothes?: (value: boolean) => void;
  maskAccessories?: boolean;
  setMaskAccessories?: (value: boolean) => void;
  maskBackground?: boolean;
  setMaskBackground?: (value: boolean) => void;
  maskConfidence?: number;
  setMaskConfidence?: (value: number) => void;
  maskDetailErode?: number;
  setMaskDetailErode?: (value: number) => void;
  maskDetailDilate?: number;
  setMaskDetailDilate?: (value: number) => void;
  maskBlackPoint?: number;
  setMaskBlackPoint?: (value: number) => void;
  maskWhitePoint?: number;
  setMaskWhitePoint?: (value: number) => void;
  maskDilation?: number;
  setMaskDilation?: (value: number) => void;
  maskBlurAmount?: number;
  setMaskBlurAmount?: (value: number) => void;
}

export function SimpleImageCockpit({
  promptContext,
  workflowId,
  promptLabel = 'Prompt',
  prompt,
  setPrompt,
  promptPresets = [],
  characterPrompt = '',
  setCharacterPrompt,
  characterPromptLabel,
  characterPromptPlaceholder,
  familyLabel,
  accent = 'emerald',
  requireImageUpload = false,
  imageLabel = 'Reference Image',
  uploadedImage = null,
  uploadedImageName = null,
  uploadingImage = false,
  fileInputRef,
  onUploadImage,
  enableLoras = true,
  availableLoras,
  loraEntries,
  setLoraEntries,
  getLoraPreview,
  loraLimit = 6,
  aspectPresets,
  width,
  height,
  setWidth,
  setHeight,
  steps,
  setSteps,
  maxSteps,
  showCfgControl = false,
  cfg,
  setCfg,
  minCfg,
  maxCfg,
  seed,
  setSeed,
  negativePrompt,
  setNegativePrompt,
  negExpanded,
  setNegExpanded,
  missingModels = [],
  canGenerate,
  isGenerating,
  onGenerate,

  showMaskSettings = false,
  maskFace = true,
  setMaskFace,
  maskHair = true,
  setMaskHair,
  maskBody = true,
  setMaskBody,
  maskClothes = true,
  setMaskClothes,
  maskAccessories = true,
  setMaskAccessories,
  maskBackground = true,
  setMaskBackground,
  maskConfidence = 0.2,
  setMaskConfidence,
  maskDetailErode = 6,
  setMaskDetailErode,
  maskDetailDilate = 6,
  setMaskDetailDilate,
  maskBlackPoint = 0.01,
  setMaskBlackPoint,
  maskWhitePoint = 0.99,
  setMaskWhitePoint,
  maskDilation = 50,
  setMaskDilation,
  maskBlurAmount = 50,
  setMaskBlurAmount,
}: SimpleImageCockpitProps) {
  const [memoryState, setMemoryState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [memoryEntries, setMemoryEntries] = useState<WorkflowMemoryEntry[]>([]);
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [memoryError, setMemoryError] = useState<string | null>(null);
  const visibleLoras = loraEntries.length > 0 ? loraEntries : [{ name: '', strength: 1.0 }];
  const presetGroups = promptPresets.reduce<Record<string, SimpleImagePromptPreset[]>>((groups, preset) => {
    const group = preset.group || 'Presets';
    groups[group] = [...(groups[group] || []), preset];
    return groups;
  }, {});

  const updateLora = (index: number, patch: Partial<SimpleImageLoraEntry>) => {
    setLoraEntries((prev) => {
      const source = prev.length > 0 ? [...prev] : [{ name: '', strength: 1.0 }];
      source[index] = { ...source[index], ...patch };
      return source;
    });
  };

  const handleFile = (file?: File | null) => {
    if (!file || !file.type.startsWith('image/')) return;
    onUploadImage?.(file);
  };

  const applyPromptPreset = (preset: SimpleImagePromptPreset) => {
    const current = prompt.trim();
    const next = preset.prompt.trim();
    if (!next) return;
    if (!current) return setPrompt(next);
    if (current.toLowerCase().includes(next.toLowerCase())) return;
    setPrompt(`${current}\n\n${next}`);
  };

  const loadMemory = async () => {
    if (!workflowId) return;
    setMemoryLoading(true);
    setMemoryError(null);
    try {
      const response = await fetch(`${BACKEND_API.BASE_URL}${BACKEND_API.ENDPOINTS.WORKFLOW_MEMORY}/${encodeURIComponent(workflowId)}?limit=8`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.success) throw new Error(data?.detail || 'Could not load workflow memory');
      setMemoryEntries(Array.isArray(data.entries) ? data.entries : []);
    } catch (error: any) {
      setMemoryError(error?.message || 'Could not load workflow memory');
    } finally {
      setMemoryLoading(false);
    }
  };

  const toggleMemory = async () => {
    const next = !memoryOpen;
    setMemoryOpen(next);
    if (next) await loadMemory();
  };

  const deleteMemory = async (entryId: string) => {
    if (!workflowId || !entryId) return;
    setMemoryEntries((prev) => prev.filter((entry) => entry.id !== entryId));
    try {
      const response = await fetch(`${BACKEND_API.BASE_URL}${BACKEND_API.ENDPOINTS.WORKFLOW_MEMORY}/${encodeURIComponent(workflowId)}/${encodeURIComponent(entryId)}`, {
        method: 'DELETE',
      });
      if (!response.ok) await loadMemory();
    } catch {
      await loadMemory();
    }
  };

  const rememberSetup = async () => {
    if (!workflowId || !prompt.trim()) return;
    setMemoryState('saving');
    try {
      const activeLoras = loraEntries.filter((entry) => entry.name && entry.name.trim());
      const response = await fetch(`${BACKEND_API.BASE_URL}${BACKEND_API.ENDPOINTS.WORKFLOW_MEMORY}/${encodeURIComponent(workflowId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'settings',
          title: `${familyLabel} cockpit setup`,
          content: prompt.trim(),
          source: 'simple-image-cockpit',
          data: {
            prompt,
            negative: negativePrompt,
            width,
            height,
            steps,
            cfg,
            seed,
            loras: activeLoras,
          },
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.success) throw new Error(data?.detail || 'Memory save failed');
      if (data.entry) setMemoryEntries((prev) => [data.entry, ...prev.filter((entry) => entry.id !== data.entry.id)].slice(0, 8));
      setMemoryState('saved');
      window.setTimeout(() => setMemoryState('idle'), 1800);
    } catch {
      setMemoryState('error');
      window.setTimeout(() => setMemoryState('idle'), 2200);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1540px] pb-3">
      <section className="workflow-cockpit">
        {workflowId && (
          <div className="cockpit-toolbar">
            <div className="cockpit-toolbar-title">
              <Brain className="h-3.5 w-3.5" />
              <span>Workflow Memory</span>
            </div>
            <div className="cockpit-toolbar-actions">
              <button
                type="button"
                onClick={rememberSetup}
                disabled={!prompt.trim() || memoryState === 'saving'}
                className={memoryState === 'saved' ? 'is-saved' : memoryState === 'error' ? 'is-error' : ''}
              >
                {memoryState === 'saving' ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving</>
                ) : memoryState === 'saved' ? (
                  <><CheckCircle2 className="h-3.5 w-3.5" /> Saved</>
                ) : memoryState === 'error' ? (
                  'Save failed'
                ) : (
                  'Remember'
                )}
              </button>
              <button type="button" onClick={toggleMemory} className={memoryOpen ? 'is-saved' : ''}>
                Memory {memoryEntries.length > 0 ? memoryEntries.length : ''}
              </button>
            </div>
          </div>
        )}

        <div className="workflow-cockpit-stack">
          {requireImageUpload && (
            <div className="cockpit-upload-row">
              {!uploadedImage ? (
                <button
                  type="button"
                  onDrop={(event) => {
                    event.preventDefault();
                    handleFile(event.dataTransfer.files[0]);
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onClick={() => fileInputRef?.current?.click()}
                  className="workflow-upload-drop"
                >
                  {uploadingImage ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
                  <span>{uploadingImage ? 'Uploading...' : `Drop ${imageLabel}`}</span>
                  <small>or click to browse</small>
                </button>
              ) : (
                <button type="button" onClick={() => fileInputRef?.current?.click()} className="workflow-upload-preview">
                  <img src={uploadedImage} alt={imageLabel} />
                  <span>{uploadedImageName}</span>
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => handleFile(event.target.files?.[0])}
              />
            </div>
          )}

          <PromptAssistant
            context={promptContext}
            workflowId={workflowId}
            value={prompt}
            onChange={setPrompt}
            placeholder="Describe the subject, mood, lighting..."
            minRows={4}
            accent={accent}
            label="Prompt"
          />

          {promptPresets.length > 0 && (
            <div className="cockpit-preset-panel">
              {Object.entries(presetGroups).map(([group, presets]) => (
                <div key={group} className="cockpit-preset-group">
                  <div className="cockpit-preset-label">{group}</div>
                  <div className="cockpit-preset-chips">
                    {presets.map((preset) => (
                      <button
                        key={`${group}-${preset.label}`}
                        type="button"
                        onClick={() => applyPromptPreset(preset)}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {characterPromptLabel && setCharacterPrompt && (
            <div className="space-y-2">
              <div className="text-[9px] font-black uppercase tracking-[0.2em] text-white/25">
                {characterPromptLabel}
              </div>
              <input
                value={characterPrompt}
                onChange={(event) => setCharacterPrompt(event.target.value)}
                placeholder={characterPromptPlaceholder ?? 'Identity phrase'}
                className="w-full rounded-xl fedda-input px-3 py-2 text-[12px] font-semibold text-white/70 focus:border-white/20"
              />
            </div>
          )}

          {showMaskSettings && (
            <div className="cockpit-panel">
              <div className="cockpit-panel-head">
                <span>Auto Mask Parts (PersonMaskUltra V2)</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {[
                  { label: 'Face', value: maskFace, setter: setMaskFace },
                  { label: 'Hair', value: maskHair, setter: setMaskHair },
                  { label: 'Body', value: maskBody, setter: setMaskBody },
                  { label: 'Clothes', value: maskClothes, setter: setMaskClothes },
                  { label: 'Accessories', value: maskAccessories, setter: setMaskAccessories },
                  { label: 'Background', value: maskBackground, setter: setMaskBackground },
                ].map(({ label, value, setter }) => (
                  <label key={label} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!value}
                      onChange={(e) => setter?.(e.target.checked)}
                      className="accent-emerald-400"
                    />
                    <span className="text-white/80">{label}</span>
                  </label>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 text-xs">
                <label className="flex items-center gap-2">
                  Confidence <input type="range" min="0" max="1" step="0.01" value={maskConfidence} onChange={(e) => setMaskConfidence?.(parseFloat(e.target.value))} className="flex-1" /> <span>{maskConfidence?.toFixed(2)}</span>
                </label>
                <label className="flex items-center gap-2">
                  Erode <input type="range" min="0" max="20" value={maskDetailErode} onChange={(e) => setMaskDetailErode?.(parseInt(e.target.value))} className="flex-1" /> <span>{maskDetailErode}</span>
                </label>
                <label className="flex items-center gap-2">
                  Dilate <input type="range" min="0" max="20" value={maskDetailDilate} onChange={(e) => setMaskDetailDilate?.(parseInt(e.target.value))} className="flex-1" /> <span>{maskDetailDilate}</span>
                </label>
                <label className="flex items-center gap-2">
                  Black Point <input type="range" min="0" max="1" step="0.01" value={maskBlackPoint} onChange={(e) => setMaskBlackPoint?.(parseFloat(e.target.value))} className="flex-1" /> <span>{maskBlackPoint?.toFixed(2)}</span>
                </label>
                <label className="flex items-center gap-2">
                  White Point <input type="range" min="0" max="1" step="0.01" value={maskWhitePoint} onChange={(e) => setMaskWhitePoint?.(parseFloat(e.target.value))} className="flex-1" /> <span>{maskWhitePoint?.toFixed(2)}</span>
                </label>
                <label className="flex items-center gap-2">
                  Mask Dilation <input type="range" min="0" max="200" step="1" value={maskDilation} onChange={(e) => setMaskDilation?.(parseInt(e.target.value))} className="flex-1" /> <span>{maskDilation}</span>
                </label>
                <label className="flex items-center gap-2">
                  Mask Blur <input type="range" min="0" max="200" step="1" value={maskBlurAmount} onChange={(e) => setMaskBlurAmount?.(parseInt(e.target.value))} className="flex-1" /> <span>{maskBlurAmount}</span>
                </label>
              </div>
            </div>
          )}

          {enableLoras && (
            <div className="cockpit-panel cockpit-lora-panel">
              <div className="cockpit-panel-head">
                <span>Characters / LoRAs</span>
                <span>{loraEntries.length || 1}/{loraLimit}</span>
              </div>

              {availableLoras.length === 0 && (
                <p className="cockpit-muted">
                  No compatible {familyLabel} LoRAs are installed yet. You can generate without LoRAs and add character packs later.
                </p>
              )}

              <div className="cockpit-lora-grid">
                {visibleLoras.map((entry, index) => (
                  <LoraCharacterCard
                    key={`simple-image-lora-${index}`}
                    index={index}
                    value={entry.name}
                    strength={entry.strength}
                    options={availableLoras}
                    previewUrl={getLoraPreview(entry.name)}
                    accent={accent}
                    compact
                    onChange={(name) => updateLora(index, { name })}
                    onStrengthChange={(strength) => updateLora(index, { strength })}
                    onRemove={index > 0 ? () => setLoraEntries((prev) => prev.filter((_, i) => i !== index)) : undefined}
                  />
                ))}
              </div>

              {loraEntries.some((entry) => entry.name && entry.name.trim()) && (
                <div className="rounded-lg border border-white/[0.06] bg-black/25 px-2.5 py-2 text-[10px] font-semibold text-white/45">
                  Active: {loraEntries
                    .filter((entry) => entry.name && entry.name.trim())
                    .map((entry) => `${entry.name.split(/[\\/]/).pop()} @ ${entry.strength.toFixed(2)}`)
                    .join(', ')}
                </div>
              )}

              <button
                type="button"
                onClick={() => setLoraEntries((prev) => (prev.length >= loraLimit ? prev : [...prev, { name: '', strength: 1.0 }]))}
                disabled={loraEntries.length >= loraLimit}
                className="cockpit-add-lora"
              >
                <Plus className="h-3 w-3" /> Add LoRA
              </button>
            </div>
          )}

          <div className="cockpit-control-grid">
            <div className="cockpit-panel cockpit-size-panel">
              <div className="cockpit-panel-head">
                <span><Maximize2 className="h-3 w-3" /> Size</span>
              </div>
              <div className="cockpit-aspect-grid">
                {aspectPresets.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => { setWidth(preset.w); setHeight(preset.h); }}
                    className={width === preset.w && height === preset.h ? 'is-active' : ''}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <div className="cockpit-number-grid">
                <label>
                  <span>W</span>
                  <input type="number" value={width} onChange={(event) => setWidth(Number(event.target.value))} />
                </label>
                <label>
                  <span>H</span>
                  <input type="number" value={height} onChange={(event) => setHeight(Number(event.target.value))} />
                </label>
              </div>
            </div>

            <div className="cockpit-panel cockpit-slider-panel">
              <div className="cockpit-panel-head">
                <span>Steps</span>
                <span>{steps}</span>
              </div>
              <input
                type="range"
                min="1"
                max={maxSteps}
                step="1"
                value={steps}
                onChange={(event) => setSteps(Number(event.target.value))}
                className="cockpit-range"
              />
            </div>

            {showCfgControl && (
              <div className="cockpit-panel cockpit-slider-panel">
                <div className="cockpit-panel-head">
                  <span>CFG</span>
                  <span>{cfg.toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min={minCfg}
                  max={maxCfg}
                  step="0.1"
                  value={cfg}
                  onChange={(event) => setCfg(Number(event.target.value))}
                  className="cockpit-range"
                />
              </div>
            )}

            <div className="cockpit-panel cockpit-seed-panel">
              <div className="cockpit-panel-head">
                <span>Seed</span>
                <span>{seed === -1 ? 'random' : 'locked'}</span>
              </div>
              <div className="cockpit-seed-row">
                <input type="number" value={seed} onChange={(event) => setSeed(parseInt(event.target.value || '-1', 10))} />
                <button type="button" onClick={() => setSeed(-1)} className={seed === -1 ? 'is-active' : ''} title="Random seed">
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="cockpit-panel cockpit-negative-panel">
              <button type="button" onClick={() => setNegExpanded((value) => !value)} className="cockpit-collapse">
                <span>Negative Prompt</span>
                <ChevronDown className={negExpanded ? 'h-3 w-3 rotate-180' : 'h-3 w-3'} />
              </button>
              {negExpanded && (
                <textarea
                  value={negativePrompt}
                  onChange={(event) => setNegativePrompt(event.target.value)}
                  placeholder="What to avoid..."
                  className="cockpit-negative"
                />
              )}
            </div>

            {missingModels.length > 0 && (
              <div className="workflow-cockpit-missing">
                Missing model files: {missingModels.slice(0, 3).join(', ')}
                {missingModels.length > 3 ? ` +${missingModels.length - 3} more` : ''}
              </div>
            )}
          </div>
        </div>

        {workflowId && memoryOpen && (
          <div className="cockpit-memory-drawer">
            <div className="cockpit-memory-drawer-head">
              <span>Recent workflow memory</span>
              <button type="button" onClick={loadMemory} disabled={memoryLoading}>
                {memoryLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Refresh'}
              </button>
            </div>
            {memoryError ? (
              <div className="cockpit-memory-empty is-error">{memoryError}</div>
            ) : memoryLoading && memoryEntries.length === 0 ? (
              <div className="cockpit-memory-empty">Loading memory...</div>
            ) : memoryEntries.length === 0 ? (
              <div className="cockpit-memory-empty">No saved setup yet.</div>
            ) : (
              <div className="cockpit-memory-list">
                {memoryEntries.map((entry) => (
                  <article key={entry.id} className="cockpit-memory-item">
                    <div>
                      <div className="cockpit-memory-item-title">
                        <span>{entry.title || 'Workflow memory'}</span>
                        <small>{entry.kind || 'note'}</small>
                      </div>
                      <p>{entry.content || 'No prompt content saved.'}</p>
                    </div>
                    <button type="button" onClick={() => deleteMemory(entry.id)} title="Delete memory">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          disabled={!canGenerate}
          onClick={onGenerate}
          className={`workflow-cockpit-generate ${!canGenerate ? 'is-disabled' : ''}`}
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Generating...</span>
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              <span>Generate</span>
            </>
          )}
        </button>
      </section>
    </div>
  );
}
