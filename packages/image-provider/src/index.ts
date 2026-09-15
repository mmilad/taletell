export type ImageReference = { assetId:string; filePath?:string; role:'identity'|'face'|'full-body'|'outfit'|'expression'|'location'|'style' };
export type ImageSubject = 'character'|'location'|'prop'|'scene';
export type GenerationMode = 'asset'|'composition';
export type ImageGenerationRequest = { mode:GenerationMode; subject:ImageSubject; prompt:string; negativePrompt?:string; references?:ImageReference[]; width?:number; height?:number; variants?:number; outputDirectory?:string; jobId?:string };
export type GeneratedImage = { id:string; filePath?:string; dataUrl?:string; provider:string; metadata?:Record<string,unknown> };

export interface ImageProvider {
  readonly id:string;
  generate(request:ImageGenerationRequest):Promise<GeneratedImage[]>;
}

export class MockImageProvider implements ImageProvider {
  readonly id='mock';
  async generate(request:ImageGenerationRequest):Promise<GeneratedImage[]> {
    const count=Math.max(1,Math.min(request.variants??1,8));
    return Array.from({length:count},(_,index)=>({id:`mock-${Date.now()}-${index+1}`,provider:this.id,metadata:{mode:request.mode,subject:request.subject,prompt:request.prompt,referenceCount:request.references?.length??0,variant:index+1}}));
  }
}

/** ComfyUI adapter seam. Workflow construction stays out of the story domain. */
export class ComfyUIImageProvider implements ImageProvider {
  readonly id='comfyui';
  constructor(private readonly baseUrl='http://127.0.0.1:8188') {}
  async generate(_request:ImageGenerationRequest):Promise<GeneratedImage[]> {
    throw new Error(`ComfyUI provider is not configured yet (${this.baseUrl}). Use MockImageProvider until a workflow is selected.`);
  }
}
