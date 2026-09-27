import type { ReactNode } from 'react';
import type { Scene } from '../domain';
import { displayImageSrc } from '../image-bridge';

export function Entity({title,count,empty,action,children}:{title:string;count:number;empty:string;action?:ReactNode;children:ReactNode}){
  return <div className="card entity-card"><div className="section-title"><h3>{title}</h3><span>{count}</span></div>{action}{count?children:<div className="empty">{empty}</div>}</div>;
}

export function ModuleForm({placeholder,value,onChange,onSubmit,label}:{placeholder:string;value:string;onChange:(value:string)=>void;onSubmit:()=>void;label:string}){
  return <div className="module-form"><input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} onKeyDown={e=>{if(e.key==='Enter')onSubmit()}}/><button className="ghost" disabled={!value.trim()} onClick={onSubmit}>{label}</button></div>;
}

export function ModuleCard({eyebrow,name,description,appearance,traits,imageStatus,imageVariants,selectedImage,generating,generateLabel='Generate portrait',regenerateLabel='Regenerate portrait',place,object:isObject,onName,onDescription,onAppearance,onRemove,onGenerate,onSelectImage}:{eyebrow:string;name:string;description:string;appearance?:string;traits?:string[];imageStatus:Scene['imageStatus'];imageVariants?:string[];selectedImage?:string;generating:boolean;generateLabel?:string;regenerateLabel?:string;place?:boolean;object?:boolean;onName:(value:string)=>void;onDescription?:(value:string)=>void;onAppearance?:(value:string)=>void;onRemove:()=>void;onGenerate:()=>void;onSelectImage:(value:string)=>void}){
  return <div className="entity"><div className={place?'avatar place':isObject?'avatar object':'avatar'}>{name[0]||'•'}</div><div className="entity-body"><input value={name} onChange={e=>onName(e.target.value)}/><small>{eyebrow}{traits?.length?` · ${traits.join(', ')}`:''}</small>{onAppearance?<><span className="field-label">Visual identity</span><textarea className="appearance" value={appearance||''} onChange={e=>onAppearance(e.target.value)} placeholder="Species, colors, clothes — this is what pictures use"/></>:<textarea value={description} onChange={e=>onDescription?.(e.target.value)}/>}<VariantGrid variants={imageVariants} selected={selectedImage} onSelect={onSelectImage}/>{generating?<button className="ghost" onClick={onGenerate}>Cancel</button>:<button className="ghost" onClick={onGenerate}>{imageStatus==='generated'?regenerateLabel:generateLabel}</button>}</div><button className="remove" onClick={onRemove}>×</button></div>;
}

export function VariantGrid({variants,selected,onSelect}:{variants?:string[];selected?:string;onSelect:(value:string)=>void}){
  if(!variants?.length) return null;
  return <div className="preview-grid">{variants.map((variant,index)=><button className={variant===selected?'preview selected':'preview'} key={`${variant}-${index}`} onClick={()=>onSelect(variant)}><img src={displayImageSrc(variant)} alt={`Variant ${index+1}`}/><span>{index+1}</span></button>)}</div>;
}
