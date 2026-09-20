import { useState } from 'react';
import type { Project } from '../domain';
import { generateScene, missingKeyExamples } from '../generate';
import type { ImageStatus } from '../image-bridge';
import type { AssetKind } from '../types';
import { VariantGrid } from './ModuleCard';

export function ScenesTab({project,patch,generateAsset,generateKeyExamples,generating,imageStatus}:{project:Project;patch:(p:Partial<Project>)=>void;generateAsset:(kind:AssetKind,id:string)=>void;generateKeyExamples:()=>void;generating:Record<string,boolean>;imageStatus:ImageStatus}){
  const [beat,setBeat]=useState('');
  const [picked,setPicked]=useState<string[]>(project.characters.slice(0,2).map(character=>character.id));
  const [placeId,setPlaceId]=useState(project.locations[0]?.id||'');
  const missing=missingKeyExamples(project.characters);
  const busy=Object.values(generating).some(Boolean);
  const compose=()=>{
    if(!beat.trim()) return;
    const characters=project.characters.filter(character=>picked.includes(character.id));
    const location=project.locations.find(location=>location.id===placeId);
    patch({scenes:[...project.scenes,generateScene({beat,order:project.scenes.length,characters,location})]});
    setBeat('');
  };
  return <>
    <div className="page-head">
      <div><p className="eyebrow">SCENES</p><h2>The pages.</h2><p>{missing.length?`Generate key examples before scene pictures: ${missing.map(character=>character.name).join(', ')}.`:'Each scene can reuse the locked character examples.'} {busy?'Encoding the prompt first — Cancel unlocks the button.':''}</p></div>
      <span className="pill">{project.scenes.length} scenes</span>
    </div>
    {missing.length>0&&<div className="card input-card scene-compose"><div className="card-footer"><span>Scene pictures wait on example sheets. The pages themselves are already here.</span><button className="primary" disabled={busy} onClick={generateKeyExamples}>Generate key examples →</button></div></div>}
    <div className="card input-card scene-compose"><label>NEW SCENE BEAT</label><textarea value={beat} onChange={e=>setBeat(e.target.value)} placeholder="They find a silver lantern under the willows…"/>
      {project.characters.length>0&&<div className="module-pick"><span className="choice-label">CHARACTERS</span><div className="chips">{project.characters.map(character=><button key={character.id} className={picked.includes(character.id)?'chip active':'chip'} onClick={()=>setPicked(current=>current.includes(character.id)?current.filter(id=>id!==character.id):[...current,character.id])}>{character.name}</button>)}</div></div>}
      {project.locations.length>0&&<div className="module-pick"><span className="choice-label">PLACE</span><div className="chips">{project.locations.map(location=><button key={location.id} className={placeId===location.id?'chip active':'chip'} onClick={()=>setPlaceId(location.id)}>{location.name}</button>)}</div></div>}
      <div className="card-footer"><span>Uses the current modules</span><button className="primary" disabled={!beat.trim()} onClick={compose}>Generate scene <span>→</span></button></div>
    </div>
    {project.scenes.length===0?<div className="card empty large">Generate a story, analyze a story, or compose a scene from modules.</div>:<div className="scene-list">{project.scenes.map((scene,index)=><div className="card scene" key={scene.id}><div className="scene-num">{String(index+1).padStart(2,'0')}</div><div className="scene-main"><textarea className="scene-summary" value={scene.summary} onChange={e=>patch({scenes:project.scenes.map(item=>item.id===scene.id?{...item,summary:e.target.value}:item)})}/><p className="source">{scene.sourceText}</p><p className="module-refs">{project.characters.filter(character=>scene.characterIds.includes(character.id)).map(character=>character.name).join(' · ')||'No characters'}{scene.locationId?` · ${project.locations.find(location=>location.id===scene.locationId)?.name||'Place'}`:''}</p><label>VISUAL DESCRIPTION</label><textarea value={scene.visualDescription} onChange={e=>patch({scenes:project.scenes.map(item=>item.id===scene.id?{...item,visualDescription:e.target.value}:item)})}/>
      <VariantGrid variants={scene.imageVariants} selected={scene.selectedImage} onSelect={selectedImage=>patch({scenes:project.scenes.map(item=>item.id===scene.id?{...item,selectedImage}:item)})}/>
      <div className="scene-actions">{generating[scene.id]?<button className="ghost" onClick={()=>generateAsset('scene',scene.id)}>Cancel</button>:scene.imageStatus==='generated'?<button className="ghost" onClick={()=>generateAsset('scene',scene.id)}>Regenerate variants</button>:<button className="primary" onClick={()=>generateAsset('scene',scene.id)}>{imageStatus.ready?'Generate Flux images':'Generate images'}</button>}<button className="ghost" onClick={()=>patch({scenes:project.scenes.filter(item=>item.id!==scene.id)})}>Remove</button></div></div></div>)}</div>}
  </>;
}
