import { Txt2ImgPage } from '../zimage/ZImageTxt2Img';

const CHROMA_PRESETS = [
  { label: 'Square', w: 1152, h: 1152 },
  { label: 'Portrait', w: 896, h: 1344 },
  { label: 'Wide', w: 1344, h: 896 },
  { label: 'Tall', w: 832, h: 1488 },
];

const CHROMA_NEGATIVE =
  'low quality, ugly, unfinished, out of focus, blurry, smudged, body horror, mutated creature, extra animal, fish, monster, malformed arms, deformed hands, fused anatomy, melted body, muddy skin artifacts, extra limbs, bad anatomy, duplicate face';

export const ChromaTxt2Img = () => {
  return (
    <Txt2ImgPage
      storageKey="chroma_txt2img"
      workflowId="chroma1-hd-txt2img"
      familyLabel="Chroma1-HD"
      promptContext="chroma"
      accent="emerald"
      loraPrefixes={[]}
      loraPacks={[]}
      aspectPresets={CHROMA_PRESETS}
      enableLoras={false}
      defaultSteps={40}
      defaultCfg={1.7}
      defaultNegative={`${CHROMA_NEGATIVE}, restricted palette, flat colors`}
      maxSteps={60}
      showCfgControl
      minCfg={1.0}
      maxCfg={3.0}
    />
  );
};

export const ChromaSimpleTxt2Img = () => {
  return (
    <Txt2ImgPage
      storageKey="chroma_simple_txt2img"
      workflowId="chroma-simple-txt2img"
      familyLabel="Chroma Simple"
      promptContext="chroma"
      accent="emerald"
      loraPrefixes={[]}
      loraPacks={[]}
      aspectPresets={CHROMA_PRESETS}
      enableLoras={false}
      defaultSteps={32}
      defaultCfg={1.25}
      defaultNegative={CHROMA_NEGATIVE}
      maxSteps={55}
      showCfgControl
      minCfg={1.0}
      maxCfg={2.5}
    />
  );
};
