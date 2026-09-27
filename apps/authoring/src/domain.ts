export type Imageable = { imageStatus:'empty'|'generated'; imageVariants?:string[]; selectedImage?:string; imageFile?:string };
export type Character = { id:string; name:string; role:string; description:string; appearance:string; traits:string[]; key?:boolean } & Imageable;
export type Location = { id:string; name:string; description:string } & Imageable;
export type StoryObject = { id:string; name:string; description:string; appearance:string } & Imageable;
export type Scene = { id:string; order:number; sourceText:string; summary:string; visualDescription:string; characterIds:string[]; objectIds:string[]; locationId?:string } & Imageable;
export type Project = { id:string; title:string; sourceText:string; premise:string; characters:Character[]; locations:Location[]; objects:StoryObject[]; scenes:Scene[]; updatedAt:string };

export const createId=()=>crypto.randomUUID();
export const emptyImage=():Imageable=>({imageStatus:'empty'});

export function createCharacter(partial:Omit<Character,'id'|'imageStatus'|'imageVariants'|'selectedImage'> & Partial<Imageable>):Character {
  return {id:createId(),...emptyImage(),...partial};
}
export function createLocation(partial:Omit<Location,'id'|'imageStatus'|'imageVariants'|'selectedImage'> & Partial<Imageable>):Location {
  return {id:createId(),...emptyImage(),...partial};
}
export function createScene(partial:Omit<Scene,'id'|'imageStatus'|'imageVariants'|'selectedImage'|'objectIds'> & Partial<Imageable> & {objectIds?:string[]}):Scene {
  return {id:createId(),...emptyImage(),...partial,objectIds:partial.objectIds||[]};
}
export function createObject(partial:Omit<StoryObject,'id'|'imageStatus'|'imageVariants'|'selectedImage'> & Partial<Imageable>):StoryObject {
  return {id:createId(),...emptyImage(),...partial};
}

/** Recover older locally saved projects that predate modular visual fields. */
export function normalizeProject(project:Partial<Project> & {id:string}):Project {
  return {
    id:project.id,
    title:project.title||'Untitled story',
    sourceText:project.sourceText||'',
    premise:project.premise||'',
    updatedAt:project.updatedAt||new Date().toISOString(),
    characters:(project.characters||[]).map(character=>({
      ...emptyImage(),
      ...character,
      traits:character.traits||[],
      appearance:character.appearance||character.description||`${character.name} from the story.`
    })),
    locations:(project.locations||[]).map(location=>({...emptyImage(),...location})),
    objects:(project.objects||[]).map(item=>({
      ...emptyImage(),
      ...item,
      appearance:item.appearance||item.description||`${item.name}, a special story object.`
    })),
    scenes:(project.scenes||[]).map(scene=>({...emptyImage(),...scene,characterIds:scene.characterIds||[],objectIds:scene.objectIds||[]}))
  };
}
