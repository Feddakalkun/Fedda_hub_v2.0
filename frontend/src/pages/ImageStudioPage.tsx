import { IMAGE_WORKFLOW_PAGES } from './workflowPageRegistry';
import { ZImageTxt2Img } from './zimage/ZImageTxt2Img';

interface ImageStudioPageProps {
  activeTab?: string;
}

export const ImageStudioPage = ({ activeTab = 'z-image-txt2img' }: ImageStudioPageProps) => {
  const Page = (activeTab && IMAGE_WORKFLOW_PAGES[activeTab]) || ZImageTxt2Img;
  return <Page />;
};