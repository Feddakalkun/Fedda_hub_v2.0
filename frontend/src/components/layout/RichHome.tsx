import { Construction, Sparkles } from 'lucide-react';
import { useModules } from '../../contexts/ModuleContext';
import type { FeddaModule } from '../../modules/registry';

interface RichHomeProps {
  onSelect: (id: string) => void;
}

function HomeCard({ module, onSelect }: { module: FeddaModule; onSelect: (id: string) => void }) {
  const Icon = module.Icon;
  return (
    <button
      onClick={() => onSelect(module.defaultTab)}
      aria-label={module.label}
      className="group relative aspect-[1168/784] overflow-hidden rounded-lg border border-white/10 bg-[#08090d] transition-all hover:-translate-y-0.5 hover:border-white/25"
    >
      {module.card?.poster ? (
        <>
          <img
            src={module.card.poster}
            alt=""
            className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
          />
          {module.card?.video ? (
            <video
              className="absolute inset-0 h-full w-full object-cover opacity-0 transition duration-500 group-hover:scale-[1.03] group-hover:opacity-100"
              src={module.card.video}
              poster={module.card.poster}
              muted
              loop
              playsInline
              autoPlay
            />
          ) : null}
        </>
      ) : (
        /* Fallback: no poster — show icon + label */
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6">
          <div className="w-10 h-10 rounded-xl border border-white/10 bg-white/[0.04] flex items-center justify-center transition-all group-hover:border-white/20 group-hover:bg-white/[0.07]">
            <Icon className="h-5 w-5 text-white/40 group-hover:text-white/70 transition-colors" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-white/60 group-hover:text-white/90 transition-colors">
              {module.label}
            </p>
            <p className="text-[10px] text-white/20 group-hover:text-white/35 transition-colors mt-0.5 max-w-[200px] leading-relaxed">
              {module.description}
            </p>
          </div>
        </div>
      )}
    </button>
  );
}

// Portrait (9:16) card for the top "Automations" row. Renders an active
// module or a "coming soon" placeholder.
function AutomationCard({ module, onSelect }: { module?: FeddaModule; onSelect: (id: string) => void }) {
  if (!module) {
    return (
      <div className="relative aspect-[9/16] overflow-hidden rounded-xl border border-dashed border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent">
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03]">
            <Sparkles className="h-5 w-5 text-white/25" />
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/30">Coming soon</span>
          <span className="text-[10px] text-white/15 leading-relaxed">More automated pipelines on the way</span>
        </div>
      </div>
    );
  }
  const Icon = module.Icon;
  return (
    <button
      onClick={() => onSelect(module.defaultTab)}
      aria-label={module.label}
      className="group relative aspect-[9/16] overflow-hidden rounded-xl border border-violet-500/25 bg-[#08090d] transition-all hover:-translate-y-0.5 hover:border-violet-400/50"
    >
      {module.card?.poster ? (
        <img src={module.card.poster} alt="" className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <Icon className="h-6 w-6 text-white/40" />
        </div>
      )}
      <span className="absolute left-2 top-2 rounded-md bg-violet-500/80 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">Automation</span>
      {module.wip ? (
        <span className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-amber-500/90 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-black">
          <Construction className="h-2.5 w-2.5" />
          Under construction
        </span>
      ) : null}
    </button>
  );
}

export const RichHome = ({ onSelect }: RichHomeProps) => {
  const { availableModules } = useModules();
  const cards = availableModules.filter((module) => module.card && (module.area === 'home' || module.area === 'system'));
  const topCards = cards.slice(0, 2);
  const bottomCards = cards.slice(2);
  const automations = availableModules.filter((module) => module.area === 'automation');
  // Pad to 4 slots (undefined = "coming soon" placeholder)
  const automationSlots: (FeddaModule | undefined)[] = [...automations, undefined, undefined, undefined, undefined].slice(0, 4);

  return (
    <div className="h-full overflow-y-auto custom-scrollbar bg-[#050506]">
      <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col px-6 py-5 pt-3">
        {automations.length > 0 && (
          <section className="mb-4 flex flex-col items-center space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/40">Automations</p>
            <div className="grid w-full max-w-2xl gap-3 grid-cols-4">
              {automationSlots.map((module, i) => (
                <AutomationCard key={module?.id ?? `soon-${i}`} module={module} onSelect={onSelect} />
              ))}
            </div>
          </section>
        )}
        <section className="space-y-3">
          <div className="grid w-full gap-3 md:grid-cols-2">
            {topCards.map((module) => (
              <HomeCard key={module.id} module={module} onSelect={onSelect} />
            ))}
          </div>
          <div className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {bottomCards.map((module) => (
              <HomeCard key={module.id} module={module} onSelect={onSelect} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};