import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { projectApi } from './api/client';
import { publicAssetRef, summarizeStory, type StorySummary } from './api/store';
import { CharactersTab } from './components/CharactersTab';
import { Library } from './components/Library';
import { PlacesTab } from './components/PlacesTab';
import { ScenesTab } from './components/ScenesTab';
import { StoryTab } from './components/StoryTab';
import { Workspace } from './components/Workspace';
import { analyzeStory, createId, normalizeProject, type Project, type Scene } from './domain';
import { characterVisualPrompt, keyCharacters, locationVisualPrompt, missingKeyExamples, sceneReferenceCast, sceneVisualPrompt, type StoryAge, type StoryTone } from './generate';
import { generateImages, getImageStatus, type ImageStatus } from './image-bridge';
import { generateStoryDraft, getStoryStatus, type StoryStatus } from './story-bridge';
import type { AssetKind, Tab } from './types';

const CURRENT_KEY='storyteller.currentProjectId';
const LEGACY_KEY='storyteller.project.v1';
const exampleStory={title:'Milo and the Moonlit Forest',sourceText:'Milo, a curious little fox, lived beside the moonlit forest. One evening, Milo met Nora, a girl in a yellow raincoat, at the edge of the woods. Together they followed a trail of silver leaves to a quiet pond. A gentle bear named Bram was waiting there with a lantern. The three friends shared stories until the first birds began to sing.'};
const uid=createId;

function workspaceTabs(project:Project){
  const tabs:Array<{id:Tab;count?:number}> = [{id:'story'}];
  if (project.characters.length) tabs.push({id:'characters',count:project.characters.length});
  if (project.locations.length) tabs.push({id:'places',count:project.locations.length});
  if (project.scenes.length) tabs.push({id:'scenes',count:project.scenes.length});
  return tabs;
}

