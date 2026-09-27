import type { Project } from './domain';
import type { StoryAge, StoryBrief, StoryTone } from './generate';

export type StoryStatus = {
  ok:boolean;
  mode:'ollama'|'template';
  ready:boolean;
  model?:string;
  detail?:string;
  error?:string;
};

export type GeneratedStory = Pick<Project,'title'|'sourceText'|'characters'|'locations'|'objects'|'scenes'> & {
  mode:'ollama'|'template';
  model?:string;
};

export async function getStoryStatus():Promise<StoryStatus> {
  try {
    const response=await fetch('/api/story-status');
    if (!response.ok) throw new Error('Story writer is not available in this session.');
    return await response.json() as StoryStatus;
  } catch (error) {
    return {ok:false,mode:'template',ready:false,detail:error instanceof Error?error.message:'Story writer is not available.'};
  }
}

export async function generateStoryDraft(brief:StoryBrief,signal?:AbortSignal):Promise<GeneratedStory> {
  const response=await fetch('/api/generate-story',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(brief),signal});
  const payload=await response.json() as GeneratedStory & {error?:string};
  if (!response.ok) throw new Error(payload.error||'Story generation failed');
  return payload;
}

export async function analyzeStoryDraft(sourceText:string,signal?:AbortSignal):Promise<GeneratedStory> {
  const response=await fetch('/api/analyze-story',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sourceText}),signal});
  const payload=await response.json() as GeneratedStory & {error?:string};
  if (!response.ok) throw new Error(payload.error||'Story analysis failed');
  return payload;
}

export type { StoryAge, StoryTone };
