import { useState } from 'react';
import type { Project } from '../domain';
import { generateCharacter, missingKeyExamples } from '../generate';
import type { AssetKind } from '../types';
import { Entity, ModuleCard, ModuleForm } from './ModuleCard';

export function CharactersTab({project,patch,generateAsset,generateKeyExamples,generating}:{project:Project;patch:(p:Partial<Project>)=>void;generateAsset:(kind:AssetKind,id:string)=>void;generateKeyExamples:()=>void;generating:Record<string,boolean>}){
  const [prompt,setPrompt]=useState('');
  const add=()=>{if(!prompt.trim()) return;patch({characters:[...project.characters,generateCharacter(prompt)]});setPrompt('')};
  const missing=missingKeyExamples(project.characters);
  const busy=Object.values(generating).some(Boolean);
  return <>
    <div className="page-head">
      <div><p className="eyebrow">CHARACTERS</p><h2>The cast.</h2><p>{missing.length?`Still need example sheets for ${missing.map(character=>character.name).join(', ')}.`:'Key examples are ready — scenes can reuse them.'}</p></div>
      <button className="ghost" onClick={()=>patch({characters:[],locations:[],scenes:[]})}>Clear modules</button>
    </div>
    <Entity title="Characters" count={project.characters.length} empty="No characters yet. Generate a story or add one here."
      action={<ModuleForm placeholder="a shy rabbit named Pip with a blue scarf" value={prompt} onChange={setPrompt} onSubmit={add} label="Add character"/>}>
      {project.characters.map(character=><ModuleCard key={character.id} eyebrow={`${character.key?'Key · ':''}${character.role}`} name={character.name} description={character.description} appearance={character.appearance} traits={character.traits} imageStatus={character.imageStatus} imageVariants={character.imageVariants} selectedImage={character.selectedImage} generating={Boolean(generating[character.id])} generateLabel="Generate example" regenerateLabel="Regenerate example"
        onName={name=>patch({characters:project.characters.map(item=>item.id===character.id?{...item,name}:item)})}
        onDescription={description=>patch({characters:project.characters.map(item=>item.id===character.id?{...item,description}:item)})}
        onAppearance={appearance=>patch({characters:project.characters.map(item=>item.id===character.id?{...item,appearance}:item)})}
        onRemove={()=>patch({characters:project.characters.filter(item=>item.id!==character.id),scenes:project.scenes.map(scene=>({...scene,characterIds:scene.characterIds.filter(id=>id!==character.id)}))})}
        onGenerate={()=>generateAsset('character',character.id)}
        onSelectImage={selectedImage=>patch({characters:project.characters.map(item=>item.id===character.id?{...item,selectedImage}:item)})}
      />)}
    </Entity>
    {missing.length>0&&<div className="continue"><span>Next: make example sheets for the key cast</span><button className="primary" disabled={busy} onClick={generateKeyExamples}>{busy?'Generating examples…':'Generate key examples →'}</button></div>}
  </>;
}
