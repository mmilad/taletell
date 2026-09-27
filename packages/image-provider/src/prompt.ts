import type { ImageGenerationRequest, ImageReference, ImageSubject } from './index';

export type VisualInputs = {
  mode:'asset'|'composition';
  subject:ImageSubject;
  style?:string;
  description:string;
  negativePrompt?:string;
  references?:ImageReference[];
  variants?:number;
};

export function composeImageRequest(input:VisualInputs):ImageGenerationRequest {
  const modeInstruction=input.mode==='asset'?'Create a reusable isolated canonical asset with a clear silhouette.':'Compose the current narrative moment using the supplied references while preserving their identity and visual style.';
  const sections=[`Visual identity: ${input.description}`,modeInstruction,input.style&&`Style: ${input.style}`].filter(Boolean);
  return {mode:input.mode,subject:input.subject,prompt:sections.join('\n'),negativePrompt:input.negativePrompt,references:input.references,variants:input.variants??3};
}
