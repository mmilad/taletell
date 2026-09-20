import { normalizeProject, type Project } from '../domain';
import { emptyProject, mergeStory, type DbController } from './store';

export type ApiRequest = { method:string; path:string; body?:unknown };
export type ApiResponse = { status:number; body:unknown };

function isProjectLike(value:unknown):value is Partial<Project> {
  return Boolean(value&&typeof value==='object'&&!Array.isArray(value)&&('id' in value||'title' in value||'sourceText' in value||'characters' in value||'locations' in value||'scenes' in value));
}

function normalizePath(path:string) {
  const clean=(path.split('?')[0]||'/').replace(/\/+$/,'');
  return clean||'/';
}

/**
 * HTTP adapter over DbController.
 * The UI talks only to these routes; swap SQLite for Postgres behind DbController.
 */
export class ProjectApiController {
  constructor(private readonly db:DbController) {}

  async handle(request:ApiRequest):Promise<ApiResponse> {
    try {
      const method=request.method.toUpperCase();
      const path=normalizePath(request.path);
      if (path==='/api/projects') return this.collection(method,request.body);
      const match=path.match(/^\/api\/projects\/([^/]+)$/);
      if (match) return this.item(method,decodeURIComponent(match[1]),request.body);
      return {status:404,body:{error:'Not found'}};
    } catch (error) {
      return {status:500,body:{error:error instanceof Error?error.message:'Project store failed'}};
    }
  }

  private async collection(method:string,body:unknown):Promise<ApiResponse> {
    if (method==='GET') return {status:200,body:await this.db.listStories()};
    if (method==='POST') {
      const project=isProjectLike(body)?emptyProject(body):emptyProject();
      return {status:201,body:await this.db.saveStory(project)};
    }
    return {status:405,body:{error:'Method not allowed'}};
  }

  private async item(method:string,id:string,body:unknown):Promise<ApiResponse> {
    if (method==='GET') {
      const project=await this.db.getStory(id);
      return project?{status:200,body:project}:{status:404,body:{error:'Project not found'}};
    }
    if (method==='PUT') {
      if (!isProjectLike(body)) return {status:400,body:{error:'A project document is required'}};
      const existing=await this.db.getStory(id);
      const project=mergeStory(existing,normalizeProject({...emptyProject({...existing,...body,id}),updatedAt:new Date().toISOString()}));
      return {status:existing?200:201,body:await this.db.saveStory(project)};
    }
    if (method==='DELETE') {
      const removed=await this.db.deleteStory(id);
      return removed?{status:204,body:null}:{status:404,body:{error:'Project not found'}};
    }
    return {status:405,body:{error:'Method not allowed'}};
  }
}
