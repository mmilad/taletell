export type Character = { id:string; name:string; role:string; description:string; traits:string[] };
export type Location = { id:string; name:string; description:string };
export type Scene = { id:string; order:number; sourceText:string; summary:string; visualDescription:string; characterIds:string[]; locationId?:string; imageStatus:'empty'|'generated'; imageVariants?:string[]; selectedImage?:string };
export type Project = { id:string; title:string; sourceText:string; characters:Character[]; locations:Location[]; scenes:Scene[]; updatedAt:string };

export const createId=()=>crypto.randomUUID();

/** Deterministic, provider-free draft extraction for the MVP. */
export function analyzeStory(text:string):Pick<Project,'characters'|'locations'|'scenes'> {
  const lower=text.toLowerCase();
  const names=[...new Set((text.match(/\b[A-Z][a-z]{2,}\b/g)||[]).filter(n=>!['The','Once','When','Then','And','But','There','One','Together','A','An','In','At'].includes(n)))].slice(0,8);
  const characters=names.map(name=>({id:createId(),name,role:'Detected character',description:`${name} appears in the story. Review this draft.`,traits:[]}));
  const locationWords=[...new Set((lower.match(/\b(forest|woods|house|garden|castle|village|river|school|room|mountain|meadow)\b/g)||[]))];
  const locations=locationWords.slice(0,6).map(name=>({id:createId(),name:name[0].toUpperCase()+name.slice(1),description:`A recurring ${name}. Review this draft.`}));
  const chunks=text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const scenes=chunks.slice(0,12).map((sourceText,i)=>({id:createId(),order:i,sourceText,summary:sourceText.slice(0,100),visualDescription:'Describe what should be visible in this moment.',characterIds:characters.filter(c=>sourceText.includes(c.name)).map(c=>c.id),locationId:locations.find(l=>sourceText.toLowerCase().includes(l.name.toLowerCase()))?.id,imageStatus:'empty' as const}));
  return {characters,locations,scenes};
}
