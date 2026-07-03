import type { ElementType, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { WorkflowDownloadBanner } from '../ui/WorkflowDownloadBanner';

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
  title,
  eyebrow = 'Workflow',
  description,
  icon: Icon,
  preview,
  children,
  output,
  isGenerating = false,
  canGenerate = true,
  leftClassName = '',
  outputClassName = '',
  hideOutputPane = false,
  workflowId,
}: WorkflowShellProps) => {
  return (
    <div className={`workflow-shell ${hideOutputPane ? 'workflow-shell-no-output' : ''}`.trim()}>
      <section className={`workflow-control-pane ${leftClassName}`.trim()}>
        <div className="workflow-header">
          <div className="workflow-header-icon">
            {Icon ? <Icon className="h-4 w-4" /> : null}
          </div>
          <div className="min-w-0">
            <p className="workflow-eyebrow">{eyebrow}</p>
            <h1 className="workflow-title">{title}</h1>
            {description ? <div className="workflow-description">{description}</div> : null}
          </div>
          {isGenerating ? (
            <div className="workflow-status-pill workflow-status-neutral">
              <Loader2 className="h-3 w-3 animate-spin" />
              Running
            </div>
          ) : canGenerate ? (
            <div className="workflow-status-pill workflow-status-ready">
              Ready
            </div>
          ) : (
            <div className="workflow-status-pill workflow-status-setup">
              Setup
            </div>
          )}
        </div>

        {preview ? <div className="workflow-shell-preview">{preview}</div> : null}

        {workflowId && <WorkflowDownloadBanner workflowId={workflowId} />}

        <div className="workflow-scroll">
          {children}
        </div>
      </section>

      {!hideOutputPane && (
        <section className={`workflow-output-pane ${outputClassName}`.trim()}>
          {output}
        </section>
      )}
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
