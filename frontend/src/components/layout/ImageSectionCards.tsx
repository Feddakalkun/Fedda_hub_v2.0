import { ArrowLeft } from 'lucide-react';
import { useModules } from '../../contexts/ModuleContext';

interface ImageSectionCardsProps {
  onSelect: (tab: string) => void;
  onBack?: () => void;
}

export const ImageSectionCards = ({ onSelect, onBack }: ImageSectionCardsProps) => {
  const { availableModules } = useModules();
  const imageModules = availableModules.filter((module) => module.area === 'image' && module.card);

  return (
    <div className="h-full overflow-y-auto custom-scrollbar bg-[#050506] px-8 py-8">
      <div className="mx-auto max-w-[1400px] space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="v14-kicker text-white/40">Image Studio</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">Choose an image workflow</h1>
          </div>
          {onBack && (
            <button onClick={onBack} className="v15-home-btn inline-flex items-center gap-2">
              <ArrowLeft className="h-3.5 w-3.5" /> Home
            </button>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {imageModules.map((module) => (
            <button
              key={module.id}
              onClick={() => onSelect(module.defaultTab)}
              aria-label={module.label}
              className="group relative aspect-[1168/784] overflow-hidden rounded-lg border border-white/10 bg-[#08090d] transition hover:-translate-y-0.5 hover:border-white/25"
            >
              {module.card?.poster ? (
                <>
                  <img
                    src={module.card.poster}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                  />
                  {module.card.video ? (
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
                <div className="absolute inset-0 flex items-end bg-[#080808] p-4">
                  <div className="text-left">
                    <div className="text-[10px] font-black uppercase tracking-[0.25em] text-white/30">Workflow</div>
                    <div className="mt-1 text-sm font-semibold text-white/70">{module.label}</div>
                  </div>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
