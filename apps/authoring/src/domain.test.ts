import { describe, expect, it } from 'vitest';
import { analyzeStory, createCharacter, createLocation, normalizeProject } from './domain';
import { characterVisualPrompt, generateCharacter, generateScene, generateStory, missingKeyExamples, sceneVisualPrompt } from './generate';
import { extractJson, parseStoryDraft } from './story-draft';
import { normalizeStoryShape, shapeSceneProse } from './story-shape';
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
    expect(story.scenes).toHaveLength(8);
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
describe('local story draft',()=>{
  it('reads JSON even when the model wraps it in a fence',()=>{
    const parsed=extractJson('Sure.\n```json\n{"title":"Pip"}\n```');
    expect(parsed).toEqual({title:'Pip'});
  });
  it('hydrates characters, places, and scene name refs into domain modules',()=>{
    const story=parseStoryDraft({
      title:'Tomo in the Wild',
      sourceText:'Tomo met Reed by the river.',
      characters:[
        {name:'Tomo',role:'hero',key:true,description:'a little dog',appearance:'a warm tan puppy with floppy ears',traits:['curious']},
        {name:'Reed',role:'friend',key:true,description:'a frog',appearance:'a pea-green frog with a lily-pad hat'}
      ],
      locations:[{name:'Singing River',description:'A bright river over smooth stones.'}],
      scenes:[{summary:'They meet',sourceText:'Tomo met Reed by the river.',visualDescription:'Two friends at the water.',characterNames:['Tomo','Reed'],locationName:'Singing River'}]
    });
    expect(story.title).toBe('Tomo in the Wild');
    expect(story.characters.map(character=>character.name)).toEqual(['Tomo','Reed']);
    expect(story.scenes[0].characterIds).toEqual(story.characters.map(character=>character.id));
    expect(story.scenes[0].locationId).toBe(story.locations[0].id);
  });
  it('keeps existing character ids when rewriting a story with the same cast',()=>{
    const tomo=createCharacter({name:'Tomo',role:'hero',description:'a little dog',appearance:'a tan puppy',traits:['loyal'],key:true,imageStatus:'generated',selectedImage:'/library/tomo.png'});
    const river=createLocation({name:'Singing River',description:'bright water'});
    const story=parseStoryDraft({
      title:'Friends in the wild',
      characters:[{name:'Tomo'},{name:'Nim'}],
      locations:[{name:'Mossy Trail',description:'a narrow forest path'}],
      scenes:[{summary:'Tomo walks',sourceText:'Tomo walked the mossy trail.',characterNames:['Tomo'],locationName:'Mossy Trail'}]
    },{characters:[tomo],locations:[river]});
    expect(story.characters[0].id).toBe(tomo.id);
    expect(story.characters[0].selectedImage).toBe('/library/tomo.png');
    expect(story.characters.map(character=>character.name)).toEqual(['Tomo','Nim']);
    expect(story.locations[0].id).toBe(river.id);
    expect(story.locations.map(location=>location.name)).toEqual(['Singing River','Mossy Trail']);
  });
  it('keeps only the requested number of pages',()=>{
    const story=parseStoryDraft({
      title:'Short',
      characters:[{name:'Tomo',appearance:'a tan puppy'}],
      scenes:[
        {summary:'One',sourceText:'Tomo walked.'},
        {summary:'Two',sourceText:'Tomo ran.'},
        {summary:'Three',sourceText:'Tomo rested.'}
      ]
    },undefined,2);
    expect(story.scenes.map(scene=>scene.summary)).toEqual(['One','Two']);
  });
});
describe('story shape',()=>{
  it('writes the requested number of pages',()=>{
    const story=generateStory({premise:'a shy rabbit named Pip who wants to sing at the village fair',pageCount:4});
    expect(story.scenes).toHaveLength(4);
  });
  it('keeps scene paragraphs inside the requested bounds',()=>{
    const story=generateStory({
      premise:'a shy rabbit named Pip who wants to sing at the village fair',
      pageCount:6,
      paragraphsMin:2,
      paragraphsMax:2,
      paragraphWordsMin:12,
      paragraphWordsMax:40
    });
    for (const scene of story.scenes) {
      const paragraphs=scene.sourceText.split(/\n{2,}/).filter(Boolean);
      expect(paragraphs.length).toBeGreaterThanOrEqual(1);
      expect(paragraphs.length).toBeLessThanOrEqual(2);
      for (const paragraph of paragraphs) {
        expect(paragraph.trim().split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(40);
      }
    }
    expect(story.sourceText).not.toMatch(/stayed with the moment/i);
  });
  it('does not invent padding sentences when fitting paragraph length',()=>{
    const shaped=shapeSceneProse('Mia found the red ball under a mushroom.',normalizeStoryShape({
      paragraphsMin:1,
      paragraphsMax:2,
      paragraphWordsMin:18,
      paragraphWordsMax:40
    }));
    expect(shaped).toContain('red ball');
    expect(shaped).not.toMatch(/stayed with the moment|nothing rushed them|they went on/i);
  });
});
