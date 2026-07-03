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

export const RichHome = ({ onSelect }: RichHomeProps) => {
  const { availableModules } = useModules();
  const cards = availableModules.filter((module) => module.card && (module.area === 'home' || module.area === 'system'));
  const topCards = cards.slice(0, 2);
  const bottomCards = cards.slice(2);

  return (
    <div className="h-full overflow-y-auto custom-scrollbar bg-[#050506]">
      <div className="mx-auto flex min-h-full w-full max-w-[1500px] flex-col px-8 py-8 pt-4">
        <section className="space-y-4">
          <div className="mx-auto grid max-w-[980px] gap-4 md:grid-cols-2">
            {topCards.map((module) => (
              <HomeCard key={module.id} module={module} onSelect={onSelect} />
            ))}
          </div>
          <div className="mx-auto grid max-w-[980px] gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {bottomCards.map((module) => (
              <HomeCard key={module.id} module={module} onSelect={onSelect} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};