import type { ElementType, ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { WorkflowDownloadBanner } from '../ui/WorkflowDownloadBanner';
import { usePersistentState } from '../../hooks/usePersistentState';

interface WorkflowShellProps {
  title: string;
  eyebrow?: string;
  description?: ReactNode;
  icon?: ElementType;
  preview?: ReactNode;
  children: ReactNode;
  output: ReactNode;
  isGenerating?: boolean;
  canGenerate?: boolean;
  leftClassName?: string;
  outputClassName?: string;
  hideOutputPane?: boolean;
  workflowId?: string;
}

export const WorkflowShell = ({
  preview,
  children,
  output,
  leftClassName = '',
  outputClassName = '',
  hideOutputPane = false,
  workflowId,
}: WorkflowShellProps) => {
  // Remembered per workflow — the strip reserves up to 42vh, so collapsing it is
  // a per-page preference the user shouldn't have to redo on every visit.
  const [outputCollapsed, setOutputCollapsed] = usePersistentState(
    `workflow_output_collapsed_${workflowId ?? 'default'}`,
    false,
  );

  return (
    <div className={`workflow-shell ${hideOutputPane ? 'workflow-shell-no-output' : ''}`.trim()}>
      {!hideOutputPane && (
        <section
          className={`workflow-output-strip ${outputCollapsed ? 'workflow-output-strip-collapsed' : ''} ${outputClassName}`.trim()}
        >
          <button
            type="button"
            onClick={() => setOutputCollapsed((v) => !v)}
            aria-expanded={!outputCollapsed}
            title={outputCollapsed ? 'Show output' : 'Hide output'}
            className="workflow-output-toggle"
          >
            {outputCollapsed ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
            <span>{outputCollapsed ? 'Show output' : 'Hide output'}</span>
          </button>
          {!outputCollapsed && output}
        </section>
      )}

      <section className={`workflow-control-pane ${leftClassName}`.trim()}>
        {preview ? <div className="workflow-shell-preview">{preview}</div> : null}

        {workflowId && <WorkflowDownloadBanner workflowId={workflowId} />}

        <div className="workflow-scroll">
          {children}
        </div>
      </section>
    </div>
  );
};

interface WorkflowSectionProps {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export const WorkflowSection = ({ title, actions, children, className = '' }: WorkflowSectionProps) => {
  return (
    <section className={`workflow-section ${className}`.trim()}>
      {(title || actions) && (
        <div className="workflow-section-header">
          {title ? <div className="workflow-section-title">{title}</div> : <span />}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
};
