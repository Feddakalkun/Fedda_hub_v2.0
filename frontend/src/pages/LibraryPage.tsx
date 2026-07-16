import { useCallback, useMemo, useRef, useState } from 'react';
import { Download, FolderOpen, Loader2, Upload, Users } from 'lucide-react';
import { LoRADownloader, type LoRAFamily } from '../components/LoRADownloader';
import { CharacterBrowser } from '../components/library/CharacterBrowser';
import { FileBrowser } from '../components/library/FileBrowser';
import { useInstalledLoras } from '../components/library/useInstalledLoras';
import { useLoraUpload } from '../components/library/useLoraUpload';
import { cn } from '../lib/styles';

/**
 * Family is a FILTER, not a hard split: a character (app/<Name>/) commonly owns
 * LoRAs for several families at once, so tabbing by family used to scatter one
 * character across unrelated tabs. `prefixes` are matched as substrings, the
 * same rule the workflow pages use (see lib/loraLabel.matchesFamily).
 */
type Family = {
  key: string;
  label: string;
  prefixes: string[];
  /** Pack source, where one exists. Krea2 has none — Stage 6 adds it. */
  pack?: LoRAFamily;
};

const FAMILIES: Family[] = [
  { key: 'all', label: 'All', prefixes: [], pack: 'z-image' },
  { key: 'z-image', label: 'Z-Image', prefixes: ['zimage', 'z-image'], pack: 'z-image' },
  { key: 'qwen', label: 'Qwen', prefixes: ['qwen'], pack: 'qwen' },
  { key: 'wan', label: 'WAN', prefixes: ['wan'], pack: 'wan' },
  { key: 'ltx', label: 'LTX', prefixes: ['ltx'], pack: 'ltx' },
  { key: 'krea2', label: 'Krea2', prefixes: ['krea'] },
  { key: 'flux2klein', label: 'FLUX2-KLEIN', prefixes: ['flux2klein', 'flux'], pack: 'flux2klein' },
  { key: 'sdxl', label: 'SDXL', prefixes: ['sdxl'], pack: 'sdxl' },
  { key: 'sd15', label: 'SD 1.5', prefixes: ['sd15'], pack: 'sd15' },
];

type View = 'characters' | 'files' | 'packs';

const VIEWS: { key: View; label: string; Icon: typeof Users }[] = [
  { key: 'characters', label: 'Characters', Icon: Users },
  { key: 'files', label: 'Files', Icon: FolderOpen },
  { key: 'packs', label: 'Packs', Icon: Download },
];

export const LibraryPage = () => {
  const [view, setView] = useState<View>('characters');
  const [familyKey, setFamilyKey] = useState<string>('all');
  const [dropping, setDropping] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const family = useMemo(
    () => FAMILIES.find((f) => f.key === familyKey) ?? FAMILIES[0],
    [familyKey],
  );

  const { loras, loading, refresh } = useInstalledLoras();
  // Uploads land in the family's folder; "All" has no folder of its own.
  const uploadFamily = familyKey === 'all' ? 'imported' : familyKey;
  const { upload, state: uploadState, errors, exts, clearErrors } = useLoraUpload(
    uploadFamily,
    refresh,
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDropping(false);
      const files = Array.from(e.dataTransfer.files ?? []);
      if (files.length) void upload(files);
    },
    [upload],
  );

  return (
    <div
      className="flex h-full flex-col overflow-hidden bg-[#07080d]"
      onDragOver={(e) => {
        e.preventDefault();
        setDropping(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDropping(false);
      }}
      onDrop={onDrop}
    >
      {/* Single header. The old page stacked its own header on top of
          CatalogShell's, each in a different visual dialect. */}
      <div className="shrink-0 border-b border-white/5 px-6 pb-3 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="v14-kicker text-white/45">LoRA &amp; Character</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-white">Library</h1>
          </div>

          <div className="flex items-center gap-2">
            {uploadState ? (
              <span className="flex items-center gap-2 text-[11px] text-zinc-400">
                <Loader2 className="h-3 w-3 animate-spin" />
                Uploading {uploadState.done + 1}/{uploadState.total} · {uploadState.current}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] font-semibold text-white/70 transition hover:border-white/25 hover:text-white"
              >
                <Upload className="h-3 w-3" />
                Add LoRAs
              </button>
            )}
            <input
              ref={fileInput}
              type="file"
              multiple
              accept={exts.join(',')}
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                if (files.length) void upload(files);
                e.target.value = '';
              }}
            />
          </div>
        </div>

        {/* View switch */}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="flex gap-1 rounded-lg border border-white/10 bg-black/30 p-0.5">
            {VIEWS.map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => setView(key)}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1 text-[11px] font-semibold transition',
                  view === key ? 'bg-white text-black' : 'text-white/50 hover:text-white',
                )}
              >
                <Icon className="h-3 w-3" />
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-1">
            {FAMILIES.map((f) => (
              <button
                key={f.key}
                onClick={() => setFamilyKey(f.key)}
                className={cn(
                  'rounded-md border px-2.5 py-1 text-[10px] font-semibold transition',
                  familyKey === f.key
                    ? 'border-white/30 bg-white/10 text-white'
                    : 'border-white/10 bg-white/[0.02] text-white/45 hover:text-white/80',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {errors.length > 0 && (
          <div className="mt-2 flex items-start justify-between gap-3 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-1.5">
            <ul className="space-y-0.5 text-[10px] text-amber-300/80">
              {errors.slice(0, 4).map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
            <button
              onClick={clearErrors}
              className="text-[10px] text-amber-300/50 hover:text-amber-300"
            >
              dismiss
            </button>
          </div>
        )}
      </div>

      <div className="custom-scrollbar flex-1 overflow-y-auto px-6 py-4">
        {view === 'characters' && (
          <CharacterBrowser familyPrefixes={family.prefixes} refreshKey={loras.length} />
        )}
        {view === 'files' && (
          <FileBrowser loras={loras} familyPrefixes={family.prefixes} loading={loading} />
        )}
        {view === 'packs' &&
          (family.pack ? (
            <LoRADownloader family={family.pack} />
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Download className="mb-3 h-8 w-8 text-white/15" />
              <p className="text-sm font-semibold text-zinc-400">No pack source for {family.label} yet</p>
              <p className="mt-1 max-w-sm text-xs text-zinc-600">
                Drop files in, or import from a URL. Curated {family.label} sources are coming.
              </p>
            </div>
          ))}
      </div>

      {dropping && (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center border-2 border-dashed border-white/30 bg-black/70">
          <div className="text-center">
            <Upload className="mx-auto mb-2 h-8 w-8 text-white/60" />
            <p className="text-sm font-semibold text-white">Drop LoRAs to add them</p>
            <p className="mt-1 text-[11px] text-white/45">
              {exts.join(' · ')} → {uploadFamily}/
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
