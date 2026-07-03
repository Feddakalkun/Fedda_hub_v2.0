import type { ElementType, ReactNode } from 'react';

interface CatalogShellProps {
    title: string;
    subtitle?: ReactNode;
    icon?: ElementType;
    actions?: ReactNode;
    children: ReactNode;
    maxWidthClassName?: string;
}

interface CatalogCardProps {
    title: string;
    subtitle?: ReactNode;
    icon?: ElementType;
    iconClassName?: string;
    actionLabel?: string;
    onAction?: () => void;
    secondaryActionLabel?: string;
    onSecondaryAction?: () => void;
    progress?: number;
    children?: ReactNode;
    className?: string;
}

export const CatalogShell = ({
    title,
    subtitle,
    icon: Icon,
    actions,
    children,
    maxWidthClassName = 'max-w-[1920px]',
}: CatalogShellProps) => {
    return (
        <div className={`p-8 mx-auto space-y-12 ${maxWidthClassName} animate-in fade-in duration-1000`}>
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between px-2">
                <div className="space-y-4">
                    <div className="flex items-center gap-4">
                        {Icon && <div className="w-16 h-16 rounded-[2rem] bg-white/5 border border-white/10 flex items-center justify-center shadow-2xl"><Icon className="w-8 h-8 text-white/40" /></div>}
                        <h1 className="text-5xl font-black text-white uppercase tracking-[0.2em] leading-tight">{title}</h1>
                    </div>
                    {subtitle ? <p className="text-slate-500 text-xs font-bold uppercase tracking-[0.3em] max-w-2xl">{subtitle}</p> : null}
                </div>
                {actions ? <div className="flex flex-wrap items-center gap-3 pb-2">{actions}</div> : null}
            </div>
            <div className="pt-4">
              {children}
            </div>
        </div>
    );
};

export const CatalogCard = ({ 
    title, 
    subtitle, 
    icon: Icon, 
    iconClassName = "",
    actionLabel, 
    onAction, 
    secondaryActionLabel, 
    onSecondaryAction,
    progress,
    children, 
    className = '' 
}: CatalogCardProps) => {
    return (
        <div className={`group bg-[#121218]/40 border border-white/5 rounded-[2.5rem] p-8 flex flex-col justify-between transition-all duration-500 hover:bg-white/[0.04] hover:border-white/10 shadow-xl hover:shadow-2xl relative overflow-hidden ${className}`}>
            <div className="space-y-6 relative z-10">
                <div className="flex items-start justify-between">
                    <div className="space-y-4 flex-1">
                        <div className="flex items-center gap-4">
                           {Icon && (
                              <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10 transition-all group-hover:scale-110 group-hover:border-emerald-500/20 group-hover:bg-emerald-500/5">
                                 <Icon className={`w-5 h-5 text-white/30 group-hover:text-emerald-400 ${iconClassName}`} />
                              </div>
                           )}
                           <h3 className="text-base font-black text-white/90 uppercase tracking-widest">{title}</h3>
                        </div>
                        {subtitle && <p className="text-xs text-slate-500 font-medium leading-relaxed">{subtitle}</p>}
                    </div>
                </div>
                {progress !== undefined && (
                    <div className="space-y-3">
                        <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-600">
                           <span>Progress</span>
                           <span className="text-emerald-500">{Math.round(progress)}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden border border-white/5">
                            <div className="h-full bg-emerald-500 transition-all duration-1000 ease-out" style={{ width: `${progress}%` }} />
                        </div>
                    </div>
                )}
                {children}
            </div>
            
            <div className="mt-10 flex gap-3 relative z-10">
                {onAction && (
                    <button onClick={onAction} className="flex-1 py-4 bg-white text-black rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all hover:bg-emerald-400 hover:scale-[1.02] active:scale-[0.98]">
                        {actionLabel}
                    </button>
                )}
                {!onAction && actionLabel && (
                     <div className="flex-1 py-4 bg-white/5 border border-white/10 text-white/20 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center">
                        {actionLabel}
                     </div>
                )}
                {onSecondaryAction && (
                    <button onClick={onSecondaryAction} className="px-6 py-4 bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all">
                        {secondaryActionLabel}
                    </button>
                )}
            </div>
            
            {/* Background Accent */}
            <div className="absolute -right-20 -bottom-20 w-64 h-64 bg-emerald-500/5 blur-[100px] rounded-full pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
        </div>
    );
};
