import type { Project } from '../domain';
import type { ProjectSummary } from './store';

async function request<T>(path:string,init?:RequestInit):Promise<T> {
  const response=await fetch(path,{headers:{'Content-Type':'application/json'},...init});
  if (response.status===204) return undefined as T;
  const payload=await response.json() as {error?:string}&T;
  if (!response.ok) throw new Error(payload.error||`Project API failed (${response.status})`);
  return payload;
}

/** Browser client for the project API controller. */
export const projectApi = {
  list:()=>request<ProjectSummary[]>('/api/projects'),
  get:(id:string)=>request<Project>(`/api/projects/${encodeURIComponent(id)}`),
  create:(project?:Partial<Project>)=>request<Project>('/api/projects',{method:'POST',body:JSON.stringify(project||{})}),
  save:(project:Project)=>request<Project>(`/api/projects/${encodeURIComponent(project.id)}`,{method:'PUT',body:JSON.stringify(project)}),
  remove:(id:string)=>request<void>(`/api/projects/${encodeURIComponent(id)}`,{method:'DELETE'})
};
