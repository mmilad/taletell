import { createCharacter, createLocation, createObject, createScene, type Character, type Location, type Project, type StoryObject } from './domain';

export type StoryDraftCharacter = {
  name?:string;
  role?:string;
  key?:boolean;
  description?:string;
  appearance?:string;
  traits?:string[];
};
export type StoryDraftLocation = { name?:string; description?:string };
export type StoryDraftObject = { name?:string; description?:string; appearance?:string };
export type StoryDraftScene = {
  summary?:string;
  sourceText?:string;
  visualDescription?:string;
  characterNames?:string[];
  objectNames?:string[];
  locationName?:string;
};
export type StoryDraft = {
  title?:string;
  sourceText?:string;
  characters?:StoryDraftCharacter[];
  locations?:StoryDraftLocation[];
  objects?:StoryDraftObject[];
  scenes?:StoryDraftScene[];
};

const text = (value:unknown)=>typeof value==='string'?value.replace(/\s+/g,' ').trim():'';
const prose = (value:unknown)=>typeof value==='string'?value.replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim():'';
const list = (value:unknown)=>Array.isArray(value)?value:[];

export function extractJson(raw:unknown):unknown {
  if (raw&&typeof raw==='object'&&!Array.isArray(raw)) return raw;
  const source=typeof raw==='string'?raw.trim():JSON.stringify(raw??'');
  if (!source) throw new Error('The local model returned an empty story.');
  const fence=source.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate=(fence?fence[1]:source).trim();
  const start=candidate.indexOf('{');
  const end=candidate.lastIndexOf('}');
  if (start<0||end<=start) throw new Error('The local model did not return JSON.');
  try { return JSON.parse(candidate.slice(start,end+1)); }
  catch { throw new Error('The local model returned invalid JSON.'); }
}

function asDraft(value:unknown):StoryDraft {
  if (!value||typeof value!=='object'||Array.isArray(value)) throw new Error('The local model did not return a story object.');
  return value as StoryDraft;
}

function uniqueName(name:string,taken:Set<string>) {
  if (!taken.has(name.toLowerCase())) return name;
  let index=2;
  while (taken.has(`${name} ${index}`.toLowerCase())) index+=1;
  return `${name} ${index}`;
}

export type DraftKeep = {characters?:Character[]; locations?:Location[]; objects?:StoryObject[]};
export type DraftOptions = {lockCast?:boolean; allowEmptyScenes?:boolean};

