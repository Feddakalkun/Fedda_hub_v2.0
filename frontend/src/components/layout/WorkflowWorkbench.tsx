import type { ElementType, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

interface WorkflowWorkbenchProps {
  title: string;
  eyebrow?: string;
  description?: ReactNode;
  icon?: ElementType;
  isGenerating?: boolean;
  canGenerate?: boolean;
  preview?: ReactNode;
  children: ReactNode;
  maxWidthClassName?: string;
}

export const WorkflowWorkbench = ({
  title,
  eyebrow = 'Workflow',
  description,
  icon: Icon,
  isGenerating = false,
  canGenerate = true,
  preview,
  children,
  maxWidthClassName = 'max-w-[1280px]',
}: WorkflowWorkbenchProps) => {
  return (
    <div className="workflow-workbench-v16">
      <div className={`workflow-workbench-inner ${maxWidthClassName}`}>
        <header className="workflow-workbench-header">
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
            <div className="workflow-status-pill workflow-status-ready">Ready</div>
          ) : (
            <div className="workflow-status-pill workflow-status-setup">Setup</div>
          )}
        </header>

        {preview ? <div className="workflow-workbench-preview">{preview}</div> : null}

        <main className="workflow-workbench-body">
          {children}
        </main>
      </div>
    </div>
  );
};
