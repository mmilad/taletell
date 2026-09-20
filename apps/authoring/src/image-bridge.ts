export type GeneratedImage = { id:string; provider:string; filePath?:string; dataUrl?:string; url?:string; metadata?:Record<string,unknown> };
export type ImageStatus = { ok:boolean; mode:'real'|'mock'; ready:boolean; model?:string; device?:string; gpu?:string; cuda?:boolean; detail?:string; error?:string };

export async function getImageStatus():Promise<ImageStatus> {
  if (window.storyteller?.imageStatus) return window.storyteller.imageStatus();
  try {
    const response=await fetch('/api/image-status');
    if (!response.ok) throw new Error('Image worker is not available in this session.');
    return await response.json() as ImageStatus;
  } catch (error) {
    return {ok:false,mode:'mock',ready:false,detail:error instanceof Error?error.message:'Image worker is not available.'};
  }
}

export async function generateImages(request:unknown,signal?:AbortSignal):Promise<{images:GeneratedImage[]; mode?:string}> {
  if (window.storyteller?.generateImages) return window.storyteller.generateImages(request);
  const response=await fetch('/api/generate-images',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request),signal});
  const payload=await response.json() as {ok?:boolean; error?:string; detail?:string; images?:GeneratedImage[]; mode?:string};
  if (!response.ok||payload.ok===false) throw new Error(payload.detail||payload.error||'Image generation failed');
  return {images:payload.images||[],mode:payload.mode};
}

export function displayImageSrc(image:string) {
  if (image.startsWith('data:')||image.startsWith('blob:')||image.startsWith('http')||image.startsWith('/')) return image;
  if (image.startsWith('file://')) return image;
  return image.startsWith('/')?image:`file://${image}`;
}
