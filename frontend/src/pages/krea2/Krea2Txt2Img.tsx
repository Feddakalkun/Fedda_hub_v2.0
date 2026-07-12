import { Txt2ImgPage } from '../zimage/ZImageTxt2Img';

export const Krea2Txt2Img = () => {
  return (
    <Txt2ImgPage
      storageKey="krea2_txt2img"
      // GGUF Q6_K: the fp8 mixed-precision file OOMs on the 3090 while LoRA-patching
      // (fp8 is emulated on Ampere + torch 2.6 legacy patcher). GGUF patches clean.
      // fp8 variant stays registered as 'krea2-turbo-txt2img' for big-GPU pods.
      workflowId="krea2-turbo-txt2img-gguf"
      familyLabel="KREA2"
      capabilityLabel="Text to Image"
      promptContext="zimage"
      accent="violet"
      // Match any "krea" LoRA so naming variants (krea2, krea_2, krea-2) all show up.
      loraPrefixes={['krea']}
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
