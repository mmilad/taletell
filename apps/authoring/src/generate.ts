import { createCharacter, createLocation, createObject, createScene, type Character, type Location, type Project, type Scene, type StoryObject } from './domain';
import { fitPages, normalizeStoryShape, shapeSceneProse, type StoryShapeInput } from './story-shape';

export type StoryTone = 'gentle'|'adventurous'|'funny';
export type StoryAge = '3-5'|'5-7'|'7-9';
export type StoryBrief = StoryShapeInput & {
  premise:string;
  tone?:StoryTone;
  age?:StoryAge;
  characters?:Character[];
  locations?:Location[];
  objects?:StoryObject[];
};

const NAME_STOP = new Set(['The','Once','When','Then','And','But','There','One','Together','A','An','In','At','This','That','They','With','From','After','Before','Into','Still','Quiet','Village','Forest','Fair','Evening','Moonlit','Lantern','Story','Small','Wonder','Home','Place']);
const ANALYZE_NAME_STOP = new Set([
  ...NAME_STOP,
  'He','She','Him','Her','His','Its','Our','Your','You','We','Them','Their','Who','What','Where','Why','How',
  'Suddenly','Now','Soon','Later','Finally','Meanwhile','Hello','Goodbye','Please','Thank','Thanks','Yes','No','Oh','Ah','Wow',
  'Maybe','Perhaps','Instead','However','Because','Although','While','During','Without','Within','Toward','Through','Across',
  'Along','Around','Behind','Beyond','Inside','Outside','Above','Below','Again','Here','Well','Even','Also','Just','Only',
  'Back','Over','Under','Until','After','Before','Today','Tonight','Tomorrow','Yesterday','Remember','Watch','Look','Wait',
  'Come','Came','Went','Said','Ask','Asked','Eat','Look','Wait','All','Each','Every','Both','Many','More','Most','Other','Some','Such','Same',
  'Very','Too','Can','Will','Not','For','Last','Page','Walk','Next','Wish','Nothing','Something','Someone','Everyone',
  'Flowers','Flower','Berry','Berries','Crystal','Stream','Patch','Map','Path','Ball','Light','Bush','Bushes','Song','Songs',
  'Sky','Wind','Grass','Fruit','Fruits','Clue','Clues','Voice','Shadow','World','Tune','Music'
]);
const PLACE_FOLLOWERS = ['Stream','Patch','Forest','Meadow','River','Garden','Path','Grove','Tree','Hollow','Kitchen','World','Fair','Village','Bush','Bushes','Cave','Hill','Pond','Shore','House','Room','Gate','Bridge','Trail','Mountain','Castle','School','Bakery','Library','Backyard','Woods'];
const BEING_VERBS = 'said|asked|flew|looked|wagged|barked|ran|walked|loved|reached|pointed|shone|warned|jumped|laughed|whispered|nodded|smiled|sat|stood|played|chased|caught|threw|hugged|thanked|waved|called|giggled|trotted|licked|sang|helped|followed|found|hid|waited|listened|met|kept|has|had|is|was';
const OBJECT_CATALOG = [
  {word:'ball',name:'Red Ball',appearance:'a round red storybook ball, smooth and easy to hold'},
  {word:'lantern',name:'Lantern',appearance:'a small warm storybook lantern with a glowing pane'},
  {word:'map',name:'Map',appearance:'a folded picture-map with simple marks'},
  {word:'crystal',name:'Crystal',appearance:'a smooth glowing storybook crystal, pale blue-white'},
  {word:'crystals',name:'Crystals',appearance:'a small cluster of smooth glowing storybook crystals'}
];
const SPECIES = [
  {word:'fox',name:'Milo',appearance:'a small rusty-orange fox with bright curious eyes and a white chest',role:'curious explorer'},
  {word:'raccoon',name:'Ash',appearance:'a small cocoa raccoon in a patched scarf, pockets full of useful buttons',role:'mischief helper'},
  {word:'rabbit',name:'Pip',appearance:'a soft cream rabbit with long listening ears and a tiny blue scarf',role:'shy dreamer'},
  {word:'bear',name:'Bram',appearance:'a gentle honey-brown bear with round ears and a warm lantern',role:'kind helper'},
  {word:'owl',name:'Lumen',appearance:'a speckled dusk-gray owl with gold-rimmed eyes and a moon-feather',role:'night guide'},
  {word:'mouse',name:'Nim',appearance:'a cocoa-brown mouse in a leaf-green vest, whiskers always twitching',role:'clever friend'},
  {word:'cat',name:'Mira',appearance:'a mist-gray cat with white socks and a calm, moonlit gaze',role:'quiet watcher'},
  {word:'dog',name:'Tomo',appearance:'a warm tan puppy with floppy ears and a red bandanna',role:'loyal companion'},
  {word:'retriever',name:'Barnaby',appearance:'a golden retriever with sunny fur, bright eyes, and a wagging plume of a tail',role:'loyal companion'},
  {word:'puppy',name:'Tomo',appearance:'a warm tan puppy with floppy ears and a red bandanna',role:'loyal companion'},
  {word:'sparrow',name:'Lila',appearance:'a small sunflower-yellow sparrow with a coral scarf and bright wings',role:'cheering friend'},
  {word:'bird',name:'Lila',appearance:'a small sunflower-yellow bird with a coral scarf and bright wings',role:'cheering friend'},
  {word:'deer',name:'Sable',appearance:'a slender fawn with star-speckled fur and careful hooves',role:'gentle traveler'},
  {word:'hedgehog',name:'Ivy',appearance:'a round hedgehog with spectacles, soft quills, and a leaf-green cloak',role:'story keeper'},
  {word:'squirrel',name:'Pippin',appearance:'a cinnamon squirrel with a bottle-brush tail and a nut-button coat',role:'busy helper'},
  {word:'duck',name:'Puddle',appearance:'a plump duck with a yellow raincoat and orange rain boots',role:'splashy friend'},
  {word:'frog',name:'Reed',appearance:'a pea-green frog with a lily-pad hat and bright singing eyes',role:'pond singer'},
  {word:'turtle',name:'Theo',appearance:'an old moss-green turtle with kind eyes and a painted shell',role:'patient guide'}
];
const PLACES = [
  {word:'forest',name:'Moonlit Forest',description:'Tall quiet trees, silver leaves, and a path that glows when friends walk together.'},
  {word:'woods',name:'Whispering Woods',description:'A mossy wood where branches lean in to listen.'},
  {word:'garden',name:'Sunflower Garden',description:'A walled garden of sunflowers, bees, and a tiny painted gate.'},
  {word:'castle',name:'Cloud Castle',description:'A kind little castle with bannered towers and a courtyard of dandelions.'},
  {word:'village',name:'Lantern Village',description:'Crooked cottages, warm windows, and a square that fills with music.'},
  {word:'river',name:'Singing River',description:'A bright river that chatters over smooth stones.'},
  {word:'school',name:'Hilltop School',description:'A one-room school with open windows and paper-star decorations.'},
  {word:'mountain',name:'Blueberry Mountain',description:'A gentle mountain path lined with wild blueberries and wind.'},
  {word:'meadow',name:'Starry Meadow',description:'A wide meadow where fireflies practice their night-lights.'},
  {word:'pond',name:'Quiet Pond',description:'A still pond that holds the moon like a bowl of milk.'},
  {word:'sea',name:'Pebble Shore',description:'A soft beach of pale pebbles and tide pools.'},
  {word:'bakery',name:'Honey Bakery',description:'A warm bakery that smells of cinnamon and brave little loaves.'},
  {word:'library',name:'Nest Library',description:'A library in a hollow tree, shelves of picture books and feathers.'},
  {word:'fair',name:'Village Fair',description:'Bunting, lanterns, a tiny stage, and the smell of warm jam.'},
  {word:'beach',name:'Shell Beach',description:'Pale sand, curious shells, and a tide that leaves messages.'},
  {word:'treehouse',name:'Leafy Treehouse',description:'A wooden room in the branches with a rope ladder and a lookout.'},
  {word:'house',name:'Cozy Burrow',description:'A snug home with a round door, quilted chairs, and a kettle always almost ready.'},
  {word:'backyard',name:'Green Backyard',description:'A grassy backyard with a wooden fence, a red ball, and room to run.'},
  {word:'bushes',name:'Tall Bushes',description:'Thick leafy bushes that hide paths and lost toys.'}
];
const COMPANIONS = [
  {name:'Nora',species:'child',appearance:'a kind girl in a yellow raincoat with rain-speckled boots',role:'brave friend',traits:['kind','brave']},
  {name:'Ash',species:'raccoon',appearance:'a small cocoa raccoon in a patched scarf, pockets full of useful buttons',role:'mischief helper',traits:['clever','loyal']},
  {name:'Wren',species:'child',appearance:'a freckled child in a moss-green sweater, carrying a sketchbook',role:'noticing friend',traits:['gentle','curious']}
];
const HELPERS = [
  {name:'Bram',species:'bear',appearance:'a gentle honey-brown bear with a glowing lantern',role:'lantern keeper',traits:['patient','warm']},
  {name:'Ivy',species:'hedgehog',appearance:'an old hedgehog librarian with spectacles and a leaf-cloak',role:'story keeper',traits:['wise','kind']},
  {name:'Theo',species:'turtle',appearance:'a mossy turtle who knows every slow, safe path',role:'path guide',traits:['calm','steady']}
];

