import { useState } from 'react';
import type { Project } from '../domain';
import type { StoryAge, StoryTone } from '../generate';
import type { StoryStatus } from '../story-bridge';
import { DEFAULT_STORY_SHAPE, type StoryShapeInput } from '../story-shape';

export type StoryGenerateBrief = StoryShapeInput & {premise:string;tone:StoryTone;age:StoryAge;reuseCast:boolean};

function NumberField({label,value,min,max,onChange}:{label:string;value:number;min:number;max:number;onChange:(value:number)=>void}){
  return <label className="shape-field">{label}<input type="number" min={min} max={max} value={value} onChange={e=>onChange(Number(e.target.value))}/></label>;
}

function GenerateForm({premise,setPremise,tone,setTone,age,setAge,shape,setShape,reuseCast,setReuseCast,hasModules,writing,writer,onGenerate}:{
  premise:string;setPremise:(value:string)=>void;
  tone:StoryTone;setTone:(value:StoryTone)=>void;
  age:StoryAge;setAge:(value:StoryAge)=>void;
  shape:Required<StoryShapeInput>;setShape:(patch:Partial<StoryShapeInput>)=>void;
  reuseCast:boolean;setReuseCast:(value:boolean)=>void;
  hasModules:boolean;writing:boolean;writer:string;onGenerate:()=>void;
}){
  return <>
    <label>STORY PREMISE</label>
    <textarea value={premise} onChange={e=>setPremise(e.target.value)} placeholder="A shy rabbit who wants to sing at the village fair…"/>
    <div className="choice-row">
      <div><span className="choice-label">TONE</span><div className="chips">{(['gentle','adventurous','funny'] as StoryTone[]).map(value=><button key={value} className={tone===value?'chip active':'chip'} onClick={()=>setTone(value)}>{value}</button>)}</div></div>
      <div><span className="choice-label">AGES</span><div className="chips">{(['3-5','5-7','7-9'] as StoryAge[]).map(value=><button key={value} className={age===value?'chip active':'chip'} onClick={()=>setAge(value)}>{value}</button>)}</div></div>
    </div>
    <div className="shape-row">
      <div>
        <span className="choice-label">PAGES</span>
        <NumberField label="Scenes" value={shape.pageCount} min={2} max={16} onChange={pageCount=>setShape({pageCount})}/>
      </div>
      <div>
        <span className="choice-label">PARAGRAPHS PER PAGE</span>
        <div className="shape-pair">
          <NumberField label="Min" value={shape.paragraphsMin} min={1} max={6} onChange={paragraphsMin=>setShape({paragraphsMin})}/>
          <NumberField label="Max" value={shape.paragraphsMax} min={1} max={6} onChange={paragraphsMax=>setShape({paragraphsMax})}/>
        </div>
      </div>
      <div>
        <span className="choice-label">WORDS PER PARAGRAPH</span>
        <div className="shape-pair">
          <NumberField label="Min" value={shape.paragraphWordsMin} min={6} max={80} onChange={paragraphWordsMin=>setShape({paragraphWordsMin})}/>
          <NumberField label="Max" value={shape.paragraphWordsMax} min={6} max={80} onChange={paragraphWordsMax=>setShape({paragraphWordsMax})}/>
        </div>
      </div>
    </div>
    {hasModules&&<label className="reuse"><input type="checkbox" checked={reuseCast} onChange={e=>setReuseCast(e.target.checked)}/> Write the new story with the current character and place modules</label>}
    <div className="card-footer">
      <span>{writing?'Writing the story…':`${premise.trim().split(/\s+/).filter(Boolean).length} words · ${writer}`}</span>
      <button className="primary" disabled={!writing&&!premise.trim()} onClick={onGenerate}>{writing?'Cancel':<>Generate story <span>→</span></>}</button>
    </div>
  </>;
}

function AnalyzeActions({words,analyzing,disabled,onAnalyze,onExample}:{words:number;analyzing:boolean;disabled:boolean;onAnalyze:()=>void;onExample:()=>void}){
  return <div className="card-footer">
    <span>{analyzing?'Reading the story into characters, places, and scenes…':`${words} words`}</span>
    <div className="story-actions">
      <button className="ghost" disabled={analyzing} onClick={onExample}>Load example</button>
      <button className="primary" disabled={disabled||analyzing} onClick={onAnalyze}>{analyzing?'Analyzing…':<>Analyze story <span>→</span></>}</button>
    </div>
  </div>;
}

