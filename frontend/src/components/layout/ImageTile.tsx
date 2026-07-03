import { type LucideIcon } from 'lucide-react';

interface ImageTileProps {
  title: string;
  description?: string;
  Icon: LucideIcon;
  image: string;
  themeId?: string;
  onClick: () => void;
}

export const ImageTile = ({ title, description, Icon, image, themeId = 'midnight', onClick }: ImageTileProps) => {
  const themeStyles = {
    midnight: {
      border: 'border-white/10',
      overlay: 'from-black/20 via-black/45 to-black/80',
      iconBg: 'bg-black/50 border-white/30',
    },
    charcoal: {
      border: 'border-white/12',
      overlay: 'from-black/15 via-black/40 to-black/75',
      iconBg: 'bg-black/60 border-white/25',
    },
    obsidian: {
      border: 'border-white/8',
      overlay: 'from-black/10 via-black/35 to-black/70',
      iconBg: 'bg-black/70 border-white/20',
    },
    amber: {
      border: 'border-white/10',
      overlay: 'from-black/20 via-black/45 to-black/80',
      iconBg: 'bg-black/60 border-white/25',
    },
    teal: {
      border: 'border-white/10',
      overlay: 'from-black/15 via-black/40 to-black/78',
      iconBg: 'bg-black/50 border-white/25',
    },
    violet: {
      border: 'border-white/10',
      overlay: 'from-black/15 via-black/42 to-black/82',
      iconBg: 'bg-black/50 border-white/25',
    },
  }[themeId] ?? {
    border: 'border-white/10',
    overlay: 'from-black/20 via-black/45 to-black/80',
    iconBg: 'bg-black/50 border-white/30',
  };

  return (
    <button
      onClick={onClick}
      className={`group relative w-full h-full overflow-hidden rounded-lg border ${themeStyles.border} bg-[#08090d] focus:outline-none focus:ring-2 focus:ring-white/40 transition-all active:scale-[0.985]`}
    >
      {/* Background image */}
      <div
        className="absolute inset-0 bg-cover bg-center transition-transform duration-300 group-hover:scale-105"
        style={{ backgroundImage: `url(${image})` }}
      />

      {/* Theme-aware gradient overlay */}
      <div className={`absolute inset-0 bg-gradient-to-b ${themeStyles.overlay}`} />

      {/* Icon "sign" in corner */}
      <div className={`absolute bottom-3 right-3 z-10 flex h-10 w-10 items-center justify-center rounded-lg border ${themeStyles.iconBg} text-white transition-all group-hover:scale-110`}>
        <Icon className="h-5 w-5" />
      </div>

      {/* Label at bottom */}
      <div className="absolute bottom-0 left-0 right-0 z-10 p-3 text-left">
        <div className="text-sm font-semibold text-white drop-shadow">{title}</div>
        {description && (
          <div className="text-[11px] text-white/70 line-clamp-1 drop-shadow">{description}</div>
        )}
      </div>
    </button>
  );
};
