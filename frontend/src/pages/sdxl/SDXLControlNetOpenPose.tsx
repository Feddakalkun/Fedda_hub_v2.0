import { Txt2ImgPage } from '../zimage/ZImageTxt2Img';

const CONTROLNET_OPENPOSE_PRESETS = [
  { label: '1:1', w: 1024, h: 1024 },
  { label: '2:3', w: 1024, h: 1536 },
  { label: '3:2', w: 1536, h: 1024 },
  { label: '9:16', w: 896, h: 1152 },
];

export const SDXLControlNetOpenPose = () => {
  return (
    <Txt2ImgPage
      storageKey="sdxl_controlnet_openpose"
      workflowId="sdxl-controlnet-openpose"
      familyLabel="SDXL ControlNet OpenPose"
      promptContext="sdxl-openpose"
      accent="violet"
      loraPrefixes={['sdxl/']}
      loraPacks={['sdxl']}
      aspectPresets={CONTROLNET_OPENPOSE_PRESETS}
      requireImageUpload
      imageParamKey="image"
      imageLabel="Reference Image"
      enableLoras
      defaultSteps={20}
      defaultCfg={7}
      defaultNegative="blurry, ugly, low quality, artifacts"
      maxSteps={50}
      showCfgControl
      minCfg={1}
      maxCfg={15}
    />
  );
};