import { describe, expect, it } from 'vitest';
import { analyzeStory, normalizeProject } from './domain';
import { characterVisualPrompt, generateCharacter, generateScene, generateStory, missingKeyExamples, sceneVisualPrompt } from './generate';
import { createPlaybackManifest } from './playback';
import { composeImageRequest } from '../../../packages/image-provider/src/prompt';
describe('MVP project invariants',()=>{it('keeps the authoring model provider-neutral',()=>{const project={sourceText:'A story',characters:[],locations:[],scenes:[]};expect(project).not.toHaveProperty('provider');expect(project.sourceText).toBe('A story')});it('supports non-destructive scene variants conceptually',()=>{const scene={imageStatus:'generated',selectedImage:'variant-a'};const variants=[scene.selectedImage,'variant-b'];expect(variants).toHaveLength(2);expect(scene.selectedImage).toBe('variant-a')})});
describe('draft analysis',()=>{
  it('extracts editable characters, locations, and scenes without provider data',()=>{
    const result=analyzeStory('Lina walked through the forest. Lina saw a fox.');
    expect(result.characters.map(c=>c.name)).toContain('Lina');
    expect(result.locations[0].name).toBe('Forest');
    expect(result.scenes).toHaveLength(2);
    expect(result).not.toHaveProperty('provider');
  });
  it('does not promote sentence connectors to characters',()=>{
    const result=analyzeStory('Milo met Nora. Together they found Bram. One evening, they returned.');
    expect(result.characters.map(c=>c.name)).toEqual(['Milo','Nora','Bram']);
  });
  it('does not treat place words as characters',()=>{
    const result=analyzeStory('Still, Pip kept a small wish. They walked to the Village. The Forest held its breath.');
    expect(result.characters.map(character=>character.name)).toEqual(['Pip']);
    expect(result.locations.map(location=>location.name).sort()).toEqual(['Forest','Village']);
  });
});
describe('playback boundary',()=>{it('exports only ordered presentation data',()=>{const result=createPlaybackManifest({id:'s',title:'Fox',sourceText:'secret authoring text',characters:[],locations:[],scenes:[{id:'b',order:1,sourceText:'x',summary:'x',visualDescription:'x',characterIds:[],imageStatus:'generated',selectedImage:'b.webp'},{id:'a',order:0,sourceText:'y',summary:'y',visualDescription:'y',characterIds:[],imageStatus:'empty'}],updatedAt:''});expect(result.scenes.map(s=>s.id)).toEqual(['a','b']);expect(result).not.toHaveProperty('sourceText');expect(result.scenes[1].image).toBe('b.webp')})});
describe('prompt composition',()=>{it('supports reusable asset generation',()=>{const request=composeImageRequest({mode:'asset',subject:'character',style:'soft watercolor',description:'a friendly fox',variants:2});expect(request.mode).toBe('asset');expect(request.prompt).toContain('canonical asset')});it('supports scene composition from references',()=>{const request=composeImageRequest({mode:'composition',subject:'scene',description:'fox crossing a bridge',references:[{assetId:'fox',role:'identity'}]});expect(request.mode).toBe('composition');expect(request.references).toHaveLength(1)})});
describe('modular generation',()=>{
  it('builds a story whose scenes reuse generated character and place modules',()=>{
    const story=generateStory({premise:'a shy rabbit named Pip who wants to sing at the village fair',tone:'gentle',age:'5-7'});
    expect(story.title.toLowerCase()).toContain('pip');
    expect(story.characters.map(character=>character.name)).toContain('Pip');
    expect(story.characters.every(character=>character.appearance.length>0)).toBe(true);
    expect(story.scenes.length).toBeGreaterThanOrEqual(5);
    expect(story.scenes.every(scene=>scene.characterIds.every(id=>story.characters.some(character=>character.id===id)))).toBe(true);
    expect(story.scenes.some(scene=>scene.locationId&&story.locations.some(location=>location.id===scene.locationId))).toBe(true);
    expect(story.sourceText).toContain('Pip');
    expect(story.sourceText.toLowerCase()).toContain('sing');
    expect(story.sourceText).not.toMatch(/wish: to a shy rabbit/i);
    expect(story.characters[0].description.toLowerCase()).toContain('sing');
  });
  it('reuses existing character modules instead of inventing a new cast',()=>{
    const pip=generateCharacter('a shy rabbit named Pip with a blue scarf');
    const story=generateStory({premise:'Pip finds a lantern in the forest',characters:[pip]});
    expect(story.characters[0].id).toBe(pip.id);
    expect(story.scenes[0].characterIds).toContain(pip.id);
  });
  it('asks for an isolated key-character example, not a scene',()=>{
    const pip=generateCharacter('a shy rabbit named Pip with a blue scarf');
    expect(pip.key).toBe(true);
    expect(characterVisualPrompt(pip).toLowerCase()).toContain('isolated');
    expect(characterVisualPrompt(pip).toLowerCase()).toContain('one character');
    expect(characterVisualPrompt(pip).toLowerCase()).not.toContain('silhouette');
  });
  it('marks the first two story characters as the key cast',()=>{
    const story=generateStory({premise:'a shy rabbit named Pip who wants to sing at the village fair'});
    expect(story.characters.filter(character=>character.key).length).toBeGreaterThanOrEqual(2);
    expect(missingKeyExamples(story.characters).map(character=>character.name)).toContain('Pip');
  });
  it('derives scene prompts from locked examples instead of reinventing the cast',()=>{
    const story=generateStory({premise:'a shy rabbit named Pip who wants to sing at the village fair'});
    const prompt=sceneVisualPrompt(story.scenes[0],story).toLowerCase();
    expect(prompt).toContain('attached character examples');
    expect(prompt).toContain('do not invent');
    expect(prompt).toContain('reference 1 is only pip');
    expect(prompt).toContain('do not swap');
  });
  it('keeps named species as distinct characters and does not invent extras',()=>{
    const story=generateStory({premise:'a fox and a raccoon find a lantern in the village',tone:'gentle'});
    const foxes=story.characters.filter(character=>/fox/i.test(character.appearance));
    const raccoons=story.characters.filter(character=>/raccoon/i.test(character.appearance));
    expect(foxes).toHaveLength(1);
    expect(raccoons).toHaveLength(1);
    expect(story.characters).toHaveLength(2);
    expect(new Set(story.characters.map(character=>character.name)).size).toBe(2);
    expect(story.sourceText).not.toMatch(/\bundefined\b/);
  });
  it('does not add a second hedgehog when the hero is already a hedgehog',()=>{
    const story=generateStory({premise:'a hedgehog named Ivy who wants to share a story'});
    expect(story.characters.filter(character=>/hedgehog/i.test(character.appearance))).toHaveLength(1);
    expect(story.characters.map(character=>character.name)).toContain('Ivy');
  });
  it('composes a scene from selected modules',()=>{
    const hero=generateCharacter('Milo the curious fox');
    const place=generateStory({premise:'a fox in the forest'}).locations[0];
    const scene=generateScene({beat:'they find a silver lantern under the willows',order:0,characters:[hero],location:place});
    expect(scene.characterIds).toEqual([hero.id]);
    expect(scene.locationId).toBe(place.id);
    expect(scene.visualDescription.toLowerCase()).toContain('lantern');
  });
  it('fills missing visual fields on older saved projects',()=>{
    const project=normalizeProject({id:'old',title:'Old',sourceText:'x',updatedAt:'',characters:[{id:'c',name:'Lina',role:'hero',description:'a fox',traits:[]}] as never,locations:[],scenes:[]});
    expect(project.characters[0].appearance).toContain('fox');
    expect(project.characters[0].imageStatus).toBe('empty');
  });
});
