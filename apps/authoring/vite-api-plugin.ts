import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { ProjectApiController } from './src/api/controller.ts';
import { createDbController } from './server/create-store.ts';

function readJson(req:IncomingMessage) {
  return new Promise<unknown>((resolve,reject)=>{
    const chunks:Buffer[]=[];
    req.on('data',chunk=>chunks.push(Buffer.from(chunk)));
    req.on('end',()=>{
      try { resolve(JSON.parse(Buffer.concat(chunks).toString()||'{}')); }
      catch (error) { reject(error instanceof Error?error:new Error('Invalid JSON')); }
    });
    req.on('error',reject);
  });
}

function writeJson(res:ServerResponse,status:number,value:unknown) {
  res.statusCode=status;
  if (status===204) { res.end(); return; }
  res.setHeader('Content-Type','application/json');
  res.end(JSON.stringify(value));
}

export function storytellerApiPlugin():Plugin {
  const controller=new ProjectApiController(createDbController());
  return {
    name:'storyteller-project-api',
    configureServer(server){
      server.middlewares.use(async(req,res,next)=>{
        const url=req.url?.split('?')[0]||'';
        if (!url.startsWith('/api/projects')) return next();
        try {
          const needsBody=req.method==='POST'||req.method==='PUT'||req.method==='PATCH';
          const body=needsBody?await readJson(req):undefined;
          const result=await controller.handle({method:req.method||'GET',path:url,body});
          writeJson(res,result.status,result.body);
        } catch (error) {
          writeJson(res,500,{error:error instanceof Error?error.message:'Project API failed'});
        }
      });
    }
  };
}
