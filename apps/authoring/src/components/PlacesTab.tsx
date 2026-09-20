import { useState } from 'react';
import type { Project } from '../domain';
import { generateLocation } from '../generate';
import type { AssetKind } from '../types';
import { Entity, ModuleCard, ModuleForm } from './ModuleCard';

export function PlacesTab({project,patch,generateAsset,generating}:{project:Project;patch:(p:Partial<Project>)=>void;generateAsset:(kind:AssetKind,id:string)=>void;generating:Record<string,boolean>}){
  const [prompt,setPrompt]=useState('');
  const add=()=>{if(!prompt.trim()) return;patch({locations:[...project.locations,generateLocation(prompt)]});setPrompt('')};
  return <>
    <div className="page-head">
      <div><p className="eyebrow">PLACES</p><h2>Where it happens.</h2><p>Reusable settings, empty of the named cast. Scene pictures should reuse these views.</p></div>
    </div>
    <Entity title="Places" count={project.locations.length} empty="No places yet. Generate a story or add one here."
      action={<ModuleForm placeholder="a lantern village with a tiny stage" value={prompt} onChange={setPrompt} onSubmit={add} label="Add place"/>}>
      {project.locations.map(location=><ModuleCard key={location.id} eyebrow="Place" name={location.name} description={location.description} imageStatus={location.imageStatus} imageVariants={location.imageVariants} selectedImage={location.selectedImage} generating={Boolean(generating[location.id])} generateLabel="Generate view" regenerateLabel="Regenerate view" place
        onName={name=>patch({locations:project.locations.map(item=>item.id===location.id?{...item,name}:item)})}
        onDescription={description=>patch({locations:project.locations.map(item=>item.id===location.id?{...item,description}:item)})}
        onRemove={()=>patch({locations:project.locations.filter(item=>item.id!==location.id),scenes:project.scenes.map(scene=>scene.locationId===location.id?{...scene,locationId:undefined}:scene)})}
        onGenerate={()=>generateAsset('location',location.id)}
        onSelectImage={selectedImage=>patch({locations:project.locations.map(item=>item.id===location.id?{...item,selectedImage}:item)})}
      />)}
    </Entity>
  </>;
}
