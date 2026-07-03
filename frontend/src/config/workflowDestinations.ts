/** Workflow destinations for the "Send to" menu. */

export interface WorkflowDestination {
  id: string;
  label: string;
  group: string;
}

export const IMAGE_DESTINATIONS: WorkflowDestination[] = [
  // Video — image-to-video
  { id: 'ltx-img2vid',       label: 'LTX Img2Vid',       group: 'Video' },
  { id: 'hunyuan-i2v',       label: 'Hunyuan I2V',        group: 'Video' },
  { id: 'wan22-img2vid',     label: 'WAN Img2Vid',        group: 'Video' },
  { id: 'wan22xxx-img2vid',  label: 'WAN XXX I2V',        group: 'Video' },
  { id: 'wan21-steady-dancer', label: 'Steady Dancer',    group: 'Video' },
  // Edit
  { id: 'qwen-image-ref',    label: 'Qwen Reference',     group: 'Edit' },
  { id: 'qwen-rapid-edit-v23', label: 'Qwen Rapid Edit',  group: 'Edit' },
  { id: 'firered-image-edit', label: 'FireRed Edit',      group: 'Edit' },
  // SDXL
  { id: 'sdxl-inpaint-automask', label: 'SDXL Inpaint',  group: 'SDXL' },
  { id: 'sdxl-outpaint',     label: 'SDXL Outpaint',     group: 'SDXL' },
  { id: 'sdxl-controlnet-depth', label: 'ControlNet Depth', group: 'SDXL' },
  { id: 'sdxl-controlnet-openpose', label: 'ControlNet Pose', group: 'SDXL' },
];

export const VIDEO_DESTINATIONS: WorkflowDestination[] = [
  { id: 'wan22-vid2vid',     label: 'WAN Vid2Vid',        group: 'Video' },
  { id: 'wan21-steady-dancer', label: 'Steady Dancer',    group: 'Video' },
  { id: 'wan21-scail2',      label: 'SCAIL-2',            group: 'Video' },
];
