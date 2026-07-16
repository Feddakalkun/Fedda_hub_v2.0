import { useCallback, useEffect, useMemo, useState } from 'react';
import { Users } from 'lucide-react';
import {
  characterMatchesFamily,
  fetchCharacters,
  type Character,
} from '../../lib/characters';
import { cn, smallLabel } from '../../lib/styles';
import { CharacterSheetPanel } from './CharacterSheetPanel';
import { LoraTile } from './LoraTile';

type Props = {
  familyPrefixes: string[];
  /** Bumped by the page when LoRAs change, to force a re-fetch. */
  refreshKey?: number;
};

/**
 * Character-first view.
 *
 * Detection is the backend's (lora_service.get_characters) — a lone .md sheet in
 * the folder, or a direct child of app/. The family filter dims rather than
 * hides, so a character never silently vanishes because the active tab doesn't
 * happen to cover one of their LoRAs.
 */
export const CharacterBrowser = ({ familyPrefixes, refreshKey = 0 }: Props) => {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setCharacters(await fetchCharacters());
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Could not load characters');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const active = useMemo(
    () => characters.find((c) => c.name === selected) ?? null,
    [characters, selected],
  );

  if (loading) return <p className="py-16 text-center text-sm text-zinc-600">Loading characters…</p>;
  if (error) return <p className="py-16 text-center text-sm text-red-400/70">{error}</p>;

  if (!characters.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Users className="mb-3 h-8 w-8 text-white/15" />
        <p className="text-sm font-semibold text-zinc-400">No characters found</p>
        <p className="mt-1 max-w-md text-xs text-zinc-600">
          A character is a folder of LoRAs with a single <code className="text-zinc-500">.md</code> sheet
          in it — or any folder directly under <code className="text-zinc-500">loras/app/</code>.
        </p>
      </div>
    );
  }

  const withSheet = characters.filter((c) => c.has_sheet).length;

  return (
    <div className="flex gap-4">
      <div className="min-w-0 flex-1 space-y-3">
        <p className={smallLabel}>
          {characters.length} characters · {characters.reduce((n, c) => n + c.loras.length, 0)} LoRAs ·{' '}
          {withSheet} with sheets
        </p>

        <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-6 2xl:grid-cols-8">
          {characters.map((c) => {
            const matches = characterMatchesFamily(c, familyPrefixes);
            return (
              <div key={c.name} className={cn('transition-opacity', !matches && 'opacity-25')}>
                <LoraTile
                  path={c.loras[0].path}
                  label={c.name}
                  selected={selected === c.name}
                  onClick={() => setSelected(selected === c.name ? null : c.name)}
                  trailing={
                    <div className="flex gap-1">
                      {!c.has_sheet && (
                        <span
                          title="No character sheet yet"
                          className="rounded bg-amber-500/80 px-1 py-0.5 text-[8px] font-bold text-black"
                        >
                          !
                        </span>
                      )}
                      {c.loras.length > 1 && (
                        <span className="rounded bg-black/75 px-1.5 py-0.5 text-[9px] font-bold text-white/70">
                          {c.loras.length}
                        </span>
                      )}
                    </div>
                  }
                />
              </div>
            );
          })}
        </div>
      </div>

      {active && (
        <div className="w-[300px] shrink-0">
          <div className="sticky top-0">
            <CharacterSheetPanel
              character={active}
              onClose={() => setSelected(null)}
              onChanged={load}
            />
          </div>
        </div>
      )}
    </div>
  );
};
