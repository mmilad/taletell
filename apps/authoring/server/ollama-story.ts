import { generateStory, type StoryAge, type StoryBrief, type StoryTone } from '../src/generate.ts';
import { parseStoryDraft } from '../src/story-draft.ts';
import type { Project } from '../src/domain.ts';
import { describeStoryShape, normalizeStoryShape, shapeSceneProse, type StoryShape } from '../src/story-shape.ts';

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

function systemPrompt(shape:StoryShape) {
  return `You write original children's picture-book stories. Reply with JSON only.

JSON shape:
{
  "title": "string",
  "sourceText": "the complete story, pages joined with blank lines",
  "characters": [{"name":"Pip","role":"hero","key":true,"description":"who they are","appearance":"one visual identity sentence: species, colors, clothes, face","traits":["curious","kind"]}],
  "locations": [{"name":"Moonlit Forest","description":"visual setting, empty of named characters"}],
  "scenes": [{"summary":"page title","sourceText":"the words on this page","visualDescription":"what the illustration shows","characterNames":["Pip"],"locationName":"Moonlit Forest"}]
}

Hard rules:
- The premise is the plot contract. Every event it names must happen in the pages, in order.
- Do not replace it with a village fair, school, or lantern-wish plot unless they asked for that.
- 2 to 5 characters with distinct names, species, and clothes. Include the people and creatures the premise needs. Never reuse a name.
- Use the places the premise needs (usually 3 or 4).
- ${describeStoryShape(shape)}
- Every scenes[].characterNames value must match a characters[].name exactly. Do not invent extras in scenes.
- Warm, concrete language for the stated age. No lecture, no real danger.
- appearance is an identity lock for later image generation.`;
}

function userPrompt(brief:StoryBrief,shape:StoryShape) {
  const tone=brief.tone||'gentle';
  const age=brief.age||'5-7';
  const lines=[
    `Premise (follow this plot exactly): ${brief.premise.trim()}`,
    `Tone: ${tone}`,
    `Age band: ${age}`,
    describeStoryShape(shape),
    'Do not repeat padding lines. After they succeed, go home and end.'
  ];
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

function shapedDraft(raw:unknown,keep:{characters?:Project['characters'];locations?:Project['locations']}|undefined,shape:StoryShape) {
  const story=parseStoryDraft(raw,keep,shape.pageCount);
  const scenes=story.scenes.map(scene=>({
    ...scene,
    sourceText:shapeSceneProse(scene.sourceText,shape)
  }));
  return {...story,scenes,sourceText:scenes.map(scene=>scene.sourceText).join('\n\n')};
}

async function chatStory(model:string,brief:StoryBrief,shape:StoryShape,repair?:string) {
  const messages=[{role:'system',content:systemPrompt(shape)},{role:'user',content:userPrompt(brief,shape)}];
  if (repair) messages.push({role:'user',content:repair});
  const payload=await ollamaJson<OllamaChat>('/api/chat',{
    method:'POST',
    body:JSON.stringify({
      model,
      stream:false,
      format:'json',
      think:false,
      messages,
      options:{temperature:0.7,num_predict:Math.min(8192,2400+shape.pageCount*280)}
    }),
    signal:AbortSignal.timeout(180_000)
  });
  if (payload.error) throw new Error(payload.error);
  return payload.message?.content;
}

export async function generateLocalStory(brief:StoryBrief):Promise<GeneratedStory> {
  const premise=brief.premise.trim();
  if (!premise) throw new Error('A premise is required to generate a story.');
  const shape=normalizeStoryShape(brief);
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
  const pageRepair=`Return only the JSON object. Write exactly ${shape.pageCount} scenes that complete the premise, with the last scene a finished ending at home. Follow the paragraph rules. No padding refrains.`;
  try {
    const first=await chatStory(status.model,brief,shape);
    try {
      const story=shapedDraft(first,keep,shape);
      if (story.scenes.length!==shape.pageCount) {
        const retry=await chatStory(status.model,brief,shape,`Your previous reply had ${story.scenes.length} scenes. ${pageRepair}`);
        return {...shapedDraft(retry,keep,shape),mode:'ollama',model:status.model};
      }
      return {...story,mode:'ollama',model:status.model};
    } catch (error) {
      const reason=error instanceof Error?error.message:'The story JSON could not be read.';
      const retry=await chatStory(status.model,brief,shape,`Your previous reply was not usable (${reason}). ${pageRepair}`);
      return {...shapedDraft(retry,keep,shape),mode:'ollama',model:status.model};
    }
  } catch (error) {
    throw error instanceof Error?error:new Error('Local story generation failed.');
  }
}

export type { StoryAge, StoryTone };
