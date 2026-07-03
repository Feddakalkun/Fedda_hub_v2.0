import type { ComponentType } from 'react';
import { ZImageTxt2Img } from './zimage/ZImageTxt2Img';
import { FluxTxt2Img } from './flux/FluxTxt2Img';
import { ChromaSimpleTxt2Img, ChromaTxt2Img } from './chroma/ChromaTxt2Img';
import { FireRedImageEditPage } from './firered/FireRedImageEditPage';
import { QwenImageReferencePage } from './qwen/QwenImageReferencePage';
import { QwenMultiAnglesPage } from './qwen/QwenMultiAnglesPage';
import { QwenRapidEditPage } from './qwen/QwenRapidEditPage';
import { ZImageDualLoraPage } from './zimage/ZImageDualLoraPage';
import { SDXLInpaintAutomask } from './sdxl/SDXLInpaintAutomask';
import { SDXLOutpaint } from './sdxl/SDXLOutpaint';
import { SDXLControlNetDepth } from './sdxl/SDXLControlNetDepth';
import { SDXLControlNetOpenPose } from './sdxl/SDXLControlNetOpenPose';
import { Wan22Vid2Vid } from './wan22/Wan22Vid2Vid';
import { Wan22Img2Vid } from './wan22/Wan22Img2Vid';
import { Wan226FramesPage } from './wan22/Wan226FramesPage';
import { Wan21SteadyDancerPage } from './wan21/Wan21SteadyDancerPage';
import { Wan21Scail2Page } from './wan21/Wan21Scail2Page';
import { LtxImg2VidPage } from './ltx/LtxImg2VidPage';
import { LtxFlfPage } from './ltx/LtxFlfPage';
import { IdeogramTxt2ImgPage } from './ideogram/IdeogramTxt2ImgPage';
import { HunyuanImg2VidPage } from './hunyuan/HunyuanImg2VidPage';
import { Wan22XxxImg2VidPage } from './wan22/Wan22XxxImg2VidPage';

export const IMAGE_WORKFLOW_PAGES: Record<string, ComponentType> = {
  'z-image': ZImageTxt2Img,
  'z-image-txt2img': ZImageTxt2Img,
  'z-image-dual-lora': ZImageDualLoraPage,
  'chroma': ChromaTxt2Img,
  'chroma-txt2img': ChromaTxt2Img,
  'chroma-simple-txt2img': ChromaSimpleTxt2Img,
  'flux': FluxTxt2Img,
  'flux-txt2img': FluxTxt2Img,
  'firered-image-edit': FireRedImageEditPage,
  'qwen': QwenImageReferencePage,
  'qwen-txt2img': QwenImageReferencePage,
  'qwen-image-ref': QwenImageReferencePage,
  'qwen-rapid-edit-v23': QwenRapidEditPage,
  'qwen-multi-angle': QwenMultiAnglesPage,
  'sdxl-inpaint-automask': SDXLInpaintAutomask,
  'sdxl-outpaint': SDXLOutpaint,
  'sdxl-controlnet-depth': SDXLControlNetDepth,
  'sdxl-controlnet-openpose': SDXLControlNetOpenPose,
  'ideogram': IdeogramTxt2ImgPage,
  'ideogram-txt2img': IdeogramTxt2ImgPage,
};

export const VIDEO_WORKFLOW_PAGES: Record<string, ComponentType> = {
  'video': Wan22Vid2Vid,
  'wan22-vid2vid': Wan22Vid2Vid,
  'wan22-img2vid': Wan22Img2Vid,
  'wan22-img2vid-6frames': Wan226FramesPage,
  'wan21-steady-dancer': Wan21SteadyDancerPage,
  'wan21-scail2': Wan21Scail2Page,
  'ltx': LtxImg2VidPage,
  'ltx-img2vid': LtxImg2VidPage,
  'ltx-flf': LtxFlfPage,
  'hunyuan-i2v': HunyuanImg2VidPage,
  'wan22xxx-img2vid': Wan22XxxImg2VidPage,
};