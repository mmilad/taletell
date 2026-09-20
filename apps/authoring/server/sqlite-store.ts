import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { normalizeProject, type Character, type Imageable, type Location, type Project, type Scene } from '../src/domain.ts';
import { mergeStory, type DbController, type StorySummary } from '../src/api/store.ts';
import { assetDirFor, importAsset, resolveAssetFile, scratchDir } from './paths.ts';

type StoryRow = { id:string; title:string; source_text:string; updated_at:string };
type CharacterRow = {
  id:string; story_id:string; name:string; role:string; description:string; appearance:string;
  traits_json:string; is_key:number; sort_order:number; image_status:string;
  selected_image:string|null; image_file:string|null; image_variants_json:string;
};
type LocationRow = {
  id:string; story_id:string; name:string; description:string; sort_order:number; image_status:string;
  selected_image:string|null; image_file:string|null; image_variants_json:string;
};
type SceneRow = {
  id:string; story_id:string; sort_order:number; source_text:string; summary:string; visual_description:string;
  location_id:string|null; image_status:string; selected_image:string|null; image_file:string|null; image_variants_json:string;
};

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS stories (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    source_text TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS characters (
    id TEXT PRIMARY KEY,
    story_id TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    appearance TEXT NOT NULL DEFAULT '',
    traits_json TEXT NOT NULL DEFAULT '[]',
    is_key INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    image_status TEXT NOT NULL DEFAULT 'empty',
    selected_image TEXT,
    image_file TEXT,
    image_variants_json TEXT NOT NULL DEFAULT '[]',
    FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS locations (
    id TEXT PRIMARY KEY,
    story_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    image_status TEXT NOT NULL DEFAULT 'empty',
    selected_image TEXT,
    image_file TEXT,
    image_variants_json TEXT NOT NULL DEFAULT '[]',
    FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS scenes (
    id TEXT PRIMARY KEY,
    story_id TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    source_text TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    visual_description TEXT NOT NULL DEFAULT '',
    location_id TEXT,
    image_status TEXT NOT NULL DEFAULT 'empty',
    selected_image TEXT,
    image_file TEXT,
    image_variants_json TEXT NOT NULL DEFAULT '[]',
    FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS scene_characters (
    scene_id TEXT NOT NULL,
    character_id TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (scene_id, character_id),
    FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE,
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS stories_updated_at ON stories(updated_at);
  CREATE INDEX IF NOT EXISTS characters_story_id ON characters(story_id);
  CREATE INDEX IF NOT EXISTS locations_story_id ON locations(story_id);
  CREATE INDEX IF NOT EXISTS scenes_story_id ON scenes(story_id);
`;

function parseJson<T>(value:string,fallback:T):T {
  try { return JSON.parse(value) as T; }
  catch { return fallback; }
}

function imageableFrom(row:{image_status:string;selected_image:string|null;image_file:string|null;image_variants_json:string}) {
  return {
    imageStatus:(row.image_status==='generated'?'generated':'empty') as 'empty'|'generated',
    selectedImage:row.selected_image||undefined,
    imageFile:row.image_file||undefined,
    imageVariants:parseJson<string[]>(row.image_variants_json,[])
  };
}

function persistImageable<T extends Imageable&{id:string}>(item:T,library:string):T {
  const refs=[item.imageFile,item.selectedImage,...(item.imageVariants||[])];
  const source=refs.map(ref=>resolveAssetFile(ref,[library,scratchDir])).find(Boolean);
  if (!source) return item;
  const variants=(item.imageVariants?.length?item.imageVariants:[source]).map((ref,index)=>{
    const file=resolveAssetFile(ref,[library,scratchDir])||source;
    return importAsset(file,item.id,library,index).url;
  });
  return {...item,imageStatus:'generated',selectedImage:variants[0],imageFile:variants[0],imageVariants:variants};
}

export function createSqliteStore(filePath:string):DbController {
  fs.mkdirSync(path.dirname(filePath),{recursive:true});
  const library=assetDirFor(filePath);
  fs.mkdirSync(library,{recursive:true});
  const database=new DatabaseSync(filePath);
  database.exec('PRAGMA journal_mode = WAL;');
  database.exec('PRAGMA foreign_keys = ON;');
  database.exec(SCHEMA);
  migrateJsonProjects(database);

  const listStmt=database.prepare(`
    SELECT s.id, s.title, s.updated_at,
      (SELECT COUNT(*) FROM characters c WHERE c.story_id = s.id) AS character_count,
      (SELECT COUNT(*) FROM scenes sc WHERE sc.story_id = s.id) AS scene_count
    FROM stories s
    ORDER BY s.updated_at DESC
  `);
  const storyStmt=database.prepare('SELECT id, title, source_text, updated_at FROM stories WHERE id = ?');
  const charactersStmt=database.prepare('SELECT * FROM characters WHERE story_id = ? ORDER BY sort_order, name');
  const locationsStmt=database.prepare('SELECT * FROM locations WHERE story_id = ? ORDER BY sort_order, name');
  const scenesStmt=database.prepare('SELECT * FROM scenes WHERE story_id = ? ORDER BY sort_order');
  const sceneCharsStmt=database.prepare('SELECT character_id FROM scene_characters WHERE scene_id = ? ORDER BY sort_order');

  const upsertStory=database.prepare(`
    INSERT INTO stories (id, title, source_text, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET title = excluded.title, source_text = excluded.source_text, updated_at = excluded.updated_at
  `);
  const upsertCharacter=database.prepare(`
    INSERT INTO characters (id, story_id, name, role, description, appearance, traits_json, is_key, sort_order, image_status, selected_image, image_file, image_variants_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      story_id = excluded.story_id, name = excluded.name, role = excluded.role, description = excluded.description,
      appearance = excluded.appearance, traits_json = excluded.traits_json, is_key = excluded.is_key, sort_order = excluded.sort_order,
      image_status = excluded.image_status, selected_image = excluded.selected_image, image_file = excluded.image_file,
      image_variants_json = excluded.image_variants_json
  `);
  const upsertLocation=database.prepare(`
    INSERT INTO locations (id, story_id, name, description, sort_order, image_status, selected_image, image_file, image_variants_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      story_id = excluded.story_id, name = excluded.name, description = excluded.description, sort_order = excluded.sort_order,
      image_status = excluded.image_status, selected_image = excluded.selected_image, image_file = excluded.image_file,
      image_variants_json = excluded.image_variants_json
  `);
  const upsertScene=database.prepare(`
    INSERT INTO scenes (id, story_id, sort_order, source_text, summary, visual_description, location_id, image_status, selected_image, image_file, image_variants_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      story_id = excluded.story_id, sort_order = excluded.sort_order, source_text = excluded.source_text, summary = excluded.summary,
      visual_description = excluded.visual_description, location_id = excluded.location_id, image_status = excluded.image_status,
      selected_image = excluded.selected_image, image_file = excluded.image_file, image_variants_json = excluded.image_variants_json
  `);
  const insertSceneCharacter=database.prepare('INSERT INTO scene_characters (scene_id, character_id, sort_order) VALUES (?, ?, ?)');
  const deleteSceneCharacters=database.prepare('DELETE FROM scene_characters WHERE scene_id IN (SELECT id FROM scenes WHERE story_id = ?)');
  const deleteMissingCharacters=database.prepare('DELETE FROM characters WHERE story_id = ? AND id NOT IN (SELECT value FROM json_each(?))');
  const deleteMissingLocations=database.prepare('DELETE FROM locations WHERE story_id = ? AND id NOT IN (SELECT value FROM json_each(?))');
  const deleteMissingScenes=database.prepare('DELETE FROM scenes WHERE story_id = ? AND id NOT IN (SELECT value FROM json_each(?))');
  const deleteEmptyCharacters=database.prepare('DELETE FROM characters WHERE story_id = ?');
  const deleteEmptyLocations=database.prepare('DELETE FROM locations WHERE story_id = ?');
  const deleteEmptyScenes=database.prepare('DELETE FROM scenes WHERE story_id = ?');
  const deleteStory=database.prepare('DELETE FROM stories WHERE id = ?');

  const loadStory=(id:string):Project|undefined=>{
    const row=storyStmt.get(id) as StoryRow|undefined;
    if (!row) return undefined;
    const characters=(charactersStmt.all(id) as CharacterRow[]).map(character=>({
      id:character.id,
      name:character.name,
      role:character.role,
      description:character.description,
      appearance:character.appearance,
      traits:parseJson<string[]>(character.traits_json,[]),
      key:Boolean(character.is_key),
      ...imageableFrom(character)
    } satisfies Character));
    const locations=(locationsStmt.all(id) as LocationRow[]).map(location=>({
      id:location.id,
      name:location.name,
      description:location.description,
      ...imageableFrom(location)
    } satisfies Location));
    const scenes=(scenesStmt.all(id) as SceneRow[]).map(scene=>({
      id:scene.id,
      order:scene.sort_order,
      sourceText:scene.source_text,
      summary:scene.summary,
      visualDescription:scene.visual_description,
      characterIds:(sceneCharsStmt.all(scene.id) as {character_id:string}[]).map(item=>item.character_id),
      locationId:scene.location_id||undefined,
      ...imageableFrom(scene)
    } satisfies Scene));
    return persistProject(normalizeProject({
      id:row.id,
      title:row.title,
      sourceText:row.source_text,
      updatedAt:row.updated_at,
      characters,
      locations,
      scenes
    }),library);
  };

  const persistProject=(project:Project,dir:string)=>normalizeProject({
    ...project,
    characters:project.characters.map(item=>persistImageable(item,dir)),
    locations:project.locations.map(item=>persistImageable(item,dir)),
    scenes:project.scenes.map(item=>persistImageable(item,dir))
  });

  const writeStory=(project:Project)=>{
    upsertStory.run(project.id,project.title,project.sourceText,project.updatedAt);
    deleteSceneCharacters.run(project.id);
    project.characters.forEach((character,index)=>{
      upsertCharacter.run(
        character.id,project.id,character.name,character.role,character.description,character.appearance,
        JSON.stringify(character.traits||[]),character.key?1:0,index,character.imageStatus,
        character.selectedImage??null,character.imageFile??null,JSON.stringify(character.imageVariants||[])
      );
    });
    if (project.characters.length) deleteMissingCharacters.run(project.id,JSON.stringify(project.characters.map(character=>character.id)));
    else deleteEmptyCharacters.run(project.id);

    project.locations.forEach((location,index)=>{
      upsertLocation.run(
        location.id,project.id,location.name,location.description,index,location.imageStatus,
        location.selectedImage??null,location.imageFile??null,JSON.stringify(location.imageVariants||[])
      );
    });
    if (project.locations.length) deleteMissingLocations.run(project.id,JSON.stringify(project.locations.map(location=>location.id)));
    else deleteEmptyLocations.run(project.id);

    project.scenes.forEach((scene,index)=>{
      upsertScene.run(
        scene.id,project.id,scene.order??index,scene.sourceText,scene.summary,scene.visualDescription,
        scene.locationId??null,scene.imageStatus,scene.selectedImage??null,scene.imageFile??null,
        JSON.stringify(scene.imageVariants||[])
      );
      scene.characterIds.forEach((characterId,order)=>insertSceneCharacter.run(scene.id,characterId,order));
    });
    if (project.scenes.length) deleteMissingScenes.run(project.id,JSON.stringify(project.scenes.map(scene=>scene.id)));
    else deleteEmptyScenes.run(project.id);
  };

  return {
    async listStories() {
      return (listStmt.all() as Array<StoryRow&{character_count:number|bigint;scene_count:number|bigint}>).map(row=>({
        id:row.id,
        title:row.title,
        updatedAt:row.updated_at,
        characterCount:Number(row.character_count),
        sceneCount:Number(row.scene_count)
      } satisfies StorySummary));
    },
    async getStory(id) {
      return loadStory(id);
    },
    async saveStory(project) {
      const incoming=persistProject({...project,updatedAt:project.updatedAt||new Date().toISOString()},library);
      const next=persistProject(mergeStory(loadStory(project.id),incoming),library);
      database.exec('BEGIN');
      try {
        writeStory(next);
        database.exec('COMMIT');
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
      return next;
    },
    async deleteStory(id) {
      database.exec('BEGIN');
      try {
        deleteSceneCharacters.run(id);
        deleteEmptyScenes.run(id);
        deleteEmptyLocations.run(id);
        deleteEmptyCharacters.run(id);
        const removed=Number(deleteStory.run(id).changes)>0;
        database.exec('COMMIT');
        return removed;
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    }
  };
}

function tableHasColumn(database:DatabaseSync,table:string,column:string) {
  const rows=database.prepare(`PRAGMA table_info(${table})`).all() as Array<{name:string}>;
  return rows.some(row=>row.name===column);
}

function migrateJsonProjects(database:DatabaseSync) {
  const tables=database.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as Array<{name:string}>;
  if (!tables.some(table=>table.name==='projects')||!tableHasColumn(database,'projects','document')) return;
  const rows=database.prepare('SELECT id, title, updated_at, document FROM projects').all() as Array<{id:string;title:string;updated_at:string;document:string}>;
  const insert=createSqliteStoreWriter(database);
  database.exec('BEGIN');
  try {
    for (const row of rows) {
      try {
        const project=mergeStory(undefined,normalizeProject(JSON.parse(row.document) as Project));
        insert(project);
      } catch {
        insert(normalizeProject({id:row.id,title:row.title,sourceText:'',characters:[],locations:[],scenes:[],updatedAt:row.updated_at}));
      }
    }
    database.exec('DROP TABLE projects');
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

function createSqliteStoreWriter(database:DatabaseSync) {
  const upsertStory=database.prepare(`
    INSERT INTO stories (id, title, source_text, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET title = excluded.title, source_text = excluded.source_text, updated_at = excluded.updated_at
  `);
  const upsertCharacter=database.prepare(`
    INSERT INTO characters (id, story_id, name, role, description, appearance, traits_json, is_key, sort_order, image_status, selected_image, image_file, image_variants_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name, role = excluded.role, description = excluded.description, appearance = excluded.appearance,
      traits_json = excluded.traits_json, is_key = excluded.is_key, sort_order = excluded.sort_order,
      image_status = excluded.image_status, selected_image = excluded.selected_image, image_file = excluded.image_file,
      image_variants_json = excluded.image_variants_json
  `);
  const upsertLocation=database.prepare(`
    INSERT INTO locations (id, story_id, name, description, sort_order, image_status, selected_image, image_file, image_variants_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name, description = excluded.description, sort_order = excluded.sort_order,
      image_status = excluded.image_status, selected_image = excluded.selected_image, image_file = excluded.image_file,
      image_variants_json = excluded.image_variants_json
  `);
  const upsertScene=database.prepare(`
    INSERT INTO scenes (id, story_id, sort_order, source_text, summary, visual_description, location_id, image_status, selected_image, image_file, image_variants_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      sort_order = excluded.sort_order, source_text = excluded.source_text, summary = excluded.summary,
      visual_description = excluded.visual_description, location_id = excluded.location_id, image_status = excluded.image_status,
      selected_image = excluded.selected_image, image_file = excluded.image_file, image_variants_json = excluded.image_variants_json
  `);
  const insertSceneCharacter=database.prepare('INSERT OR IGNORE INTO scene_characters (scene_id, character_id, sort_order) VALUES (?, ?, ?)');
  return (project:Project)=>{
    upsertStory.run(project.id,project.title,project.sourceText,project.updatedAt);
    project.characters.forEach((character,index)=>{
      upsertCharacter.run(
        character.id,project.id,character.name,character.role,character.description,character.appearance,
        JSON.stringify(character.traits||[]),character.key?1:0,index,character.imageStatus,
        character.selectedImage??null,character.imageFile??null,JSON.stringify(character.imageVariants||[])
      );
    });
    project.locations.forEach((location,index)=>{
      upsertLocation.run(
        location.id,project.id,location.name,location.description,index,location.imageStatus,
        location.selectedImage??null,location.imageFile??null,JSON.stringify(location.imageVariants||[])
      );
    });
    project.scenes.forEach((scene,index)=>{
      upsertScene.run(
        scene.id,project.id,scene.order??index,scene.sourceText,scene.summary,scene.visualDescription,
        scene.locationId??null,scene.imageStatus,scene.selectedImage??null,scene.imageFile??null,
        JSON.stringify(scene.imageVariants||[])
      );
      scene.characterIds.forEach((characterId,order)=>insertSceneCharacter.run(scene.id,characterId,order));
    });
  };
}
