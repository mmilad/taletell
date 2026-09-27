import { useState } from 'react';
import type { Project } from '../domain';
import { generateCharacter, generateObject, missingKeyExamples } from '../generate';
import type { AssetKind } from '../types';
import { Entity, ModuleCard, ModuleForm } from './ModuleCard';

export function CharactersTab({project,patch,generateAsset,generateKeyExamples,generating}:{project:Project;patch:(p:Partial<Project>)=>void;generateAsset:(kind:AssetKind,id:string)=>void;generateKeyExamples:()=>void;generating:Record<string,boolean>}){
  const [prompt,setPrompt]=useState('');
  const [objectPrompt,setObjectPrompt]=useState('');
  const add=()=>{if(!prompt.trim()) return;patch({characters:[...project.characters,generateCharacter(prompt)]});setPrompt('')};
  const addObject=()=>{if(!objectPrompt.trim()) return;patch({objects:[...project.objects,generateObject(objectPrompt)]});setObjectPrompt('')};
  const missing=missingKeyExamples(project.characters);
  const busy=Object.values(generating).some(Boolean);
  return <>
    <div className="page-head">
      <div><p className="eyebrow">CHARACTERS</p><h2>The cast.</h2><p>{missing.length?`Still need example sheets for ${missing.map(character=>character.name).join(', ')}.`:'Living characters here. Special objects live in the list below.'}</p></div>
      <button className="ghost" onClick={()=>patch({characters:[],locations:[],objects:[],scenes:[]})}>Clear modules</button>
    </div>
    <Entity title="Characters" count={project.characters.length} empty="No characters yet. Generate a story or add a living being here."
      action={<ModuleForm placeholder="a shy rabbit named Pip with a blue scarf" value={prompt} onChange={setPrompt} onSubmit={add} label="Add character"/>}>
      {project.characters.map(character=><ModuleCard key={character.id} eyebrow={`${character.key?'Key · ':''}${character.role}`} name={character.name} description={character.description} appearance={character.appearance} traits={character.traits} imageStatus={character.imageStatus} imageVariants={character.imageVariants} selectedImage={character.selectedImage} generating={Boolean(generating[character.id])} generateLabel="Generate example" regenerateLabel="Regenerate example"
        onName={name=>patch({characters:project.characters.map(item=>item.id===character.id?{...item,name}:item)})}
        onAppearance={appearance=>patch({characters:project.characters.map(item=>item.id===character.id?{...item,appearance,description:`${item.name} is ${appearance}.`}:item)})}
        onRemove={()=>patch({characters:project.characters.filter(item=>item.id!==character.id),scenes:project.scenes.map(scene=>({...scene,characterIds:scene.characterIds.filter(id=>id!==character.id)}))})}
        onGenerate={()=>generateAsset('character',character.id)}
        onSelectImage={selectedImage=>patch({characters:project.characters.map(item=>item.id===character.id?{...item,selectedImage}:item)})}
      />)}
    </Entity>
    <Entity title="Special objects" count={project.objects.length} empty="No special objects yet. Lost balls, lanterns, maps, and crystals belong here — not in the cast."
      action={<ModuleForm placeholder="a round red ball they lost in the grass" value={objectPrompt} onChange={setObjectPrompt} onSubmit={addObject} label="Add object"/>}>
      {project.objects.map(object=><ModuleCard key={object.id} eyebrow="Object" name={object.name} description={object.description} appearance={object.appearance} imageStatus={object.imageStatus} imageVariants={object.imageVariants} selectedImage={object.selectedImage} generating={Boolean(generating[object.id])} generateLabel="Generate example" regenerateLabel="Regenerate example" object
        onName={name=>patch({objects:project.objects.map(item=>item.id===object.id?{...item,name}:item)})}
        onAppearance={appearance=>patch({objects:project.objects.map(item=>item.id===object.id?{...item,appearance,description:`${item.name} is ${appearance}.`}:item)})}
        onRemove={()=>patch({objects:project.objects.filter(item=>item.id!==object.id),scenes:project.scenes.map(scene=>({...scene,objectIds:(scene.objectIds||[]).filter(id=>id!==object.id)}))})}
        onGenerate={()=>generateAsset('object',object.id)}
        onSelectImage={selectedImage=>patch({objects:project.objects.map(item=>item.id===object.id?{...item,selectedImage}:item)})}
      />)}
    </Entity>
    {missing.length>0&&<div className="continue"><span>Next: make example sheets for the key cast</span><button className="primary" disabled={busy} onClick={generateKeyExamples}>{busy?'Generating examples…':'Generate key examples →'}</button></div>}
  </>;
}