const titled = (value:string)=>value.replace(/\b([a-z])/g,letter=>letter.toUpperCase());
const sentence = (value:string)=>value.replace(/\s+/g,' ').trim().replace(/[.]?$/,'');

function seedNumber(value:string) {
  return [...value].reduce((total,char)=>total+char.charCodeAt(0),0);
}
function pick<T>(items:T[],seed:string,salt=''):T {
  return items[Math.abs(seedNumber(seed+salt))%items.length];
}
function uniqueName(name:string,taken:Set<string>,fallback:string) {
  if (!taken.has(name)) return name;
  return taken.has(fallback)?`${fallback} ${taken.size+1}`:fallback;
}

function isPlaceName(name:string) {
  const lower=name.toLowerCase();
  return PLACES.some(place=>place.word===lower||place.name.split(/\s+/).includes(name));
}
function namedIn(text:string) {
  const named=text.match(/\b(?:named|called)\s+([A-Z][a-z]{2,})\b/);
  if (named&&!NAME_STOP.has(named[1])&&!isPlaceName(named[1])) return named[1];
  return [...text.matchAll(/\b([A-Z][a-z]{2,})\b/g)].map(match=>match[1]).find(name=>!NAME_STOP.has(name)&&!isPlaceName(name));
}
function extraNamesIn(text:string,taken:Set<string>) {
  return [...text.matchAll(/\b([A-Z][a-z]{2,})\b/g)].map(match=>match[1]).filter(name=>!taken.has(name)&&!NAME_STOP.has(name)&&!isPlaceName(name));
}

