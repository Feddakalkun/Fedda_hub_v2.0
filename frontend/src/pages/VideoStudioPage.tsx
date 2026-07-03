import { VIDEO_WORKFLOW_PAGES } from './workflowPageRegistry';
import { Wan22Vid2Vid } from './wan22/Wan22Vid2Vid';

interface VideoStudioPageProps {
  activeTab?: string;
}

export const VideoStudioPage = ({ activeTab = 'wan22-vid2vid' }: VideoStudioPageProps) => {
  const Page = (activeTab && VIDEO_WORKFLOW_PAGES[activeTab]) || Wan22Vid2Vid;
  return <Page />;
};