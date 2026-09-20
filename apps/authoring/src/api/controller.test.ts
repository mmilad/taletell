import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createSqliteStore } from '../../server/sqlite-store';
import { ProjectApiController } from './controller';
import { createMemoryStore } from './memory-store';
import { emptyProject } from './store';

function api(store=createMemoryStore()) {
  return new ProjectApiController(store);
}

describe('project API controller',()=>{
  it('creates, lists, reads, updates, and deletes through the store seam',async()=>{
    const controller=api();
    const created=await controller.handle({method:'POST',path:'/api/projects',body:{title:'Pip at the Fair'}});
    expect(created.status).toBe(201);
    const project=(created.body as {id:string;title:string});
    expect(project.title).toBe('Pip at the Fair');

    const listed=await controller.handle({method:'GET',path:'/api/projects'});
    expect(listed.status).toBe(200);
    expect(listed.body).toEqual([expect.objectContaining({id:project.id,title:'Pip at the Fair'})]);

    const updated=await controller.handle({method:'PUT',path:`/api/projects/${project.id}`,body:{...project,sourceText:'Pip sang.'}});
    expect(updated.status).toBe(200);
    expect((updated.body as {sourceText:string}).sourceText).toBe('Pip sang.');

    const removed=await controller.handle({method:'DELETE',path:`/api/projects/${project.id}`});
    expect(removed.status).toBe(204);
    const missing=await controller.handle({method:'GET',path:`/api/projects/${project.id}`});
    expect(missing.status).toBe(404);
  });

  it('does not expose the store kind in API payloads',async()=>{
    const created=await api().handle({method:'POST',path:'/api/projects'});
    expect(created.body).not.toHaveProperty('provider');
    expect(created.body).not.toHaveProperty('sqlite');
  });

  it('rejects an empty update body',async()=>{
    const controller=api();
    const created=await controller.handle({method:'POST',path:'/api/projects'});
    const id=(created.body as {id:string}).id;
    const result=await controller.handle({method:'PUT',path:`/api/projects/${id}`,body:'nope'});
    expect(result.status).toBe(400);
  });

  it('keeps generated character refs when a later save forgets them',async()=>{
    const db=createMemoryStore();
    const controller=new ProjectApiController(db);
    const pip=emptyProject({
      title:'Pip',
      characters:[{
        id:'pip',name:'Pip',role:'shy dreamer',description:'a rabbit',appearance:'a cream rabbit',traits:['shy'],
        imageStatus:'generated',selectedImage:'/generated-assets/pip.png',imageFile:'/generated-assets/pip.png',imageVariants:['/generated-assets/pip.png']
      }]
    });
    await controller.handle({method:'POST',path:'/api/projects',body:pip});
    const updated=await controller.handle({
      method:'PUT',
      path:`/api/projects/${pip.id}`,
      body:{...pip,title:'Pip and the Fair',characters:[{...pip.characters[0],imageStatus:'empty',selectedImage:undefined,imageFile:undefined,imageVariants:[]}]}
    });
    const saved=updated.body as typeof pip;
    expect(saved.title).toBe('Pip and the Fair');
    expect(saved.characters[0].imageStatus).toBe('generated');
    expect(saved.characters[0].selectedImage).toBe('/generated-assets/pip.png');
  });
});

describe('sqlite db controller',()=>{
  it('round-trips stories, scene character refs, and copies image sheets into the library',async()=>{
    const dir=mkdtempSync(path.join(tmpdir(),'storyteller-'));
    const file=path.join(dir,'library.sqlite');
    const source=path.join(dir,'source.png');
    writeFileSync(source,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64'));
    const db=createSqliteStore(file);
    const saved=await db.saveStory(emptyProject({
      title:'Milo',
      sourceText:'A fox walked.',
      characters:[{
        id:'milo',name:'Milo',role:'explorer',description:'a fox',appearance:'a rusty fox',traits:['curious'],key:true,
        imageStatus:'generated',selectedImage:source,imageFile:source,imageVariants:[source]
      }],
      scenes:[{
        id:'s1',order:0,sourceText:'Milo walked.',summary:'Walk',visualDescription:'a path',characterIds:['milo'],
        imageStatus:'empty'
      }]
    }));
    expect((await db.listStories())[0]).toEqual(expect.objectContaining({id:saved.id,title:'Milo',characterCount:1,sceneCount:1}));
    const loaded=await db.getStory(saved.id);
    expect(loaded?.sourceText).toBe('A fox walked.');
    expect(loaded?.characters[0].selectedImage).toBe('/library/milo.png');
    expect(existsSync(path.join(dir,'assets','milo.png'))).toBe(true);
    expect(loaded?.scenes[0].characterIds).toEqual(['milo']);
    await db.saveStory({...loaded!,title:'Milo and the Forest',characters:[{...loaded!.characters[0],imageStatus:'empty',selectedImage:undefined,imageFile:undefined,imageVariants:[]}]});
    const kept=await db.getStory(saved.id);
    expect(kept?.title).toBe('Milo and the Forest');
    expect(kept?.characters[0].imageStatus).toBe('generated');
    expect(kept?.characters[0].selectedImage).toBe('/library/milo.png');
    expect(await db.deleteStory(saved.id)).toBe(true);
    expect(await db.getStory(saved.id)).toBeUndefined();
  });
});
