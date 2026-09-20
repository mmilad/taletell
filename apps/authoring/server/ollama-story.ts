import { generateStory, type StoryAge, type StoryBrief, type StoryTone } from '../src/generate.ts';
import { parseStoryDraft } from '../src/story-draft.ts';
import type { Project } from '../src/domain.ts';

export type StoryStatus = {
  ok:boolean;
  mode:'ollama'|'template';
  ready:boolean;
  model?:string;
  detail?:string;
  error?:string;
};

export type GeneratedStory = Pick<Project,'title'|'sourceText'|'characters'|'locations'|'scenes'> & {
  mode:'ollama'|'template';
  model?:string;
};

const PREFERRED=['qwen3.5:latest','qwen3.5','llama3:instruct','llama3:latest','llama3','mistral:latest','phi4:latest'];

function baseUrl() {
  return (process.env.STORYTELLER_OLLAMA_URL||'http://127.0.0.1:11434').replace(/\/$/,'');
}

function requestedModel() {
  return process.env.STORYTELLER_LLM_MODEL?.trim()||'';
}

function storyMode():'auto'|'ollama'|'template' {
  const value=(process.env.STORYTELLER_STORY_MODE||'auto').trim().toLowerCase();
  if (value==='ollama'||value==='template') return value;
  return 'auto';
}

type OllamaModel={name?:string};
type OllamaTags={models?:OllamaModel[]};
type OllamaChat={message?:{content?:unknown}; error?:string};

function usableName(name:string) {
  return name&&!/embed/i.test(name);
}

function pickModel(names:string[]) {
  const asked=requestedModel();
  if (asked&&names.includes(asked)) return asked;
  const preferred=PREFERRED.find(name=>names.includes(name));
  if (preferred) return preferred;
  return names.find(usableName);
}

async function ollamaJson<T>(path:string,init?:RequestInit):Promise<T> {
  const response=await fetch(`${baseUrl()}${path}`,{...init,headers:{'Content-Type':'application/json',...init?.headers}});
  const payload=await response.json() as T & {error?:string};
  if (!response.ok) throw new Error(payload.error||`Ollama request failed (${response.status})`);
  return payload;
}

export async function getStoryStatus():Promise<StoryStatus> {
  const mode=storyMode();
  if (mode==='template') return {ok:true,mode:'template',ready:false,detail:'Template writer is forced on.'};
  try {
    const tags=await ollamaJson<OllamaTags>('/api/tags');
    const names=(tags.models||[]).map(model=>model.name||'').filter(usableName);
    const model=pickModel(names);
    if (!model) {
      return {ok:true,mode:'template',ready:false,detail:'Ollama is running, but no chat model is installed. Using the template writer.'};
    }
    return {ok:true,mode:'ollama',ready:true,model,detail:`Local stories use ${model}.`};
  } catch (error) {
    const detail=error instanceof Error?error.message:'Ollama is not running.';
    if (mode==='ollama') return {ok:false,mode:'ollama',ready:false,detail,error:detail};
    return {ok:true,mode:'template',ready:false,detail:'Ollama is not running. Using the template writer.'};
  }
}

function systemPrompt() {
  return `You write original children's picture-book stories. Reply with JSON only.

JSON shape:
{
  "title": "string",
  "sourceText": "the complete story as 4-8 short paragraphs a parent can read aloud",
  "characters": [{"name":"Pip","role":"hero","key":true,"description":"who they are","appearance":"one visual identity sentence: species, colors, clothes, face","traits":["curious","kind"]}],
  "locations": [{"name":"Moonlit Forest","description":"visual setting, empty of named characters"}],
  "scenes": [{"summary":"page title","sourceText":"the words on this page","visualDescription":"what the illustration shows","characterNames":["Pip"],"locationName":"Moonlit Forest"}]
}

Hard rules:
- Follow the user's premise. Do not replace it with a village fair, school, or lantern-wish plot unless they asked for that.
- 2 to 4 characters with distinct names, species, and clothes. Never reuse a name.
- 2 or 3 places that belong in this premise.
- 6 to 8 picture-book pages covering a beginning, middle, and a safe ending.
- Every scenes[].characterNames value must match a characters[].name exactly. Do not invent extras in scenes.
- Warm, concrete language for the stated age. No lecture, no real danger.
- appearance is an identity lock for later image generation.`;
}

function userPrompt(brief:StoryBrief) {
  const tone=brief.tone||'gentle';
  const age=brief.age||'5-7';
  const lines=[`Premise: ${brief.premise.trim()}`,`Tone: ${tone}`,`Age band: ${age}`];
  if (brief.characters?.length) {
    lines.push('Keep these characters exactly (same names and appearances). Write a new story with them:');
    for (const character of brief.characters) {
      lines.push(`- ${character.name} (${character.role}): ${character.appearance}`);
    }
    lines.push('You may add at most one new supporting character if the premise truly needs it.');
  } else {
    lines.push('Invent a small cast that matches the premise. Do not use stock names unless they fit.');
  }
  if (brief.locations?.length) {
    lines.push('Prefer these places, and add at most one new place if the premise needs it:');
    for (const location of brief.locations) lines.push(`- ${location.name}: ${location.description}`);
  }
  lines.push('Return the JSON object now.');
  return lines.join('\n');
}

async function chatStory(model:string,brief:StoryBrief,repair?:string) {
  const messages=[{role:'system',content:systemPrompt()},{role:'user',content:userPrompt(brief)}];
  if (repair) messages.push({role:'user',content:repair});
  const payload=await ollamaJson<OllamaChat>('/api/chat',{
    method:'POST',
    body:JSON.stringify({
      model,
      stream:false,
      format:'json',
      think:false,
      messages,
      options:{temperature:0.7,num_predict:2800}
    }),
    signal:AbortSignal.timeout(180_000)
  });
  if (payload.error) throw new Error(payload.error);
  return payload.message?.content;
}

export async function generateLocalStory(brief:StoryBrief):Promise<GeneratedStory> {
  const premise=brief.premise.trim();
  if (!premise) throw new Error('A premise is required to generate a story.');
  const status=await getStoryStatus();
  const keep=brief.characters?.length||brief.locations?.length?{characters:brief.characters,locations:brief.locations}:undefined;
  const templated=()=>{
    const generated=generateStory(brief);
    return {...generated,mode:'template' as const};
  };
  if (!status.ready||status.mode!=='ollama'||!status.model) {
    if (storyMode()==='ollama') throw new Error(status.error||status.detail||'Ollama is not ready.');
    return templated();
  }
  try {
    const first=await chatStory(status.model,brief);
    try {
      return {...parseStoryDraft(first,keep),mode:'ollama',model:status.model};
    } catch (error) {
      const reason=error instanceof Error?error.message:'The story JSON could not be read.';
      const retry=await chatStory(status.model,brief,`Your previous reply was not usable (${reason}). Return only the JSON object, with characters, locations, and scenes filled in.`);
      return {...parseStoryDraft(retry,keep),mode:'ollama',model:status.model};
    }
  } catch (error) {
    throw error instanceof Error?error:new Error('Local story generation failed.');
  }
}

export type { StoryAge, StoryTone };
