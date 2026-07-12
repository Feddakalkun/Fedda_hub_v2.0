import { Txt2ImgPage } from '../zimage/ZImageTxt2Img';

export const Krea2Txt2Img = () => {
  return (
    <Txt2ImgPage
      storageKey="krea2_txt2img"
      workflowId="krea2-turbo-txt2img"
      familyLabel="KREA2"
      capabilityLabel="Text to Image"
      promptContext="zimage"
      accent="violet"
      // Krea2 LoRAs (e.g. app/Aurora/aurora_krea2_*.safetensors) — match the family token.
      loraPrefixes={['krea2']}
      defaultSteps={8}
      maxSteps={20}
      defaultCfg={1}
      showCfgControl
      minCfg={0.8}
      maxCfg={2}
      characterPromptLabel="Character / Trigger"
      characterPromptPlaceholder="LoRA trigger word + identity details"
    />
  );
};
