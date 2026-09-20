export type Imageable = { imageStatus:'empty'|'generated'; imageVariants?:string[]; selectedImage?:string; imageFile?:string };
export type Character = { id:string; name:string; role:string; description:string; appearance:string; traits:string[]; key?:boolean } & Imageable;
export type Location = { id:string; name:string; description:string } & Imageable;
export type Scene = { id:string; order:number; sourceText:string; summary:string; visualDescription:string; characterIds:string[]; locationId?:string } & Imageable;
export type Project = { id:string; title:string; sourceText:string; characters:Character[]; locations:Location[]; scenes:Scene[]; updatedAt:string };

export const createId=()=>crypto.randomUUID();
export const emptyImage=():Imageable=>({imageStatus:'empty'});

export function createCharacter(partial:Omit<Character,'id'|'imageStatus'|'imageVariants'|'selectedImage'> & Partial<Imageable>):Character {
  return {id:createId(),...emptyImage(),...partial};
}
export function createLocation(partial:Omit<Location,'id'|'imageStatus'|'imageVariants'|'selectedImage'> & Partial<Imageable>):Location {
  return {id:createId(),...emptyImage(),...partial};
}
export function createScene(partial:Omit<Scene,'id'|'imageStatus'|'imageVariants'|'selectedImage'> & Partial<Imageable>):Scene {
  return {id:createId(),...emptyImage(),...partial};
}

/** Recover older locally saved projects that predate modular visual fields. */
export function normalizeProject(project:Project):Project {
  return {
    ...project,
    characters:(project.characters||[]).map(character=>({
      ...emptyImage(),
      ...character,
      traits:character.traits||[],
      appearance:character.appearance||character.description||`${character.name} from the story.`
    })),
    locations:(project.locations||[]).map(location=>({...emptyImage(),...location})),
    scenes:(project.scenes||[]).map(scene=>({...emptyImage(),...scene,characterIds:scene.characterIds||[]}))
  };
}

const NAME_STOP = new Set(['The','Once','When','Then','And','But','There','One','Together','A','An','In','At','This','That','They','With','From','After','Before','Into','Still','Quiet','Village','Forest','Fair','Evening','Moonlit','Lantern','Story','Small','Wonder','Home','Place','Last','Page','Walk','Next','Wish','Under','Until','Nothing','Something','Someone','Everyone']);
const PLACE_WORDS = ['forest','woods','house','garden','castle','village','river','school','room','mountain','meadow','pond','fair','library','bakery','beach','treehouse'];

/** Deterministic, provider-free draft extraction for the MVP. */
export function analyzeStory(text:string):Pick<Project,'characters'|'locations'|'scenes'> {
  const lower=text.toLowerCase();
  const names=[...new Set((text.match(/\b[A-Z][a-z]{2,}\b/g)||[]).filter(name=>!NAME_STOP.has(name)&&!PLACE_WORDS.includes(name.toLowerCase())))].slice(0,8);
  const characters=names.map((name,index)=>createCharacter({name,role:'Detected character',description:`${name} appears in the story. Review this draft.`,appearance:`${name}, a children's storybook character, friendly and easy to recognize.`,traits:[],key:index<2}));
  const locationWords=[...new Set((lower.match(new RegExp(`\\b(${PLACE_WORDS.join('|')})\\b`,'g'))||[]))];
  const locations=locationWords.slice(0,6).map(name=>createLocation({name:name[0].toUpperCase()+name.slice(1),description:`A recurring ${name}. Review this draft.`}));
  const chunks=text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const scenes=chunks.slice(0,12).map((sourceText,i)=>createScene({order:i,sourceText,summary:sourceText.slice(0,100),visualDescription:'Describe what should be visible in this moment.',characterIds:characters.filter(c=>sourceText.includes(c.name)).map(c=>c.id),locationId:locations.find(l=>sourceText.toLowerCase().includes(l.name.toLowerCase()))?.id}));
  return {characters,locations,scenes};
}
