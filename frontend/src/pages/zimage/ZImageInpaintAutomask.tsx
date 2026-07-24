import { Txt2ImgPage } from './ZImageTxt2Img';

/**
 * Z-Image inpaint with PersonMaskUltra auto-masking + Power Lora Loader.
 * The z-image sibling of SDXLInpaintAutomask: mask a region (face / hair / body /
 * clothes) and regenerate it with Z-Image and your character LoRAs — e.g. mask
 * the face and re-render it as a specific persona.
 */
export const ZImageInpaintAutomask = () => {
  return (
    <Txt2ImgPage
      storageKey="zimage_inpaint_automask"
      workflowId="z-image-inpaint-automask"
      familyLabel="Z-Image"
      capabilityLabel="Inpaint (Auto-Mask)"
      promptContext="zimage"
      accent="emerald"
      // Character LoRAs live under app/; also catch the z-image family names.
      loraPrefixes={['app', 'zimage', 'z-image']}
      requireImageUpload
      imageParamKey="image"
      imageLabel="source image"
      enableLoras
      // Z-Image turbo: few-step, cfg 1. The strength slider maps to denoise.
      defaultSteps={8}
      defaultCfg={1}
      defaultNegative=""
      maxSteps={20}
      minCfg={1}
      maxCfg={4}
      showStrengthControl
      defaultStrength={0.6}
      showMaskSettings={true}
    />
  );
};