export function StoryTab({project,patch,analyze,generate,writing,analyzing,storyStatus,loadExample}:{project:Project;patch:(p:Partial<Project>)=>void;analyze:()=>void;generate:(brief:StoryGenerateBrief)=>void;writing:boolean;analyzing:boolean;storyStatus:StoryStatus;loadExample:()=>void}){
  const [premise,setPremise]=useState(project.sourceText?`A story like: ${project.title}`:'');
  const [tone,setTone]=useState<StoryTone>('gentle');
  const [age,setAge]=useState<StoryAge>('5-7');
  const [reuseCast,setReuseCast]=useState(false);
  const [shape,setShapeState]=useState<Required<StoryShapeInput>>({
    pageCount:DEFAULT_STORY_SHAPE.pageCount,
    paragraphsMin:DEFAULT_STORY_SHAPE.paragraphCount.min,
    paragraphsMax:DEFAULT_STORY_SHAPE.paragraphCount.max,
    paragraphWordsMin:DEFAULT_STORY_SHAPE.paragraphWords.min,
    paragraphWordsMax:DEFAULT_STORY_SHAPE.paragraphWords.max
  });
  const setShape=(patch:Partial<StoryShapeInput>)=>setShapeState(current=>({...current,...patch}));
  const hasModules=project.characters.length>0||project.locations.length>0;
  const hasStory=Boolean(project.sourceText.trim()||project.characters.length||project.locations.length||project.scenes.length);
  const writer=storyStatus.ready?`Ollama · ${(storyStatus.model||'local').replace(/:latest$/,'')}`:'Template writer';
  const form={premise,setPremise,tone,setTone,age,setAge,shape,setShape,reuseCast,setReuseCast,hasModules,writing,writer,onGenerate:()=>generate({premise,tone,age,reuseCast,...shape})};

  if (!hasStory) {
    return <>
      <div className="hero"><p className="eyebrow">A NEW STORY</p><h1>Generate a story from<br/><em>modular pieces.</em></h1><p className="lede">Start with a premise, or paste words you already have. Storyteller builds reusable characters, places, and scenes you can keep editing.</p></div>
      <div className="card input-card"><GenerateForm {...form}/></div>
      <div className="card input-card"><label>STORY TITLE</label><input value={project.title} onChange={e=>patch({title:e.target.value})} placeholder="The title of your story"/><label>ORIGINAL STORY TEXT</label><textarea value={project.sourceText} onChange={e=>patch({sourceText:e.target.value})} placeholder="Paste a children's story here…"/><AnalyzeActions words={project.sourceText.trim().split(/\s+/).filter(Boolean).length} analyzing={analyzing} disabled={!project.sourceText.trim()} onAnalyze={analyze} onExample={loadExample}/></div>
      <div className="tip"><span>✦</span><p><strong>How it works</strong><br/>{storyStatus.ready?'A local Ollama model writes the story into editable character, place, and scene modules.':'Start Ollama to write with a local model; until then, Generate story uses the template writer.'} Nothing is locked until you keep it.</p></div>
    </>;
  }

  return <>
    <div className="card input-card wide">
      <p className="lede write-note">A new premise replaces characters, places, and scenes unless you reuse the current modules.</p>
      <GenerateForm {...form}/>
    </div>
    <div className="card input-card wide">
      <label>TITLE</label>
      <input className="manuscript-title" value={project.title} onChange={e=>patch({title:e.target.value})} placeholder="The title of your story"/>
      <label>STORY FROM PREMISE</label>
      <textarea className="manuscript" value={project.sourceText} onChange={e=>patch({sourceText:e.target.value})} placeholder="The words of the story…"/>
      <AnalyzeActions words={project.sourceText.trim().split(/\s+/).filter(Boolean).length} analyzing={analyzing} disabled={!project.sourceText.trim()} onAnalyze={analyze} onExample={loadExample}/>
    </div>
  </>;
}
