import { useEffect, useState } from 'react';
import { ArrowLeft, Sparkles, Video } from 'lucide-react';
import { RichHome } from './components/layout/RichHome';
import { ImageSectionCards } from './components/layout/ImageSectionCards';
import { VideoSectionCards } from './components/layout/VideoSectionCards';
import { TopSystemStrip } from './components/ui/TopSystemStrip';
import { ToastProvider } from './components/ui/Toast';
import { ComfyExecutionProvider } from './contexts/ComfyExecutionContext';
import { ModuleProvider, useModules } from './contexts/ModuleContext';
import { ImageStudioPage } from './pages/ImageStudioPage';
import { VideoStudioPage } from './pages/VideoStudioPage';
import { GalleryPage } from './pages/GalleryPage';
import { LibraryPage } from './pages/LibraryPage';
import { OllamaModelsPage } from './pages/OllamaModelsPage';
import { VenicePage } from './pages/VenicePage';
import { GrokPage } from './pages/GrokPage';
import { ZonosTTSPage } from './pages/ZonosTTSPage';
import { UIAgentPage } from './pages/UIAgentPage';
import { MediaDownloaderPage } from './pages/tools/MediaDownloaderPage';
import { ModuleUnavailablePage } from './pages/ModuleUnavailablePage';
import { GlobalGalleryPanel } from './components/layout/GlobalGalleryPanel';
import {
  ACTIVE_TAB_STORAGE_KEY,
  APP_VERSION_LABEL,
  FEDDA_MODULES,
} from './modules/registry';
import { findModuleForTab } from './modules/moduleSelectors';

type ViewMode = 'home' | 'image-section' | 'video-section' | 'workspace';

type AppLocation = {
  view: ViewMode;
  activeTab: string;
};

