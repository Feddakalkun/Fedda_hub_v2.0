﻿import { Txt2ImgPage } from '../zimage/ZImageTxt2Img';

const SDXL_OUTPAINT_PRESETS = [
  { label: 'Original', w: 1024, h: 1024 },
  { label: 'Landscape', w: 1536, h: 1024 },
  { label: 'Portrait', w: 1024, h: 1536 },
  { label: 'Wide', w: 1792, h: 1024 },
];

export const SDXLOutpaint = () => {
  return (
    <Txt2ImgPage
      storageKey="sdxl_outpaint"
      workflowId="sdxl-outpaint"
      familyLabel="SDXL OUTPAINT"
      promptContext="sdxl-outpaint"
      accent="emerald"
      loraPrefixes={['sdxl/']}
      loraPacks={['sdxl']}
      aspectPresets={SDXL_OUTPAINT_PRESETS}
      requireImageUpload
      imageParamKey="image"
      imageLabel="source image"
      enableLoras
      defaultSteps={20}
      defaultCfg={7}
      defaultNegative=""
      maxSteps={50}
      showCfgControl
      minCfg={1}
      maxCfg={15}
      characterPromptLabel="Outpaint Prompt"
      characterPromptPlaceholder="Describe what to extend the image with (e.g. continue the scene, add background)"
    />
  );
};
