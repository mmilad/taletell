import type { ReactNode } from 'react';
import type { Tab } from '../types';

const LABELS:Record<Tab,string>={story:'Story',characters:'Characters',places:'Places',scenes:'Scenes'};

export function Workspace({title,tab,tabs,onTab,children}:{title:string;tab:Tab;tabs:Array<{id:Tab;count?:number}>;onTab:(tab:Tab)=>void;children:ReactNode}){
  return <section className="content">
    <div className="workspace-head">
      <div><p className="eyebrow">CURRENT STORY</p><h1 className="workspace-title">{title||'Untitled story'}</h1></div>
      <nav className="workspace-tabs">{tabs.map(item=><button key={item.id} className={tab===item.id?'workspace-tab active':'workspace-tab'} onClick={()=>onTab(item.id)}>{LABELS[item.id]}{item.count?<i>{item.count}</i>:null}</button>)}</nav>
    </div>
    {children}
  </section>;
}