export function App(){
  const [project,setProject]=useState<Project>();
  const [stories,setStories]=useState<StorySummary[]>([]);
  const [tab,setTab]=useState<Tab>('story');
  const [saved,setSaved]=useState(true);
  const [formKey,setFormKey]=useState(0);
  const [generating,setGenerating]=useState<Record<string,boolean>>({});
  const abortors=useRef<Record<string,AbortController>>({});
  const projectRef=useRef<Project|undefined>(undefined);
  const skipSave=useRef(true);
  const [imageStatus,setImageStatus]=useState<ImageStatus>({ok:false,mode:'mock',ready:false,detail:'Checking image worker…'});
  const [storyStatus,setStoryStatus]=useState<StoryStatus>({ok:false,mode:'template',ready:false,detail:'Checking story writer…'});
  const [writing,setWriting]=useState(false);
  const [analyzing,setAnalyzing]=useState(false);
  const writeAbort=useRef<AbortController|undefined>(undefined);
  projectRef.current=project;
  const remember=(next:Project,list?:StorySummary[])=>{
    skipSave.current=true;
    localStorage.setItem(CURRENT_KEY,next.id);
    setProject(next);
    setStories(current=>list??[summarizeStory(next),...current.filter(item=>item.id!==next.id)]);
    setSaved(true);
  };
  useEffect(()=>{
    let cancelled=false;
    (async()=>{
      try {
        let list=await projectApi.list();
        if (!list.length) {
          const legacy=localStorage.getItem(LEGACY_KEY);
          if (legacy) {
            try {
              await projectApi.save(normalizeProject(JSON.parse(legacy) as Project));
              localStorage.removeItem(LEGACY_KEY);
              list=await projectApi.list();
            } catch { /* keep going if the leftover browser draft is invalid */ }
          }
        }
        if (!list.length) {
          const created=await projectApi.create();
          if (!cancelled) remember(created,[summarizeStory(created)]);
          return;
        }
        const preferred=localStorage.getItem(CURRENT_KEY);
        const chosen=list.find(item=>item.id===preferred)||list[0];
        const loaded=await projectApi.get(chosen.id);
        if (!cancelled) remember(loaded,list);
      } catch (error) {
        if (!cancelled) window.alert(error instanceof Error?error.message:'Could not open the project library.');
      }
    })();
    return ()=>{cancelled=true};
  },[]);
  useEffect(()=>{
    if (!project) return;
    if (skipSave.current) { skipSave.current=false; return; }
    setSaved(false);
    const timer=setTimeout(async()=>{
      try {
        const persisted=await projectApi.save(project);
        setStories(current=>current.map(item=>item.id===persisted.id?summarizeStory(persisted):item));
        setSaved(true);
      } catch (error) {
        window.alert(error instanceof Error?error.message:'Could not save the story.');
      }
    },450);
    return ()=>clearTimeout(timer);
  },[project]);
  useEffect(()=>{getImageStatus().then(setImageStatus).catch(error=>setImageStatus({ok:false,mode:'mock',ready:false,detail:error instanceof Error?error.message:'Image worker is not available.'}))},[]);
  useEffect(()=>{getStoryStatus().then(setStoryStatus).catch(error=>setStoryStatus({ok:false,mode:'template',ready:false,detail:error instanceof Error?error.message:'Story writer is not available.'}))},[]);
  useEffect(()=>{
    const flush=()=>{
      const current=projectRef.current;
      if (!current) return;
      void fetch(`/api/projects/${encodeURIComponent(current.id)}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(current),keepalive:true});
    };
    window.addEventListener('beforeunload',flush);
    const onVisibility=()=>{if (document.visibilityState==='hidden') flush();};
    document.addEventListener('visibilitychange',onVisibility);
    return ()=>{
      window.removeEventListener('beforeunload',flush);
      document.removeEventListener('visibilitychange',onVisibility);
    };
  },[]);
  useEffect(()=>{
    if (!project) return;
    const allowed=new Set(workspaceTabs(project).map(item=>item.id));
    if (!allowed.has(tab)) setTab('story');
  },[project,tab]);
  const persistCurrent=async()=>{
    if (!projectRef.current) return;
    try { await projectApi.save(projectRef.current); } catch { /* keep the in-memory draft if the API is briefly down */ }
  };
  const newStory=async()=>{
    await persistCurrent();
    remember(await projectApi.create());
    setFormKey(key=>key+1);
    setTab('story');
  };
  const openStory=async(id:string)=>{
    if (project?.id===id) { setTab('story'); return; }
    await persistCurrent();
    remember(await projectApi.get(id));
    setFormKey(key=>key+1);
    setTab('story');
  };
  const deleteStory=async()=>{
    if (!project||stories.length<2||!window.confirm('Delete this story from the library?')) return;
    await projectApi.remove(project.id);
    const remaining=stories.filter(item=>item.id!==project.id);
    remember(await projectApi.get(remaining[0].id),remaining);
    setFormKey(key=>key+1);
    setTab('story');
  };
  const patch=(p:Partial<Project>)=>{
    setSaved(false);
    setProject(current=>{
      if (!current) return current;
      const next=normalizeProject({...current,...p,updatedAt:new Date().toISOString()});
      projectRef.current=next;
      return next;
    });
  };
  const replaceDrafts=()=>{
    if (!project) return false;
    const hasDrafts=project.characters.length>0||project.locations.length>0||project.scenes.length>0;
    return !hasDrafts||window.confirm('Replace the current story modules? Edited characters, places, and scenes will be overwritten.');
  };
  const runAnalysis=async()=>{
    if(!project?.sourceText.trim()||analyzing||writing||!replaceDrafts()) return;
    setAnalyzing(true);
    await new Promise(resolve=>window.setTimeout(resolve,0));
    try {
      const draft=analyzeStory((projectRef.current||project).sourceText);
      patch(draft);
      setTab(draft.scenes.length?'scenes':draft.characters.length?'characters':'story');
    } finally {
      setAnalyzing(false);
    }
  };
  const runStoryGeneration=async(brief:{premise:string;tone:StoryTone;age:StoryAge;reuseCast:boolean;pageCount?:number;paragraphsMin?:number;paragraphsMax?:number;paragraphWordsMin?:number;paragraphWordsMax?:number})=>{
    if(!project||!brief.premise.trim()) return;
    if(writing){
      writeAbort.current?.abort();
      return;
    }
    const latest=projectRef.current||project;
    const keepCast=brief.reuseCast&&(latest.characters.length>0||latest.locations.length>0);
    if(!keepCast&&!replaceDrafts()) return;
    const controller=new AbortController();
    writeAbort.current=controller;
    setWriting(true);
    try {
      const generated=await generateStoryDraft({
        premise:brief.premise,
        tone:brief.tone,
        age:brief.age,
        pageCount:brief.pageCount,
        paragraphsMin:brief.paragraphsMin,
        paragraphsMax:brief.paragraphsMax,
        paragraphWordsMin:brief.paragraphWordsMin,
        paragraphWordsMax:brief.paragraphWordsMax,
        characters:keepCast?latest.characters:undefined,
        locations:keepCast?latest.locations:undefined
      },controller.signal);
      if(controller.signal.aborted) return;
      patch(generated);
      setTab('story');
    } catch(error) {
      if(error instanceof DOMException&&error.name==='AbortError') return;
      window.alert(error instanceof Error?error.message:'Could not write the story.');
    } finally {
      if(writeAbort.current===controller){
        writeAbort.current=undefined;
        setWriting(false);
      }
    }
  };
  const generateAsset=async(kind:AssetKind,id:string)=>{
    const latest=projectRef.current;
    if(!latest) return;
    if(generating[id]) {
      abortors.current[id]?.abort();
      delete abortors.current[id];
      setGenerating(x=>({...x,[id]:false}));
      return;
    }
    const character=kind==='character'?latest.characters.find(item=>item.id===id):undefined;
    const location=kind==='location'?latest.locations.find(item=>item.id===id):undefined;
    const scene=kind==='scene'?latest.scenes.find(item=>item.id===id):undefined;
    const subject=character||location||scene;
    if(!subject) return;
    if(kind==='scene'){
      const needed=keyCharacters(latest.characters).filter(item=>scene?.characterIds.includes(item.id));
      const missing=missingKeyExamples(needed);
      if(missing.length){
        window.alert(`Generate example sheets first: ${missing.map(item=>item.name).join(', ')}. Scenes should be derived from those.`);
        return;
      }
    }
    const controller=new AbortController();
    abortors.current[id]=controller;
    setGenerating(x=>({...x,[id]:true}));
    try {
      const prompt=character?characterVisualPrompt(character):location?locationVisualPrompt(location):sceneVisualPrompt(scene as Scene,latest);
      const references=kind==='scene'?sceneReferenceCast(scene as Scene,latest.characters).flatMap(item=>{
        const filePath=item.imageFile||(item.selectedImage&&!item.selectedImage.startsWith('data:')?item.selectedImage:undefined);
        return filePath?[{assetId:item.id,filePath,url:item.selectedImage,role:'identity' as const}]:[];
      }):undefined;
      const result=await generateImages({mode:kind==='scene'?'composition':'asset',subject:kind,prompt,variants:1,width:768,height:768,assetId:id,references},controller.signal);
      const returned=result.images.map(image=>publicAssetRef(image.url||image.dataUrl||image.filePath)).filter((value):value is string=>Boolean(value));
      if (!returned.length) throw new Error(result.mode==='mock'?'The image worker is still in mock mode. Install the Flux worker venv, then restart npm run dev.':'Flux finished without saving a PNG.');
      const nextImage={imageStatus:'generated' as const,imageVariants:returned,selectedImage:returned[0],imageFile:publicAssetRef(result.images[0]?.filePath)||returned[0]};
      const current=projectRef.current||latest;
      const next=normalizeProject({
        ...current,
        updatedAt:new Date().toISOString(),
        characters:kind==='character'?current.characters.map(item=>item.id===id?{...item,...nextImage}:item):current.characters,
        locations:kind==='location'?current.locations.map(item=>item.id===id?{...item,...nextImage}:item):current.locations,
        scenes:kind==='scene'?current.scenes.map(item=>item.id===id?{...item,...nextImage}:item):current.scenes
      });
      skipSave.current=true;
      projectRef.current=next;
      setProject(next);
      const persisted=await projectApi.save(next);
      setStories(stories=>stories.map(item=>item.id===persisted.id?summarizeStory(persisted):item));
      setSaved(true);
    } catch (error) {
      if (controller.signal.aborted||(error instanceof DOMException&&error.name==='AbortError')) return;
      window.alert(error instanceof Error?error.message:'Image generation failed');
    } finally {
      delete abortors.current[id];
      setGenerating(x=>({...x,[id]:false}));
    }
  };
  const generateKeyExamples=async()=>{
    const latest=projectRef.current;
    if(!latest) return;
    for (const character of missingKeyExamples(latest.characters)) {
      await generateAsset('character',character.id);
    }
  };
  const exportProject=()=>{
    if(!project) return;
    const blob=new Blob([JSON.stringify(project,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const link=document.createElement('a');
    link.href=url;
    link.download=`${project.title.toLowerCase().replace(/[^a-z0-9]+/g,'-')||'story'}.story.json`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const importProject=(event:ChangeEvent<HTMLInputElement>)=>{
    const file=event.target.files?.[0];
    if(!file) return;
    const reader=new FileReader();
    reader.onload=()=>{
      void (async()=>{
        try {
          const incoming=JSON.parse(String(reader.result)) as Project;
          if(!incoming.title||!Array.isArray(incoming.scenes)) throw new Error('Invalid project');
          await persistCurrent();
          remember(await projectApi.save(normalizeProject({...incoming,id:incoming.id||uid(),updatedAt:new Date().toISOString()})));
          setFormKey(key=>key+1);
          setTab('story');
        } catch { window.alert('That file is not a valid Storyteller project.'); }
      })();
    };
    reader.readAsText(file);
    event.target.value='';
  };
  if (!project) return <div className="app"><header><div className="brand"><span className="mark">✦</span><div><strong>Storyteller</strong><small>authoring studio</small></div></div><div className="save">Opening library…</div></header><main><section className="content"><p className="lede">Opening the story library…</p></section></main></div>;
  const tabs=workspaceTabs(project);
  return <div className="app">
    <header>
      <div className="brand"><span className="mark">✦</span><div><strong>Storyteller</strong><small>authoring studio</small></div></div>
      <div className="save">{analyzing?'Analyzing…':saved?'Saved':'Saving…'}</div>
      <span className={storyStatus.ready?'pill ready':'pill'}>{storyStatus.ready?`Ollama · ${(storyStatus.model||'local').replace(/:latest$/,'')}`:writing?'Writing…':'Template stories'}</span>
      <span className={imageStatus.ready?'pill ready':'pill'}>{imageStatus.ready?`Flux · ${imageStatus.gpu||imageStatus.device||'ready'}`:imageStatus.mode==='real'?'Flux starting…':'Mock images'}</span>
      <button className="primary" onClick={()=>{void newStory()}}>New story</button>
    </header>
    <main>
      <Library stories={stories} selectedId={project.id} onNew={()=>{void newStory()}} onOpen={id=>{void openStory(id)}} onExport={exportProject} onImport={importProject} onDelete={()=>{void deleteStory()}}/>
      <Workspace title={project.title} tab={tab} tabs={tabs} onTab={setTab}>
        {tab==='story'&&<StoryTab key={formKey} project={project} patch={patch} analyze={()=>{void runAnalysis()}} generate={runStoryGeneration} writing={writing} analyzing={analyzing} storyStatus={storyStatus} loadExample={()=>{patch({...exampleStory,characters:[],locations:[],scenes:[]});setTab('story')}}/>}
        {tab==='characters'&&<CharactersTab project={project} patch={patch} generateAsset={generateAsset} generateKeyExamples={generateKeyExamples} generating={generating}/>}
        {tab==='places'&&<PlacesTab project={project} patch={patch} generateAsset={generateAsset} generating={generating}/>}
        {tab==='scenes'&&<ScenesTab project={project} patch={patch} generateAsset={generateAsset} generateKeyExamples={generateKeyExamples} generating={generating} imageStatus={imageStatus}/>}
      </Workspace>
    </main>
  </div>;
}
