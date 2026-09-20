import type { ChangeEvent } from 'react';
import type { StorySummary } from '../api/store';

export function Library({stories,selectedId,onNew,onOpen,onExport,onImport,onDelete}:{stories:StorySummary[];selectedId:string;onNew:()=>void;onOpen:(id:string)=>void;onExport:()=>void;onImport:(event:ChangeEvent<HTMLInputElement>)=>void;onDelete:()=>void}){
  return <aside>
    <div className="stories-heading"><p className="eyebrow">STORIES</p><button className="new-story" onClick={onNew}>＋ New story</button></div>
    <div className="story-list">{stories.map(item=><button key={item.id} className={item.id===selectedId?'story-item selected':'story-item'} onClick={()=>onOpen(item.id)}><span className="story-dot">✦</span><span>{item.title||'Untitled story'}</span></button>)}</div>
    <div className="project-actions"><button onClick={onExport}>Export project</button><label>Import project<input type="file" accept="application/json,.json" onChange={onImport}/></label>{stories.length>1&&<button onClick={onDelete}>Delete story</button>}</div>
  </aside>;
}
