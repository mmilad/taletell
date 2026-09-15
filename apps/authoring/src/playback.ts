import type { Project } from './domain';

export type PlaybackScene = { id:string; order:number; image?:string; audio?:string };
export type PlaybackManifest = { version:1; title:string; scenes:PlaybackScene[] };

/** Converts authoring data into the deliberately small future player contract. */
export function createPlaybackManifest(project:Project):PlaybackManifest {
  return {version:1,title:project.title,scenes:[...project.scenes].sort((a,b)=>a.order-b.order).map((scene,index)=>({id:scene.id,order:index+1,image:scene.selectedImage}))};
}
