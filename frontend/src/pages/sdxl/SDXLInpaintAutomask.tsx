import { Txt2ImgPage } from '../zimage/ZImageTxt2Img';

const SDXL_INPAINT_PRESETS = [
  { label: 'Match Source', w: 1024, h: 1024 }, // overridden by uploaded image size
  { label: 'Portrait', w: 896, h: 1344 },
  { label: 'Wide', w: 1344, h: 896 },
  { label: 'Square HD', w: 1024, h: 1024 },
];

export const SDXLInpaintAutomask = () => {
  return (
    <Txt2ImgPage
      storageKey="sdxl_inpaint_automask"
      workflowId="sdxl-inpaint-automask"
      familyLabel="SDXL INPAINT AUTOMASK"
      promptContext="sdxl-inpaint"
      accent="emerald"
      loraPrefixes={['sdxl/']}
      loraPacks={['sdxl']}
      aspectPresets={SDXL_INPAINT_PRESETS}
      requireImageUpload
      imageParamKey="image"
      imageLabel="source image"
      enableLoras
      defaultSteps={20}
      defaultCfg={7}
      defaultDenoise={0.85}
      defaultNegative=""
      maxSteps={50}
      showCfgControl
      minCfg={1}
      maxCfg={15}
      characterPromptLabel={undefined}
      characterPromptPlaceholder={undefined}
      promptLabel="Inpaint Prompt / Details"
      showMaskSettings={true}
    />
  );
};