export function hydrateStoryDraft(raw:unknown,keep?:DraftKeep,pageCount=12,options?:DraftOptions):Pick<Project,'title'|'sourceText'|'characters'|'locations'|'objects'|'scenes'> {
  const draft=asDraft(raw);
  const keptCharacters=keep?.characters||[];
  const keptLocations=keep?.locations||[];
  const taken=new Set(keptCharacters.map(character=>character.name.toLowerCase()));
  const extras=options?.lockCast?0:keptCharacters.length?1:6;
  const characters=[...keptCharacters];
  for (const item of list(draft.characters)) {
    if (characters.length>=keptCharacters.length+extras) break;
    const incoming=item as StoryDraftCharacter;
    const requested=text(incoming.name);
    if (!requested||taken.has(requested.toLowerCase())) continue;
    const name=uniqueName(requested,taken);
    taken.add(name.toLowerCase());
    const description=text(incoming.description)||`${name} belongs in this story.`;
    const rawAppearance=text(incoming.appearance);
    const appearance=(!rawAppearance||rawAppearance.split(/\s+/).length>22||/["“]/.test(rawAppearance)||(rawAppearance.match(/[.!?]/g)||[]).length>=2)
      ? `${name}, a children's storybook character, distinct colors and clothes, kind face`
      : rawAppearance;
    const role=text(incoming.role)||(characters.length===0?'hero':characters.length===1?'friend':'helper');
    const traits=list(incoming.traits).map(trait=>text(trait)).filter(Boolean).slice(0,4);
    characters.push(createCharacter({name,role,description,appearance,traits,key:incoming.key??characters.length<2}));
  }
  if (!characters.length) throw new Error('The local model did not name any characters.');

  const placeTaken=new Set(keptLocations.map(location=>location.name.toLowerCase()));
  const placeExtras=options?.lockCast?0:keptLocations.length?1:5;
  const locations=[...keptLocations];
  for (const item of list(draft.locations)) {
    if (locations.length>=keptLocations.length+placeExtras) break;
    const incoming=item as StoryDraftLocation;
    const requested=text(incoming.name);
    if (!requested||placeTaken.has(requested.toLowerCase())) continue;
    const name=uniqueName(requested,placeTaken);
    placeTaken.add(name.toLowerCase());
    locations.push(createLocation({name,description:text(incoming.description)||`A recurring place called ${name}.`}));
  }

  const keptObjects=keep?.objects||[];
  const objectTaken=new Set(keptObjects.map(object=>object.name.toLowerCase()));
  const objects=[...keptObjects];
  for (const item of list(draft.objects)) {
    if (objects.length>=keptObjects.length+(options?.lockCast?0:4)) break;
    const incoming=item as StoryDraftObject;
    const requested=text(incoming.name);
    if (!requested||objectTaken.has(requested.toLowerCase())) continue;
    const name=uniqueName(requested,objectTaken);
    objectTaken.add(name.toLowerCase());
    const rawAppearance=text(incoming.appearance)||text(incoming.description);
    const appearance=(!rawAppearance||rawAppearance.split(/\s+/).length>22||/["“]/.test(rawAppearance))
      ? `a special children's-story object called ${name}, simple and easy to recognize`
      : rawAppearance;
    objects.push(createObject({name,appearance,description:text(incoming.description)||`${name} is a special object in the story.`}));
  }

  const byName=(name:string)=>characters.find(character=>character.name.toLowerCase()===name.toLowerCase());
  const byPlace=(name:string)=>locations.find(location=>location.name.toLowerCase()===name.toLowerCase());
  const byObject=(name:string)=>objects.find(object=>object.name.toLowerCase()===name.toLowerCase());
  let scenes=list(draft.scenes).slice(0,pageCount).flatMap((item,order)=>{
    const incoming=item as StoryDraftScene;
    const sourceText=prose(incoming.sourceText);
    const summary=text(incoming.summary)||sourceText.replace(/\s+/g,' ').slice(0,80);
    if (!sourceText&&!summary) return [];
    const named=list(incoming.characterNames).map(name=>text(name)).filter(Boolean);
    const characterIds=(named.map(byName).filter(Boolean) as Character[]).map(character=>character.id);
    const who=characterIds.length?characterIds:characters.slice(0,Math.min(2,characters.length)).map(character=>character.id);
    const objectIds=list(incoming.objectNames).map(name=>text(name)).map(byObject).filter(Boolean).map(object=>object!.id);
    const locationName=text(incoming.locationName);
    const location=locationName?byPlace(locationName):locations[Math.min(order,Math.max(locations.length-1,0))];
    const visual=text(incoming.visualDescription)||`Children's storybook scene: ${summary}.`;
    return [createScene({order,sourceText:sourceText||`${summary}.`,summary,visualDescription:visual,characterIds:who,objectIds,locationId:location?.id})];
  });
  if (!scenes.length) {
    if (!options?.allowEmptyScenes) throw new Error('The local model did not return any scenes.');
    scenes.push(createScene({order:0,sourceText:'.',summary:'',visualDescription:'',characterIds:[],objectIds:[]}));
  }

  const sourceText=prose(draft.sourceText)||scenes.map(scene=>scene.sourceText).join('\n\n');
  const title=text(draft.title)||`${characters[0].name} and the ${locations[0]?.name||'Story'}`;
  return {title,sourceText,characters,locations,objects,scenes};
}

export function parseStoryDraft(raw:unknown,keep?:DraftKeep,pageCount=12,options?:DraftOptions) {
  return hydrateStoryDraft(extractJson(raw),keep,pageCount,options);
}
