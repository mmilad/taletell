import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import type { GeneratedImage, ImageGenerationRequest } from '../../../packages/image-provider/src/index';

export function generateWithPythonWorker(request:ImageGenerationRequest):Promise<GeneratedImage[]> {
  return new Promise((resolvePromise,reject)=>{
    const workerPython=process.env.STORYTELLER_PYTHON||resolve(process.cwd(),'worker/.venv/bin/python');
    const worker=spawn(workerPython,[resolve(process.cwd(),'worker/flux_worker.py')],{env:process.env});
    let output='';
    worker.stdout.on('data',(chunk)=>{output+=chunk.toString()});
    worker.stderr.on('data',(chunk)=>{output+=chunk.toString()});
    worker.on('error',reject);
    worker.on('close',(code)=>{try{const response=JSON.parse(output.trim().split(/\r?\n/).pop()||'{}');if(code!==0||!response.ok)reject(new Error(response.detail||response.error||`Worker exited with ${code}`));else resolvePromise(response.images as GeneratedImage[])}catch(error){reject(error)}});
    worker.stdin.write(`${JSON.stringify(request)}\n`);
    worker.stdin.end();
  });
}