function findSpecies(text:string) {
  const lower=text.toLowerCase();
  return SPECIES.find(species=>new RegExp(`\\b${species.word}\\b`).test(lower));
}
function findAllSpecies(text:string) {
  const lower=text.toLowerCase();
  return SPECIES.filter(species=>new RegExp(`\\b${species.word}\\b`).test(lower));
}
function speciesOf(character:Pick<Character,'appearance'|'description'|'name'>) {
  return findSpecies(`${character.appearance} ${character.description} ${character.name}`)?.word;
}
function findPlaces(text:string) {
  const lower=text.toLowerCase();
  const found=PLACES.filter(place=>lower.includes(place.word));
  return found.length?found.slice(0,3):[];
}

function appearanceFromPrompt(prompt:string,fallback:string) {
  const cleaned=sentence(prompt);
  return looksLikeProse(cleaned)?fallback:cleaned.length>12?cleaned:fallback;
}

function extractWant(premise:string) {
  const desire=premise.match(/\b(?:who\s+)?want[s]?\s+to\s+(.+?)(?:[.!?]|$)/i)||premise.match(/\b(?:hoping|trying|learning)\s+to\s+(.+?)(?:[.!?]|$)/i);
  if (desire) return sentence(desire[1]);
  const afterName=premise.replace(/^(?:a|an|the)\s+/i,'').replace(/^(?:shy|brave|little|curious|kind|small)\s+/i,'').replace(/^(?:[A-Z][a-z]{2,}|[a-z]+)(?:\s+named\s+[A-Z][a-z]{2,})?\s+/,'');
  return sentence(afterName)||'find a little wonder';
}

export function generateCharacter(prompt:string):Character {
  const text=prompt.trim();
  const species=findSpecies(text);
  const name=namedIn(text)||species?.name||pick(['Luma','Pip','Cinder','Moss','Pearl'],text,'name');
  const role=/\bshy\b/i.test(text)?'shy dreamer':/\bbrave\b/i.test(text)?'brave explorer':species?.role||'story friend';
  const traits=[...new Set([
    /\bshy\b/i.test(text)?'shy':undefined,
    /\bbrave\b/i.test(text)?'brave':undefined,
    /\bkind\b/i.test(text)?'kind':undefined,
    /\bfunny|silly\b/i.test(text)?'playful':undefined,
    /\bcurious\b/i.test(text)?'curious':undefined,
    species?.word
  ].filter((value):value is string=>Boolean(value)))].slice(0,4);
  const appearance=appearanceFromPrompt(text,species?.appearance||`a friendly children's-story character named ${name}`);
  return createCharacter({
    name,
    role,
    description:`${name} is ${role}: ${appearance}.`,
    appearance,
    traits:traits.length?traits:['kind'],
    key:true
  });
}

export function generateLocation(prompt:string):Location {
  const text=prompt.trim();
  const known=findPlaces(text)[0];
  const name=known?.name||titled(text.replace(/^(a|an|the)\s+/i,'').slice(0,32))||'Story Place';
  return createLocation({
    name,
    description:known?.description||`A children's-story place: ${sentence(text)}.`
  });
}

export function generateObject(prompt:string):StoryObject {
  const text=prompt.trim();
  const known=OBJECT_CATALOG.find(item=>new RegExp(`\\b${item.word}\\b`,'i').test(text));
  const name=known?.name||titled(text.replace(/^(a|an|the)\s+/i,'').replace(/[^A-Za-z0-9 ]/g,' ').trim().split(/\s+/).slice(0,3).join(' '))||'Special Object';
  const appearance=known?.appearance||(looksLikeProse(text)?`a special children's-story object called ${name}, simple and easy to recognize`:sentence(text));
  return createObject({
    name,
    appearance,
    description:`${name} is a special object in the story.`
  });
}

