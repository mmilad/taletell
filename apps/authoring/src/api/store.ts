import { createId, normalizeProject, type Imageable, type Project } from '../domain';

export type StorySummary = {
  id:string;
  title:string;
  updatedAt:string;
  characterCount:number;
  sceneCount:number;
};

/**
 * Persistence seam for reusable stories.
 * SQLite implements this today; Postgres can later without changing the HTTP API or UI.
 */
export interface DbController {
  listStories():Promise<StorySummary[]>;
  getStory(id:string):Promise<Project|undefined>;
  saveStory(project:Project):Promise<Project>;
  deleteStory(id:string):Promise<boolean>;
}

export function emptyProject(partial:Partial<Project>={}):Project {
  return normalizeProject({
    id:partial.id||createId(),
    title:partial.title||'Untitled story',
    sourceText:partial.sourceText||'',
    characters:partial.characters||[],
    locations:partial.locations||[],
    scenes:partial.scenes||[],
    updatedAt:partial.updatedAt||new Date().toISOString()
  });
}

export function summarizeStory(project:Project):StorySummary {
  return {
    id:project.id,
    title:project.title,
    updatedAt:project.updatedAt,
    characterCount:project.characters.length,
    sceneCount:project.scenes.length
  };
}

/** Keep generated identity sheets when a later save forgets them. */
export function preserveModuleImages<T extends Imageable&{id:string}>(incoming:T[],existing:T[]|undefined):T[] {
  const previous=new Map((existing||[]).map(item=>[item.id,item]));
  return incoming.map(item=>{
    const was=previous.get(item.id);
    if (!was||hasImageRef(item)) return item;
    if (!hasImageRef(was)) return item;
    return {
      ...item,
      imageStatus:was.imageStatus,
      selectedImage:was.selectedImage,
      imageFile:was.imageFile,
      imageVariants:was.imageVariants
    };
  });
}

export function mergeStory(existing:Project|undefined,incoming:Project):Project {
  const next=canonicalizeStory(incoming);
  if (!existing) return next;
  return canonicalizeStory({
    ...next,
    characters:preserveModuleImages(next.characters,existing.characters),
    locations:preserveModuleImages(next.locations,existing.locations),
    scenes:preserveModuleImages(next.scenes,existing.scenes)
  });
}

export function canonicalizeStory(project:Project):Project {
  const next=normalizeProject(project);
  return {
    ...next,
    characters:next.characters.map(canonicalizeImageable),
    locations:next.locations.map(canonicalizeImageable),
    scenes:next.scenes.map(canonicalizeImageable)
  };
}

export function publicAssetRef(value?:string) {
  if (!value) return value;
  if (value.startsWith('data:')||value.startsWith('blob:')||value.startsWith('http://')||value.startsWith('https://')||value.startsWith('/generated-assets/')||value.startsWith('/library/')) return value;
  const name=value.replace(/\\/g,'/').split('/').pop();
  if (name&&/\.(png|jpe?g|webp|gif)$/i.test(name)) return `/generated-assets/${name}`;
  return value;
}

function hasImageRef(item:Imageable) {
  return item.imageStatus==='generated'||Boolean(item.selectedImage||item.imageFile||item.imageVariants?.length);
}

function canonicalizeImageable<T extends Imageable>(item:T):T {
  const selectedImage=publicAssetRef(item.selectedImage);
  const imageFile=publicAssetRef(item.imageFile)||selectedImage;
  const imageVariants=(item.imageVariants||[]).map(variant=>publicAssetRef(variant)||variant);
  return {...item,selectedImage,imageFile,imageVariants};
}

/** @deprecated Use DbController. Kept so older imports keep typechecking during the rename. */
export type ProjectStore = DbController;
export type ProjectSummary = StorySummary;
export const summarizeProject=summarizeStory;
