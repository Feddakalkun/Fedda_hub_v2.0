import { useCallback, useEffect, useRef, useState } from 'react';
import { ImageOff, Loader2, Sparkles, Upload, X } from 'lucide-react';
import {
  describeImage,
  loadSheet,
  previewUrl,
  savePreview,
  saveSheet,
  type Character,
} from '../../lib/characters';
import { cn, inputBase, smallLabel } from '../../lib/styles';

type Props = {
  character: Character;
  onClose: () => void;
  /** Ask the parent to re-fetch — a new sheet can turn a folder INTO a character. */
  onChanged: () => void;
};

/**
 * Sheet editor for one character.
 *
 * The trigger/appearance API has existed all along but was only ever wired into
 * the Z-Image pages; the Library — the page literally called "LoRA & Character" —
 * never surfaced it. Dropping an image here does double duty: it becomes the
 * card preview AND feeds the vision model to draft the appearance text.
 */
export const CharacterSheetPanel = ({ character, onClose, onChanged }: Props) => {
  const [trigger, setTrigger] = useState('');
  const [appearance, setAppearance] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [describing, setDescribing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [bust, setBust] = useState(0);
  const [coverFailed, setCoverFailed] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const cover = character.loras[0];

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadSheet(character).then((s) => {
      if (cancelled) return;
      setTrigger(s.trigger);
      setAppearance(s.appearance);
      setDirty(false);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [character]);

  const onSave = useCallback(async () => {
    setSaving(true);
    setNote(null);
    try {
      await saveSheet(character, { trigger, appearance });
      setDirty(false);
      setNote(character.has_sheet ? 'Sheet saved' : 'Sheet created');
      onChanged();
    } catch (err: any) {
      setNote(err?.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  }, [character, trigger, appearance, onChanged]);

  const onImage = useCallback(
    async (file: File) => {
      setNote(null);
      // The dropped image is both the card art and the vision model's input.
      try {
        await savePreview(cover.path, file);
        setBust(Date.now());
        setCoverFailed(false);
      } catch (err: any) {
        setNote(err?.message || 'Could not save preview');
        return;
      }
      setDescribing(true);
      try {
        const text = await describeImage(file);
        if (text) {
          setAppearance(text);
          setDirty(true);
          setNote('Appearance drafted — review, then Save');
        }
      } catch (err: any) {
        setNote(`Preview saved. Describe failed: ${err?.message || 'vision model unavailable'}`);
      } finally {
        setDescribing(false);
      }
    },
    [cover.path],
  );

  return (
    <aside className="flex w-full flex-col gap-3 rounded-xl border border-white/10 bg-[#0a0a0e] p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={smallLabel}>Character</p>
          <h2 className="truncate text-base font-semibold text-white">{character.name}</h2>
          <p className="mt-0.5 text-[10px] text-zinc-600">
            {character.loras.length} LoRA{character.loras.length === 1 ? '' : 's'} ·{' '}
            {character.has_sheet ? character.sheet : 'no sheet yet'}
          </p>
        </div>
        <button onClick={onClose} className="rounded p-1 text-zinc-500 hover:text-white" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Preview / drop target */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const f = e.dataTransfer.files?.[0];
          if (f) void onImage(f);
        }}
        onClick={() => fileRef.current?.click()}
        className="group relative aspect-[3/4] w-full cursor-pointer overflow-hidden rounded-lg border border-dashed border-white/15 bg-black/40"
      >
        {coverFailed ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-center">
            <ImageOff className="h-6 w-6 text-white/15" />
            <p className="text-[10px] text-zinc-600">Drop an image</p>
          </div>
        ) : (
          <img
            src={previewUrl(cover.path, bust)}
            alt=""
            onError={() => setCoverFailed(true)}
            className="h-full w-full object-cover"
          />
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 opacity-0 transition group-hover:opacity-100">
          <div className="text-center">
            {describing ? (
              <Loader2 className="mx-auto h-5 w-5 animate-spin text-white/70" />
            ) : (
              <Upload className="mx-auto h-5 w-5 text-white/70" />
            )}
            <p className="mt-1 text-[10px] text-white/70">
              {describing ? 'Describing…' : 'Set preview + describe'}
            </p>
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onImage(f);
            e.target.value = '';
          }}
        />
      </div>

      {loading ? (
        <p className="py-6 text-center text-xs text-zinc-600">Loading sheet…</p>
      ) : (
        <>
          <div className="space-y-1">
            <label className={smallLabel}>Trigger</label>
            <input
              className={inputBase}
              value={trigger}
              onChange={(e) => {
                setTrigger(e.target.value);
                setDirty(true);
              }}
              placeholder={character.name.toLowerCase()}
            />
          </div>

          <div className="space-y-1">
            <label className={smallLabel}>Appearance</label>
            <textarea
              className={cn(inputBase, 'min-h-[120px] resize-y leading-relaxed')}
              value={appearance}
              onChange={(e) => {
                setAppearance(e.target.value);
                setDirty(true);
              }}
              placeholder="Permanent physical traits only — no clothing, pose or background."
            />
            <p className="text-[9px] text-zinc-600">
              Appearance stays scene-agnostic on purpose, so it holds up in any prompt.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onSave}
              disabled={saving || !dirty}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition',
                dirty && !saving
                  ? 'bg-white text-black hover:bg-white/90'
                  : 'cursor-not-allowed bg-white/10 text-white/30',
              )}
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              {character.has_sheet ? 'Save sheet' : 'Create sheet'}
            </button>
            {note && <span className="text-[10px] text-zinc-500">{note}</span>}
          </div>

          <div className="space-y-1 border-t border-white/5 pt-2">
            <p className={smallLabel}>LoRAs</p>
            {character.loras.map((l) => (
              <p key={l.path} className="truncate text-[10px] text-zinc-500" title={l.path}>
                {l.file}
                {l.size_mb != null && <span className="text-zinc-700"> · {l.size_mb} MB</span>}
              </p>
            ))}
          </div>
        </>
      )}
    </aside>
  );
};
