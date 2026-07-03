import { Txt2ImgPage } from '../zimage/ZImageTxt2Img';

export const FluxTxt2Img = () => {
  return (
    <Txt2ImgPage
      storageKey="flux_txt2img"
      workflowId="flux2klein-txt2img"
      familyLabel="FLUX2-KLEIN"
      promptContext="flux2-klein"
      accent="violet"
      // Only allow LoRAs specifically trained for FLUX.2-klein.
      // FLUX.1-dev LoRAs have incompatible dimensions and will cause matmul errors.
      loraPrefixes={['flux2klein/']}
      loraPacks={['flux2klein']}
      defaultSteps={8}
      maxSteps={20}
      defaultCfg={1}
      showCfgControl
      minCfg={0.8}
      maxCfg={2}
      characterPromptLabel="Character / Trigger"
      characterPromptPlaceholder="LoRA identity phrase, trigger words, hair, face, body, outfit"
    />
  );
};