function FeddaApp() {
  const {
    loading,
    availableModules,
    validTabs,
    pageMeta,
    defaultTab,
    isTabAvailable,
  } = useModules();

  const resolveTab = (tab: string | null | undefined): string => {
    return tab && validTabs.has(tab) ? tab : defaultTab;
  };

  const readActiveTab = (): string => {
    try {
      return resolveTab(localStorage.getItem(ACTIVE_TAB_STORAGE_KEY));
    } catch {
      return defaultTab;
    }
  };

  const readLocationFromHash = (): AppLocation => {
    const fallbackTab = readActiveTab();
    if (typeof window === 'undefined') return { view: 'home', activeTab: fallbackTab };

    const hash = window.location.hash.replace(/^#\/?/, '').trim();
    if (!hash || hash === 'home') return { view: 'home', activeTab: fallbackTab };
    if (hash === 'image') return { view: 'image-section', activeTab: fallbackTab };
    if (hash === 'video') return { view: 'video-section', activeTab: fallbackTab };

    if (hash.startsWith('tab/')) {
      return { view: 'workspace', activeTab: decodeURIComponent(hash.slice(4)) };
    }

    return { view: 'workspace', activeTab: hash };
  };

  const initialLocation = readLocationFromHash();
  const [view, setView] = useState<ViewMode>(initialLocation.view);
  const [activeTab, setActiveTab] = useState(initialLocation.activeTab);

  useEffect(() => {
    if (loading) return;
    setActiveTab((current) => resolveTab(current));
  }, [loading, defaultTab, validTabs]);

  useEffect(() => {
    try {
      localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, resolveTab(activeTab));
    } catch {}
  }, [activeTab, defaultTab, validTabs]);

  const encodeLocation = (location: AppLocation): string => {
    if (location.view === 'home') return '#/home';
    if (location.view === 'image-section') return '#/image';
    if (location.view === 'video-section') return '#/video';
    return `#/tab/${encodeURIComponent(resolveTab(location.activeTab))}`;
  };

  useEffect(() => {
    const syncFromHash = () => {
      const next = readLocationFromHash();
      setView(next.view);
      setActiveTab(next.activeTab);
    };

    if (typeof window !== 'undefined' && !window.location.hash) {
      window.history.replaceState({ fedda: true }, '', encodeLocation({ view, activeTab }));
    }

    window.addEventListener('popstate', syncFromHash);
    window.addEventListener('hashchange', syncFromHash);
    return () => {
      window.removeEventListener('popstate', syncFromHash);
      window.removeEventListener('hashchange', syncFromHash);
    };
  }, [view, activeTab, defaultTab, validTabs]);

  const parentViewForTab = (tab: string): ViewMode => {
    const module = findModuleForTab(tab, availableModules);
    if (module?.area === 'image') return 'image-section';
    if (module?.area === 'video') return 'video-section';
    return 'home';
  };

  const navigate = (location: AppLocation, mode: 'push' | 'replace' = 'push') => {
    const next = { ...location, activeTab: resolveTab(location.activeTab) };
    setActiveTab(next.activeTab);
    setView(next.view);

    if (typeof window === 'undefined') return;
    const hash = encodeLocation(next);
    if (window.location.hash === hash) return;
    if (mode === 'replace') window.history.replaceState({ fedda: true }, '', hash);
    else window.history.pushState({ fedda: true }, '', hash);
  };

  const openTab = (tab: string) => {
    navigate({ view: 'workspace', activeTab: tab });
  };

  const openHomeCard = (tab: string) => {
    if (tab === 'image') return navigate({ view: 'image-section', activeTab });
    if (tab === 'video') return navigate({ view: 'video-section', activeTab });
    return openTab(tab);
  };

  const goHome = () => navigate({ view: 'home', activeTab });

  const goBack = () => {
    if (view === 'workspace') return navigate({ view: parentViewForTab(activeTab), activeTab });
    if (view === 'image-section' || view === 'video-section') return goHome();
    return goHome();
  };

  const hasImageModules = availableModules.some((module) => module.area === 'image' && module.card);
  const hasVideoModules = availableModules.some((module) => module.area === 'video' && module.card);

  const meta = pageMeta[resolveTab(activeTab)] ?? pageMeta[defaultTab] ?? { label: APP_VERSION_LABEL, Icon: Sparkles };
  const Icon = view === 'home' ? Sparkles : view === 'image-section' ? Sparkles : view === 'video-section' ? Video : meta.Icon;
  const title = view === 'home'
    ? APP_VERSION_LABEL
    : view === 'image-section'
      ? 'Image Studio'
      : view === 'video-section'
        ? 'Video Studio'
        : meta.label;

  const renderWorkspace = () => {
    if (!isTabAvailable(activeTab)) {
      const requested = findModuleForTab(activeTab, FEDDA_MODULES);
      return (
        <ModuleUnavailablePage
          tab={activeTab}
          moduleLabel={requested?.label}
          pack={requested?.pack}
        />
      );
    }

    if (activeTab === 'gallery') return <GalleryPage />;
    if (activeTab === 'library') return <LibraryPage />;
    if (activeTab === 'ollama') return <OllamaModelsPage />;
    if (activeTab === 'venice') return <VenicePage />;
    if (activeTab === 'grok') return <GrokPage />;
    if (activeTab === 'zonos-tts') return <ZonosTTSPage />;
    if (activeTab === 'companion') return <UIAgentPage />;
    if (activeTab === 'media-downloader') return <MediaDownloaderPage />;

    const currentModule = findModuleForTab(activeTab, availableModules);
    if (currentModule?.area === 'image') {
      return <ImageStudioPage activeTab={activeTab} />;
    }
    if (currentModule?.area === 'video') {
      return <VideoStudioPage activeTab={activeTab} />;
    }
    return <ModuleUnavailablePage tab={activeTab} />;
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#050506] text-sm text-slate-400">
        Loading modules...
      </div>
    );
  }

  return (
    <div className="flex h-screen theme-bg-app text-white overflow-hidden font-sans selection:bg-white/20">
      <main className="flex-1 flex flex-col overflow-hidden theme-bg-main">
        <header className="h-14 border-b border-white/5 flex items-center px-6 shrink-0 z-10 justify-between backdrop-blur-sm bg-black/20">
          <div className="flex items-center gap-3">
            {view !== 'home' && (
              <>
                <button onClick={goBack} className="v15-home-btn inline-flex items-center gap-2" title="Back">
                  <ArrowLeft className="h-3.5 w-3.5" /> Back
                </button>
                <button onClick={goHome} className="v15-home-btn" title="Back to Home">Home</button>
              </>
            )}
            <Icon className="w-4 h-4 text-slate-500" />
            <h2 className="text-sm font-semibold text-white tracking-tight">{title}</h2>
          </div>
          <TopSystemStrip />
        </header>

        <div className="flex-1 min-h-0 flex overflow-hidden">
          <div className="flex-1 min-w-0 overflow-hidden">
            {view === 'home' ? (
              <RichHome onSelect={openHomeCard} />
            ) : view === 'image-section' ? (
              hasImageModules ? (
                <ImageSectionCards onSelect={openTab} onBack={goHome} />
              ) : (
                <ModuleUnavailablePage tab="image" moduleLabel="Image Studio" pack="core" />
              )
            ) : view === 'video-section' ? (
              hasVideoModules ? (
                <VideoSectionCards onSelect={openTab} onBack={goHome} />
              ) : (
                <ModuleUnavailablePage tab="video" moduleLabel="Video Studio" pack="booster" />
              )
            ) : (
              renderWorkspace()
            )}
          </div>
          <GlobalGalleryPanel />
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ComfyExecutionProvider>
      <ToastProvider>
        <ModuleProvider>
          <FeddaApp />
        </ModuleProvider>
      </ToastProvider>
    </ComfyExecutionProvider>
  );
}