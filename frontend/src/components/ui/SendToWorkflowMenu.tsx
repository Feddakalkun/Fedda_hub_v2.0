/**
 * SendToWorkflowMenu — "Send to" button that appears on generated images/videos
 * and in the gallery. Sets the workflow handoff and navigates to the target tab.
 */

import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import {
  IMAGE_DESTINATIONS,
  VIDEO_DESTINATIONS,
  type WorkflowDestination,
} from '../../config/workflowDestinations';
import { navigateToTab, setHandoff } from '../../utils/workflowHandoff';

interface SendToWorkflowMenuProps {
  url: string;
  kind: 'image' | 'video';
  /** compact = icon-only button (gallery hover), default = labelled button */
  compact?: boolean;
}

export function SendToWorkflowMenu({ url, kind, compact = false }: SendToWorkflowMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const destinations: WorkflowDestination[] = kind === 'image' ? IMAGE_DESTINATIONS : VIDEO_DESTINATIONS;

  // Group destinations
  const groups = destinations.reduce<Record<string, WorkflowDestination[]>>((acc, d) => {
    (acc[d.group] ??= []).push(d);
    return acc;
  }, {});

  const send = (dest: WorkflowDestination) => {
    setHandoff(url, kind);
    navigateToTab(dest.id);
    setOpen(false);
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={menuRef} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Send to workflow"
        className={`flex items-center gap-1 rounded transition-all
          ${compact
            ? 'p-1 bg-white/10 hover:bg-white/20 text-white'
            : 'px-2 py-0.5 bg-white/[0.06] border border-white/10 hover:bg-white/[0.12] hover:border-white/20 text-white/60 hover:text-white text-[9px] font-black uppercase tracking-widest'
          }`}
      >
        <ArrowUpRight className={compact ? 'h-2.5 w-2.5' : 'h-2.5 w-2.5'} />
        {!compact && 'Send to'}
      </button>

      {open && (
        <div className="absolute z-50 bottom-full mb-1.5 right-0 w-44 rounded-xl bg-zinc-900 border border-white/10 shadow-2xl overflow-hidden">
          <div className="px-3 py-1.5 border-b border-white/5">
            <p className="text-[8px] font-black uppercase tracking-[0.2em] text-white/30">
              Send {kind} to…
            </p>
          </div>
          {Object.entries(groups).map(([group, dests]) => (
            <div key={group}>
              <p className="px-3 pt-2 pb-0.5 text-[7px] font-black uppercase tracking-widest text-white/20">
                {group}
              </p>
              {dests.map((d) => (
                <button
                  key={d.id}
                  onClick={() => send(d)}
                  className="w-full text-left px-3 py-1.5 text-[11px] text-white/70 hover:text-white hover:bg-white/[0.06] transition-colors flex items-center justify-between gap-2"
                >
                  {d.label}
                  <ArrowUpRight className="h-2.5 w-2.5 opacity-40 shrink-0" />
                </button>
              ))}
            </div>
          ))}
          <div className="h-1.5" />
        </div>
      )}
    </div>
  );
}
