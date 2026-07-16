import { useMemo } from 'react';
import { FolderOpen } from 'lucide-react';
import { matchesFamily } from '../../lib/loraLabel';
import { smallLabel } from '../../lib/styles';
import { LoraTile } from './LoraTile';
import type { InstalledLora } from './useInstalledLoras';

type Props = {
  loras: InstalledLora[];
  familyPrefixes: string[];
  loading: boolean;
};

/**
 * Every installed LoRA, grouped by folder.
 *
 * Deliberately unfiltered: this is the file lens, so character LoRAs appear here
 * too. Excluding them would need the character list just to subtract it, and
 * would leave you unable to find a file by its folder.
 */
export const FileBrowser = ({ loras, familyPrefixes, loading }: Props) => {
  const groups = useMemo(() => {
    const filtered = loras.filter((l) => matchesFamily(l.path, familyPrefixes));
    const byFolder = new Map<string, InstalledLora[]>();
    for (const l of filtered) {
      const key = l.folder || '(root)';
      byFolder.set(key, [...(byFolder.get(key) ?? []), l]);
    }
    return [...byFolder.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [loras, familyPrefixes]);

  if (loading) {
    return <p className="py-16 text-center text-sm text-zinc-600">Loading LoRAs…</p>;
  }

  if (!groups.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <FolderOpen className="mb-3 h-8 w-8 text-white/15" />
        <p className="text-sm font-semibold text-zinc-400">Nothing matches this filter</p>
        <p className="mt-1 text-xs text-zinc-600">Try “All” to see every installed LoRA.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {groups.map(([folder, items]) => (
        <section key={folder} className="space-y-2">
          <p className={smallLabel}>
            {folder} · {items.length}
          </p>
          <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-6 2xl:grid-cols-8">
            {items.map((l) => (
              <LoraTile
                key={l.path}
                path={l.path}
                sizeMb={l.size_mb}
                isLink={l.is_link}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};