function looksLikeProse(value:string) {
  const text=value.trim();
  if (!text) return true;
  if (/["“]/.test(text)) return true;
  if ((text.match(/[.!?]/g)||[]).length>=2) return true;
  return text.split(/\s+/).length>22;
}

function placeCompoundName(name:string,text:string) {
  const match=text.match(new RegExp(`\\b${name}\\s+(${PLACE_FOLLOWERS.join('|')})\\b`));
  return match?match[0]:undefined;
}

function isPlaceCompound(name:string,text:string) {
  return Boolean(placeCompoundName(name,text));
}

const BEING_KINDS = 'girl|boy|child|man|woman|dog|puppy|retriever|fox|rabbit|cat|owl|bear|mouse|bird|fairy|creature|friend|animal';

function hasBeingEvidence(name:string,text:string) {
  if (new RegExp(`\\b(?:named|called|met|found|saw)\\s+${name}\\b`).test(text)) return true;
  if (new RegExp(`\\b${name}\\s+(?:the\\s+)?(?:${BEING_VERBS})\\b`,'i').test(text)) return true;
  if (new RegExp(`\\b(?:a|an|the)\\s+(?:${BEING_KINDS})\\s+(?:named\\s+)?${name}\\b`,'i').test(text)) return true;
  if (new RegExp(`\\b${name},\\s+(?:a|an)\\s+(?:${BEING_KINDS})\\b`,'i').test(text)) return true;
  if (new RegExp(`\\b(?:${BEING_KINDS})\\b[^.!?]{0,48}\\b${name}\\b`,'i').test(text)) return true;
  if (new RegExp(`\\b${name}\\b[^.!?]{0,48}\\b(?:${BEING_KINDS})\\b`,'i').test(text)) return true;
  return false;
}

export function classifyStoryName(name:string,text:string):'character'|'place'|'object'|'drop' {
  if (!name||ANALYZE_NAME_STOP.has(name)||isPlaceName(name)) return 'drop';
  if (placeCompoundName(name,text)) return 'place';
  if (hasBeingEvidence(name,text)) return 'character';
  if (new RegExp(`["“']${name}\\b`).test(text)) return 'drop';
  if (new RegExp(`\\b(?:and|with)\\s+${name}\\b`).test(text)) return 'character';
  return 'drop';
}

export function isAuditedCharacter(name:string,text:string) {
  return classifyStoryName(name,text)==='character';
}

function findNamedPlaces(text:string) {
  const prefixStop=new Set(['The','A','An','This','That','They','His','Her','Our','Your','Its','Their']);
  const found=new Map<string,{name:string;description:string}>();
  const re=new RegExp(`\\b([A-Z][a-z]{2,})\\s+(${PLACE_FOLLOWERS.join('|')})\\b`,'g');
  for (const match of text.matchAll(re)) {
    const name=match[0];
    if (prefixStop.has(match[1])) continue;
    if (!found.has(name.toLowerCase())) found.set(name.toLowerCase(),{name,description:`A children's-story place called ${name}.`});
  }
  return [...found.values()];
}

function extractPlotObjects(text:string,existing:StoryObject[]=[]) {
  const objects=[...existing];
  const lower=text.toLowerCase();
  for (const item of OBJECT_CATALOG) {
    if (!new RegExp(`\\b${item.word}\\b`,'i').test(lower)) continue;
    if (item.word==='crystal'||item.word==='crystals') {
      if (/\bcrystal\s+stream\b/i.test(text)) continue;
    }
    if (objects.some(object=>object.name.toLowerCase()===item.name.toLowerCase()||object.name.toLowerCase().includes(item.word))) continue;
    objects.push(createObject({name:item.name,appearance:item.appearance,description:`${item.name} is a special object in the story.`}));
  }
  return objects.slice(0,6);
}

export function auditStoryModules(text:string,modules:Pick<Project,'characters'|'locations'|'objects'|'scenes'>):Pick<Project,'characters'|'locations'|'objects'|'scenes'> {
  const source=text.trim();
  const characters=modules.characters.filter(character=>isAuditedCharacter(character.name,source)).slice(0,5).map((character,index)=>{
    const around=mentionsOf(character.name,source);
    const appearance=looksLikeProse(character.appearance)?imagineAppearance(character.name,around||source.slice(0,220)):character.appearance;
    return {
      ...character,
      appearance,
      description:looksLikeProse(character.description)?`${character.name} is ${appearance}.`:character.description,
      key:character.key??index<2,
      traits:(character.traits||[]).filter(trait=>trait!=='key')
    };
  });
  const locations=modules.locations.slice();
  for (const extra of modules.characters.filter(character=>classifyStoryName(character.name,source)==='place')) {
    const name=placeCompoundName(extra.name,source)||extra.name;
    if (locations.some(location=>location.name.toLowerCase()===name.toLowerCase()||location.name.toLowerCase().includes(extra.name.toLowerCase()))) continue;
    locations.push(createLocation({name,description:`A recurring place called ${name}.`}));
  }
  for (const place of findNamedPlaces(source)) {
    if (locations.some(location=>location.name.toLowerCase()===place.name.toLowerCase())) continue;
    locations.push(createLocation(place));
  }
  const objects=extractPlotObjects(source,modules.objects||[]);
  const ids=new Set(characters.map(character=>character.id));
  const objectIds=new Set(objects.map(object=>object.id));
  const scenes=modules.scenes.map(scene=>{
    const mentionedObjects=objects.filter(object=>scene.sourceText.toLowerCase().includes(object.name.toLowerCase())||OBJECT_CATALOG.some(item=>object.name.toLowerCase().includes(item.word)&&new RegExp(`\\b${item.word}\\b`,'i').test(scene.sourceText)));
    return {
      ...scene,
      characterIds:scene.characterIds.filter(id=>ids.has(id)),
      objectIds:[...new Set([...(scene.objectIds||[]).filter(id=>objectIds.has(id)),...mentionedObjects.map(object=>object.id)])]
    };
  });
  return {characters,locations,objects,scenes};
}

export function sanitizeStoryModules(text:string,modules:Pick<Project,'characters'|'locations'|'objects'|'scenes'>):Pick<Project,'characters'|'locations'|'objects'|'scenes'> {
  const source=text.trim();
  const characters=modules.characters.map((character,index)=>{
    const around=mentionsOf(character.name,source);
    const appearance=looksLikeProse(character.appearance)?imagineAppearance(character.name,around||source.slice(0,220)):character.appearance;
    return {
      ...character,
      appearance,
      description:looksLikeProse(character.description)?`${character.name} is ${appearance}.`:character.description,
      key:character.key??index<2
    };
  });
  const objects=(modules.objects||[]).map(object=>({
    ...object,
    appearance:looksLikeProse(object.appearance)?`a special storybook object called ${object.name}, simple and easy to recognize`:object.appearance,
    description:looksLikeProse(object.description)?`${object.name} is a special object in the story.`:object.description
  }));
  return {...modules,characters,objects};
}

function mentionsOf(name:string,text:string) {
  return text.split(/(?<=[.!?])\s+/).filter(part=>part.includes(name)).slice(0,4).join(' ');
}

function imagineAppearance(name:string,around:string) {
  const lower=`${around} ${name}`.toLowerCase();
  const species=(findAllSpecies(around).find(item=>{
    const next=new RegExp(`${item.word}(?:,)?\\s+(?:named\\s+)?${name}\\b`,'i');
    const prev=new RegExp(`${name}\\s+(?:the\\s+)?(?:[a-z]+\\s+){0,3}${item.word}`,'i');
    return next.test(around)||prev.test(around);
  })||undefined);
  if (species) return species.appearance;
  if (/\bfairy\b|\bflew\b|\bwings\b|\bglow/.test(lower)) return `a tiny storybook fairy named ${name}, shimmering wings, a distinct outfit, easy to recognize`;
  if (/\bgirl\b|\bdaughter\b/.test(lower)||new RegExp(`\\b${name}\\b[^.!?]{0,40}\\bher\\b`,'i').test(around)) {
    return `a little girl named ${name}, storybook clothes, kind face, easy to recognize in every scene`;
  }
  if (/\bboy\b|\bson\b/.test(lower)||new RegExp(`\\b${name}\\b[^.!?]{0,40}\\bhis\\b`,'i').test(around)) {
    return `a little boy named ${name}, storybook clothes, kind face, easy to recognize in every scene`;
  }
  return `a children's storybook character named ${name}, distinct colors and clothes, kind face, easy to recognize`;
}

export function analyzeStory(text:string):Pick<Project,'characters'|'locations'|'objects'|'scenes'> {
  const source=text.trim();
  const names=[...new Set((source.match(/\b[A-Z][a-z]{2,}\b/g)||[]).filter(name=>isAuditedCharacter(name,source)))].slice(0,8);
  const characters=names.map((name,index)=>{
    const around=mentionsOf(name,source);
    const appearance=imagineAppearance(name,around||source.slice(0,220));
    const role=index===0?'hero':index===1?'friend':'story friend';
    return createCharacter({
      name,
      role,
      appearance,
      description:`${name} is ${appearance}.`,
      traits:index<2?['curious']:['kind'],
      key:index<2
    });
  });
  const catalogPlaces=findPlaces(source).slice(0,6).map(place=>createLocation({name:place.name,description:place.description}));
  const namedPlaces=findNamedPlaces(source).map(place=>createLocation(place));
  const locations=[...catalogPlaces];
  for (const place of namedPlaces) {
    if (!locations.some(location=>location.name.toLowerCase()===place.name.toLowerCase())) locations.push(place);
  }
  const objects=extractPlotObjects(source);
  const paragraphs=source.split(/\n{2,}/).map(part=>part.replace(/\s+/g,' ').trim()).filter(Boolean);
  const chunks=(paragraphs.length>1?paragraphs:source.split(/(?<=[.!?])\s+/).filter(Boolean)).slice(0,16);
  const scenes=chunks.map((sourceText,order)=>{
    const who=characters.filter(character=>sourceText.includes(character.name));
    const what=objects.filter(object=>sourceText.toLowerCase().includes(object.name.toLowerCase())||OBJECT_CATALOG.some(item=>object.name.toLowerCase().includes(item.word)&&new RegExp(`\\b${item.word}\\b`,'i').test(sourceText)));
    const where=locations.find(location=>sourceText.toLowerCase().includes(location.name.toLowerCase())||sourceText.toLowerCase().includes(location.name.split(' ').pop()||''));
    const summary=sourceText.slice(0,100);
    const visual=`Children's storybook scene: ${summary} ${who.map(character=>character.appearance).join('; ')}${what.length?`. Objects: ${what.map(object=>object.appearance).join('; ')}`:''}${where?`. Place: ${where.name}. ${where.description}`:''}`;
    return createScene({order,sourceText,summary,visualDescription:visual,characterIds:who.map(character=>character.id),objectIds:what.map(object=>object.id),locationId:where?.id});
  });
  return auditStoryModules(source,{characters,locations,objects,scenes});
}

function remember(character:Character,taken:Set<string>,usedSpecies:Set<string>) {
  taken.add(character.name);
  const species=speciesOf(character);
  if (species) usedSpecies.add(species);
}
function unusedFrom<T extends {name:string;species:string}>(pool:T[],taken:Set<string>,usedSpecies:Set<string>,seed:string,salt:string) {
  const available=pool.filter(item=>!taken.has(item.name)&&!usedSpecies.has(item.species));
  return available.length?pick(available,seed,salt):undefined;
}
function extractCastFromPremise(premise:string) {
  const taken=new Set<string>();
  const characters:Character[]=[];
  const speciesHits=findAllSpecies(premise);
  const heroName=namedIn(premise);
  for (const [index,species] of speciesHits.entries()) {
    const name=index===0&&heroName?uniqueName(heroName,taken,species.name):uniqueName(species.name,taken,species.name);
    taken.add(name);
    characters.push(createCharacter({
      name,
      role:species.role,
      appearance:species.appearance,
      description:`${name} is a ${species.word} friend who wants to ${extractWant(premise)}.`,
      traits:['curious',species.word],
      key:index<2
    }));
  }
  for (const name of extraNamesIn(premise,taken)) {
    if (characters.length>=3) break;
    taken.add(name);
    characters.push(createCharacter({
      name,
      role:'story friend',
      appearance:`a children's storybook friend named ${name}, easy to recognize`,
      description:`${name} is a story friend.`,
      traits:['kind'],
      key:characters.length<2
    }));
  }
  if (characters.length) return characters;
  const name=heroName||'Milo';
  return [createCharacter({
    name,
    role:'curious explorer',
    appearance:`a small friendly animal child named ${name}, storybook colors`,
    key:true,
    description:`${name} wants to ${extractWant(premise)}.`,
    traits:['curious']
  })];
}
function buildCast(brief:StoryBrief) {
  const taken=new Set<string>();
  const usedSpecies=new Set<string>();
  const characters=[...(brief.characters??[])];
  for (const character of characters) remember(character,taken,usedSpecies);
  if (!characters.length) {
    for (const character of extractCastFromPremise(brief.premise)) {
      remember(character,taken,usedSpecies);
      characters.push(character);
    }
  }
  if (characters.length<2) {
    const companion=unusedFrom(COMPANIONS,taken,usedSpecies,brief.premise,'companion');
    if (companion) {
      const added=createCharacter({
        name:companion.name,
        role:companion.role,
        appearance:companion.appearance,
        description:`${companion.name} is ${companion.appearance}.`,
        traits:companion.traits,
        key:true
      });
      remember(added,taken,usedSpecies);
      characters.push(added);
    }
  }
  const leftover=findAllSpecies(brief.premise).find(species=>!usedSpecies.has(species.word));
  if (characters.length<3&&leftover) {
    const name=uniqueName(leftover.name,taken,leftover.name);
    characters.push(createCharacter({
      name,
      role:leftover.role,
      appearance:leftover.appearance,
      description:`${name} is ${leftover.appearance}.`,
      traits:[leftover.word,'kind'],
      key:false
    }));
  }
  return characters.slice(0,4).map((character,index)=>({...character,key:character.key??index<2}));
}

export function keyCharacters(characters:Character[]) {
  const marked=characters.filter(character=>character.key);
  return marked.length?marked:characters.slice(0,2);
}

export function missingKeyExamples(characters:Character[]) {
  return keyCharacters(characters).filter(character=>character.imageStatus!=='generated'||!(character.imageFile||character.selectedImage));
}

function buildPlaces(brief:StoryBrief,hero:Character) {
  const locations=[...(brief.locations??[])];
  const found=findPlaces(brief.premise);
  for (const place of found) {
    if (!locations.some(location=>location.name===place.name)) locations.push(createLocation(place));
  }
  if (!locations.length) {
    locations.push(createLocation({name:`${hero.name}'s Home`,description:`A snug, safe home that smells like tea and stories. ${hero.name} starts here.`}));
    locations.push(createLocation(pick(PLACES,brief.premise,'away')));
  }
  if (locations.length<2) locations.push(createLocation(pick(PLACES,brief.premise,'second')));
  return locations.slice(0,4);
}

function titleFrom(hero:Character,locations:Location[],premise:string) {
  const wonder=findPlaces(premise)[0]?.name.replace(/^(Moonlit|Whispering|Sunflower|Cloud|Lantern|Singing|Hilltop|Blueberry|Starry|Quiet|Pebble|Honey|Nest|Village|Shell|Leafy|Cozy)\s+/,'')||premise.split(/\s+/).slice(0,4).map(titled).join(' ');
  return `${hero.name} and the ${wonder||locations[1]?.name||'Small Wonder'}`;
}

function ageVoice(age:StoryAge,short:string,medium:string,longer:string) {
  if (age==='3-5') return short;
  if (age==='7-9') return longer;
  return medium;
}

function present(...who:(Character|undefined)[]) {
  const seen=new Set<string>();
  const cast:Character[]=[];
  for (const character of who) {
    if (!character||seen.has(character.id)) continue;
    seen.add(character.id);
    cast.push(character);
  }
  return cast;
}
function writeArc(brief:StoryBrief,characters:Character[],locations:Location[]) {
  const tone=brief.tone??'gentle';
  const age=brief.age??'5-7';
  const hero=characters[0];
  const friend=characters[1];
  const helper=characters[2];
  const home=locations[0];
  const away=locations[1]||locations[0];
  const want=extractWant(brief.premise);
  const beats:Array<{summary:string;sourceText:string;visualDescription:string;characterIds:string[];locationId?:string}> = [];

  const push=(summary:string,sourceText:string,visualDescription:string,who:Character[],where?:Location)=>{
    beats.push({summary,sourceText,visualDescription,characterIds:who.map(character=>character.id),locationId:where?.id});
  };

  if (tone==='funny') {
    push(
      `${hero.name} has a wonderfully wobbly idea`,
      ageVoice(age,
        `${hero.name} had a silly idea. ${hero.name} giggled. "I will ${want}!"`,
        `${hero.name} woke up with a wonderfully wobbly idea. "Today I will ${want}," ${hero.name} said, and a sock immediately disappeared.`,
        `${hero.name} announced a plan so silly the teacups leaned in. "${hero.name} will ${want}," said ${hero.name}, as if that were a perfectly ordinary Tuesday.`
      ),
      `${hero.appearance} in ${home.name}, mid-giggle, a messy cozy room, morning light, children's storybook illustration.`,
      [hero],
      home
    );
    if (friend) push(
      `${friend.name} says yes before asking what`,
      `${friend.name} arrived and said yes so quickly that ${hero.name} had to explain the plan twice. They bumped noses and laughed.`,
      `${friend.appearance} arriving beside ${hero.appearance}, both smiling, ${home.name}.`,
      present(hero,friend),
      home
    );
    push(
      `The plan goes delightfully wrong`,
      ageVoice(age,
        `They tried. Things went wiggle-woggle. ${hero.name} said, "Oops."`,
        `In ${away.name}, the plan went wiggle-woggle. A leaf stuck to ${hero.name}'s nose.${friend?` ${friend.name} tried to help and got two leaves.`:''}`,
        `At ${away.name} the plan tripped over itself. ${hero.name}${friend?` and ${friend.name}`:''} made it worse in the kindest possible way, until even the wind sounded like a giggle.`
      ),
      `A comic children's-story moment in ${away.name}: ${present(hero,friend).map(character=>character.name).join(' and ')} in a harmless silly mishap.`,
      present(hero,friend),
      away
    );
    if (helper) push(
      `${helper.name} knows the funny fix`,
      `${helper.name} watched, then showed them the slow, silly way that actually worked. Nobody had to be perfect.`,
      `${helper.appearance} calmly helping ${present(hero,friend).map(character=>character.appearance).join(' and ')} in ${away.name}.`,
      present(hero,friend,helper),
      away
    );
    push(
      `They did it, and then they had snacks`,
      `They did the thing, badly and beautifully. Then they went home for something warm and shared the story of the oops until it became the best part.`,
      `${present(hero,friend,helper).map(character=>character.appearance).join(', ')} sharing a cozy snack in ${home.name}, golden light.`,
      present(hero,friend,helper),
      home
    );
  } else if (tone==='adventurous') {
    push(
      `${hero.name} packs for a small brave day`,
      ageVoice(age,
        `${hero.name} packed a bag. ${hero.name} was a little brave. ${hero.name} wanted to ${want}.`,
        `${hero.name} packed a small bag and a large hope. Today was the day to ${want}.`,
        `${hero.name} stood in ${home.name} and felt the ordinary morning stretch into an adventure. The plan was simple and a little scary: ${want}.`
      ),
      `${hero.appearance} packing a tiny satchel in ${home.name}, dawn light, storybook adventure.` ,
      [hero],
      home
    );
    if (friend) push(
      `${friend.name} joins the trail`,
      `"I know a way," said ${friend.name}. Together they left the safe door and followed the first bright path.`,
      `${hero.appearance} and ${friend.appearance} stepping onto a path, leaving ${home.name}.`,
      present(hero,friend),
      home
    );
    push(
      `A tricky crossing in ${away.name}`,
      ageVoice(age,
        `${away.name} was big. ${hero.name} took a breath. They crossed together.`,
        `${away.name} looked bigger than it had from the window. ${hero.name} took a breath.${friend?` ${friend.name} held out a paw.`:''} They crossed together.`,
        `The way through ${away.name} asked for careful feet. ${hero.name} wanted to turn back, then remembered why they had come, and took the next step${friend?` with ${friend.name}`:''}.`
      ),
      `A slightly dramatic but safe crossing in ${away.name}, ${present(hero,friend).map(character=>character.name).join(' and ')}, children's adventure book.`,
      present(hero,friend),
      away
    );
    if (helper) push(
      `${helper.name} lends a lantern`,
      `${helper.name} was waiting with a lantern and a slower map. "Brave is just kind to yourself in a hard place," ${helper.name} said.`,
      `${helper.appearance} offering a lantern to ${present(hero,friend).map(character=>character.appearance).join(' and ')} in ${away.name}.`,
      present(hero,friend,helper),
      away
    );
    push(
      `They find what they came for`,
      `They did it. Not perfectly, not loudly. ${hero.name} had come to ${want}, and the world felt a little wider.`,
      `A triumphant, gentle discovery in ${away.name}: ${present(hero,friend,helper).map(character=>character.name).join(', ')}, warm light, no danger.`,
      present(hero,friend,helper),
      away
    );
    push(
      `Home again, braver by an inch`,
      `They walked home under a kinder sky. ${hero.name} put the bag away and kept the brave.`,
      `${present(hero,friend).map(character=>character.appearance).join(' and ')} returning to ${home.name}, sunset, safe and proud.`,
      present(hero,friend),
      home
    );
  } else {
    push(
      `${hero.name} in the quiet of ${home.name}`,
      ageVoice(age,
        `${hero.name} lived in ${home.name}. ${hero.name} had a small wish. ${hero.name} wanted to ${want}.`,
        `${hero.name} lived in ${home.name}, where the light was soft and the days were mostly gentle. Still, ${hero.name} kept a small wish: to ${want}.`,
        `In ${home.name}, ${hero.name} moved quietly through a kind ordinary day. Under the kettle-sound lived a wish that would not stay small: to ${want}.`
      ),
      `${hero.appearance} in ${home.name}, quiet morning, warm interior, children's picture book.`,
      [hero],
      home
    );
    if (friend) push(
      `${friend.name} arrives like good weather`,
      `Then ${friend.name} came, the way good weather comes. "We can go slowly," ${friend.name} said.`,
      `${friend.appearance} meeting ${hero.appearance} at the door of ${home.name}, soft smiles.`,
      present(hero,friend),
      home
    );
    push(
      `A wonder waiting in ${away.name}`,
      ageVoice(age,
        `They walked to ${away.name}. They looked. Something kind was there.`,
        `They walked to ${away.name}. Nothing rushed them. In a quiet pocket of the world, something kind was waiting to be noticed.`,
        `${away.name} held its breath for them. ${present(hero,friend).map(character=>character.name).join(' and ')} found not a loud miracle, but a small one that wanted company.`
      ),
      `A lyrical children's-story vista of ${away.name} with ${present(hero,friend).map(character=>character.name).join(' and ')} noticing a small wonder.`,
      present(hero,friend),
      away
    );
    if (helper) push(
      `${helper.name} keeps the light`,
      `${helper.name} was already there, keeping a light for anyone who needed one. "Wishes like company," ${helper.name} said.`,
      `${helper.appearance} with a lantern or warm glow, ${present(hero,friend).map(character=>character.appearance).join(' and ')} nearby in ${away.name}.`,
      present(hero,friend,helper),
      away
    );
    push(
      `They share the wish until it is enough`,
      `They did not fix the whole world. They shared the wish until it felt like enough. That was the story.`,
      `Close, warm grouping of ${present(hero,friend,helper).map(character=>character.name).join(', ')} in ${away.name}, golden hour, picture-book tenderness.`,
      present(hero,friend,helper),
      away
    );
    push(
      `The walk home is the last page`,
      `On the walk home, ${hero.name} held the day like a smooth stone. ${home.name} was waiting, and the wish had a place to sit.`,
      `${present(hero,friend).map(character=>character.appearance).join(' and ')} walking back toward ${home.name}, dusk, safe path, storybook ending.`,
      present(hero,friend),
      home
    );
  }
  const shape=normalizeStoryShape(brief);
  const pages=fitPages(beats,shape.pageCount);
  return pages.map(beat=>({...beat,sourceText:shapeSceneProse(beat.sourceText,shape)}));
}

export function generateScene(input:{beat:string;order:number;characters:Character[];location?:Location}):Scene {
  const who=input.characters;
  const place=input.location;
  const beat=sentence(input.beat)||'A quiet story moment';
  const appearance=who.map(character=>character.appearance).join('; ');
  return createScene({
    order:input.order,
    sourceText:place?`${beat} ${place.name?`in ${place.name}`:''}.`.replace(/\s+\./,'.'):`${beat}.`,
    summary:beat.slice(0,80),
    visualDescription:`Children's storybook scene: ${beat}. ${appearance}${place?`. Location: ${place.name}. ${place.description}`:''}`,
    characterIds:who.map(character=>character.id),
    locationId:place?.id
  });
}

export function generateStory(brief:StoryBrief):Pick<Project,'title'|'sourceText'|'premise'|'characters'|'locations'|'objects'|'scenes'> {
  const premise=brief.premise.trim();
  if (!premise) throw new Error('A premise is required to generate a story.');
  const characters=buildCast(brief);
  const locations=buildPlaces(brief,characters[0]);
  const beats=writeArc({...brief,premise},characters,locations);
  const drafted=beats.map((beat,order)=>createScene({...beat,order}));
  const sourceText=drafted.map(scene=>scene.sourceText).join('\n\n');
  const objects=extractPlotObjects(`${premise}\n${sourceText}`,brief.objects||[]);
  const scenes=drafted.map(scene=>({
    ...scene,
    objectIds:objects.filter(object=>scene.sourceText.toLowerCase().includes(object.name.toLowerCase())||OBJECT_CATALOG.some(item=>object.name.toLowerCase().includes(item.word)&&new RegExp(`\\b${item.word}\\b`,'i').test(scene.sourceText))).map(object=>object.id)
  }));
  return {
    title:titleFrom(characters[0],locations,premise),
    sourceText,
    premise,
    characters,
    locations,
    objects,
    scenes
  };
}

export function sceneReferenceCast(scene:Scene,characters:Character[]) {
  const inScene=characters.filter(character=>scene.characterIds.includes(character.id));
  const locked=keyCharacters(inScene).filter(character=>character.imageFile||(character.selectedImage&&!character.selectedImage.startsWith('data:')));
  return locked.length?locked:keyCharacters(inScene);
}
export function characterVisualPrompt(character:Character) {
  const identity=character.appearance.trim()||`${character.name} from the story`;
  return `Must match this visual identity exactly: ${identity}. One isolated children's storybook character example of ${character.name} only: ${identity}. Same species, coat, clothes, and accessory colors as written — do not swap a different breed, scarf, or bandanna color. Full body, standing, facing the viewer, only this one character, no other animals. Pale cream background, no room, no landscape, no extra people. Soft picture-book illustration.`;
}
export function objectVisualPrompt(object:StoryObject) {
  const identity=object.appearance.trim()||object.description||object.name;
  return `Must match this visual identity exactly: ${identity}. One isolated children's storybook object: ${object.name}. ${identity}. No characters, no hands holding it unless the identity says so. Pale cream background, product-sheet view, soft picture-book illustration.`;
}
export function locationVisualPrompt(location:Location) {
  return `Reusable children's storybook location example of ${location.name}, wide establishing view, empty of main characters. ${location.description}`;
}
export function sceneVisualPrompt(scene:Scene,project:Pick<Project,'characters'|'locations'|'objects'>) {
  const who=sceneReferenceCast(scene,project.characters);
  const where=project.locations.find(location=>location.id===scene.locationId);
  const props=(project.objects||[]).filter(object=>(scene.objectIds||[]).includes(object.id));
  const labeled=who.map((character,index)=>`Reference ${index+1} is only ${character.name}: ${character.appearance}`).join('. ');
  const names=who.map(character=>character.name).join(' and ')||'the known characters';
  const objectLine=props.length?` Special objects in this moment: ${props.map(object=>`${object.name} (${object.appearance})`).join('; ')}.`:'';
  return `Children's storybook scene using the attached character examples as identity locks. ${labeled}. Keep ${names} as those exact characters: same species, clothes, colors, and face. Do not swap who is who. Do not invent new main characters.${objectLine} Action: ${scene.summary}.${where?` Place: ${where.name}.`:''}`;
}
