import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { assetDirFor, importAsset, repoRoot, resolveAssetFile, scratchDir, sqliteFile } from './server/paths.ts';

const workerRoot=path.join(repoRoot,'apps','image-lab','worker');
const workerPath=path.join(workerRoot,'flux_worker.py');
const outputDirectory=scratchDir;
const libraryDir=assetDirFor(sqliteFile);

type Pending={resolve:(value:Record<string,unknown>)=>void; reject:(error:Error)=>void};

function resolvePython() {
  if (process.env.STORYTELLER_PYTHON) return process.env.STORYTELLER_PYTHON;
  const windows=path.join(workerRoot,'.venv','Scripts','python.exe');
  const posix=path.join(workerRoot,'.venv','bin','python');
  if (fs.existsSync(windows)) return windows;
  if (fs.existsSync(posix)) return posix;
  return process.platform==='win32'?'python':'python3';
}

function readJson(req:IncomingMessage) {
  return new Promise<Record<string,unknown>>((resolve,reject)=>{
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
  res.setHeader('Content-Type','application/json');
  res.end(JSON.stringify(value));
}

function publicImages(result:Record<string,unknown>,assetId?:string) {
  const images=Array.isArray(result.images)?result.images.map((image:Record<string,unknown>,index:number)=>{
    const filePath=typeof image.filePath==='string'?image.filePath:undefined;
    if (filePath&&assetId&&fs.existsSync(filePath)) {
      const stored=importAsset(filePath,assetId,libraryDir,index);
      return {...image,filePath:stored.filePath,url:stored.url};
    }
    const name=filePath?path.basename(filePath):undefined;
    return {...image,url:name?`/generated-assets/${name}`:undefined};
  }):[];
  return {...result,images};
}

export function storytellerImagePlugin():Plugin {
  let child:ChildProcessWithoutNullStreams|undefined;
  let stdout='';
  const queue:Pending[]=[];

  const stopWorker=()=>{
    if (!child) return;
    child.stdin.end();
    child.kill();
    child=undefined;
  };

  const ensureWorker=()=>{
    if (child) return child;
    const env={...process.env};
    env.STORYTELLER_FLUX_MODE=env.STORYTELLER_FLUX_MODE||(fs.existsSync(path.join(workerRoot,'.venv'))?'real':'mock');
    env.STORYTELLER_FLUX_MODEL=env.STORYTELLER_FLUX_MODEL||'black-forest-labs/FLUX.2-klein-4B';
    child=spawn(resolvePython(),['-u',workerPath],{env,cwd:repoRoot});
    child.stdout.on('data',chunk=>{
      stdout+=chunk.toString();
      const lines=stdout.split(/\r?\n/);
      stdout=lines.pop()||'';
      for (const line of lines) {
        if (!line.trim()) continue;
        const pending=queue.shift();
        if (!pending) continue;
        try { pending.resolve(JSON.parse(line)); }
        catch (error) { pending.reject(error instanceof Error?error:new Error('Invalid worker response')); }
      }
    });
    child.stderr.on('data',chunk=>{process.stderr.write(chunk);});
    child.on('error',error=>{
      const pending=queue.shift();
      pending?.reject(error);
    });
    child.on('close',(code,signal)=>{
      const pending=queue.shift();
      pending?.reject(new Error(`Image worker exited with ${code??signal}`));
      child=undefined;
    });
    return child;
  };

  const askWorker=(request:Record<string,unknown>,timeoutMs=15*60*1000)=>new Promise<Record<string,unknown>>((resolve,reject)=>{
    const worker=ensureWorker();
    const pending:Pending={resolve,reject};
    const timer=setTimeout(()=>{
      const index=queue.indexOf(pending);
      if (index>=0) queue.splice(index,1);
      reject(new Error(`Image generation timed out after ${Math.round(timeoutMs/60000)} minutes.`));
    },timeoutMs);
    queue.push({
      resolve:value=>{clearTimeout(timer);resolve(value);},
      reject:error=>{clearTimeout(timer);reject(error);}
    });
    worker.stdin.write(`${JSON.stringify({...request,outputDirectory})}\n`);
  });

  const readStatus=()=>new Promise<Record<string,unknown>>((resolve,reject)=>{
    const env={...process.env};
    env.STORYTELLER_FLUX_MODE=env.STORYTELLER_FLUX_MODE||(fs.existsSync(path.join(workerRoot,'.venv'))?'real':'mock');
    const probe=spawn(resolvePython(),['-u',workerPath,'status'],{env,cwd:repoRoot});
    let output='';
    probe.stdout.on('data',chunk=>{output+=chunk.toString();});
    probe.stderr.on('data',chunk=>{output+=chunk.toString();});
    probe.on('error',reject);
    probe.on('close',()=>{
      try { resolve(JSON.parse(output.trim().split(/\r?\n/).filter(Boolean).pop()||'{}')); }
      catch (error) { reject(error instanceof Error?error:new Error(output||'Could not read image worker status')); }
    });
  });

  return {
    name:'storyteller-image-worker',
    configureServer(server){
      fs.mkdirSync(outputDirectory,{recursive:true});
      fs.mkdirSync(libraryDir,{recursive:true});
      server.middlewares.use(async(req,res,next)=>{
        const url=req.url?.split('?')[0]||'';
        if (url==='/api/image-status') {
          try { writeJson(res,200,await readStatus()); }
          catch (error) { writeJson(res,500,{ok:false,mode:'mock',ready:false,detail:error instanceof Error?error.message:'Status failed'}); }
          return;
        }
        if (url==='/api/generate-images' && req.method==='POST') {
          try {
            const request=await readJson(req);
            const references=Array.isArray(request.references)?request.references.map((ref:Record<string,unknown>)=>{
              const raw=typeof ref.filePath==='string'?ref.filePath:typeof ref.url==='string'?ref.url:'';
              const resolved=resolveAssetFile(raw,[libraryDir,outputDirectory])||(raw&&fs.existsSync(raw)?raw:undefined);
              return {...ref,filePath:resolved};
            }):request.references;
            const result=await askWorker({...request,references});
            const assetId=typeof request.assetId==='string'?request.assetId:undefined;
            writeJson(res,result.ok===false?500:200,publicImages(result,assetId));
          } catch (error) {
            writeJson(res,500,{ok:false,error:'Image generation failed',detail:error instanceof Error?error.message:String(error)});
          }
          return;
        }
        if (url.startsWith('/generated-assets/')||url.startsWith('/library/')) {
          const file=resolveAssetFile(url,[libraryDir,outputDirectory]);
          if (!file) { res.statusCode=404; res.end('Not found'); return; }
          if (req.method==='HEAD') { res.statusCode=200; res.setHeader('Content-Type','image/png'); res.end(); return; }
          res.setHeader('Content-Type','image/png');
          res.setHeader('Cache-Control','no-cache');
          fs.createReadStream(file).pipe(res);
          return;
        }
        next();
      });
    },
    closeBundle:stopWorker,
    buildEnd:stopWorker
  };
}
