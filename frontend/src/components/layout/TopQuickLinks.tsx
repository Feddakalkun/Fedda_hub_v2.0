import { PAGE_META, TOP_QUICK_LINKS } from '../../config/navigation';

interface TopQuickLinksProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export const TopQuickLinks = ({ activeTab, onTabChange }: TopQuickLinksProps) => {
  return (
    <div className="hidden lg:flex items-center gap-2">
      {TOP_QUICK_LINKS.map((tabId) => {
        const meta = PAGE_META[tabId];
        if (!meta) return null;
        const isActive = activeTab === tabId;
        return (
          <button
            key={tabId}
            onClick={() => onTabChange(tabId)}
            className={`h-8 inline-flex items-center gap-1.5 px-3 text-xs font-medium transition-colors ${
              isActive
                ? 'fedda-btn-soft-cyan'
                : 'fedda-btn-ghost'
            }`}
          >
            <meta.Icon className="w-3.5 h-3.5" />
            {meta.label}
          </button>
        );
      })}
    </div>
  );
};
