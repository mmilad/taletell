import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { generateLocalStory, analyzeLocalStory, getStoryStatus } from './server/ollama-story.ts';
import type { StoryBrief } from './src/generate.ts';

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

export function storytellerStoryPlugin():Plugin {
  return {
    name:'storyteller-story-llm',
    configureServer(server){
      server.middlewares.use(async(req,res,next)=>{
        const url=req.url?.split('?')[0]||'';
        try {
          if (url==='/api/story-status'&&req.method==='GET') {
            writeJson(res,200,await getStoryStatus());
            return;
          }
          if (url==='/api/generate-story'&&req.method==='POST') {
            const body=await readJson(req);
            const brief=body as StoryBrief;
            if (typeof brief.premise!=='string'||!brief.premise.trim()) {
              writeJson(res,400,{error:'A premise is required to generate a story.'});
              return;
            }
            const story=await generateLocalStory(brief);
            writeJson(res,200,story);
            return;
          }
          if (url==='/api/analyze-story'&&req.method==='POST') {
            const body=await readJson(req);
            const sourceText=typeof body.sourceText==='string'?body.sourceText:'';
            if (!sourceText.trim()) {
              writeJson(res,400,{error:'Story text is required to analyze a story.'});
              return;
            }
            const story=await analyzeLocalStory(sourceText);
            writeJson(res,200,story);
            return;
          }
        } catch (error) {
          writeJson(res,500,{error:error instanceof Error?error.message:'Story generation failed'});
          return;
        }
        next();
      });
    }
  };
}
