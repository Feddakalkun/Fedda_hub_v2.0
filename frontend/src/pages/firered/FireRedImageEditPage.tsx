import { Txt2ImgPage } from '../zimage/ZImageTxt2Img';

const FIRERED_PRESETS = [
  { label: 'Original', w: 1024, h: 1024 },
  { label: 'Portrait', w: 896, h: 1344 },
  { label: 'Wide', w: 1344, h: 896 },
];

export const FireRedImageEditPage = () => {
  return (
    <Txt2ImgPage
      storageKey="firered_image_edit"
      workflowId="firered-image-edit"
      familyLabel="FireRed Edit"
      promptContext="firered"
      accent="emerald"
      loraPrefixes={[]}
      loraPacks={[]}
      aspectPresets={FIRERED_PRESETS}
      requireImageUpload
      imageParamKey="image"
      imageLabel="source image"
      enableLoras={false}
      defaultSteps={8}
      defaultCfg={1}
      defaultNegative=""
      maxSteps={20}
      showCfgControl
      minCfg={0.5}
      maxCfg={2}
    />
  );
};
