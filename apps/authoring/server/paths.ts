import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function findRepoRoot(start:string) {
  let dir=start;
  for (let i=0;i<10;i++) {
    if (fs.existsSync(path.join(dir,'apps','authoring'))&&fs.existsSync(path.join(dir,'apps','image-lab'))) return dir;
    const parent=path.dirname(dir);
    if (parent===dir) break;
    dir=parent;
  }
  return path.resolve(start,'../..');
}

export const repoRoot=findRepoRoot(path.dirname(fileURLToPath(import.meta.url)));
export const dataDir=process.env.STORYTELLER_DATA||path.join(repoRoot,'data');
export const sqliteFile=process.env.STORYTELLER_SQLITE||path.join(dataDir,'storyteller.sqlite');
export const scratchDir=process.env.STORYTELLER_FLUX_OUTPUT_DIR||path.join(repoRoot,'generated-assets');

export function assetDirFor(databaseFile:string) {
  return path.join(path.dirname(databaseFile),'assets');
}

export function libraryUrl(id:string,variant=0) {
  return `/library/${id}${variant?`-${variant}`:''}.png`;
}

export function ensureDir(dir:string) {
  fs.mkdirSync(dir,{recursive:true});
}

export function resolveAssetFile(ref?:string,extraDirs:string[]=[]) {
  if (!ref||ref.startsWith('data:')||ref.startsWith('blob:')) return undefined;
  const cleaned=decodeURIComponent(ref.split('?')[0]||'');
  if (fs.existsSync(cleaned)&&fs.statSync(cleaned).isFile()) return cleaned;
  const name=cleaned.replace(/\\/g,'/').split('/').pop();
  if (!name) return undefined;
  const candidates=[...extraDirs,assetDirFor(sqliteFile),scratchDir].map(dir=>path.join(dir,name));
  return candidates.find(file=>fs.existsSync(file));
}

export function importAsset(source:string,id:string,libraryDir:string,variant=0) {
  ensureDir(libraryDir);
  const from=path.basename(source);
  const keepName=from.startsWith(`${id}-`)&&from.toLowerCase().endsWith('.png');
  const destName=keepName?from:`${id}-${Date.now().toString(36)}-${variant}.png`;
  const destination=path.join(libraryDir,destName);
  if (path.resolve(source)!==path.resolve(destination)) fs.copyFileSync(source,destination);
  return {filePath:destination,url:`/library/${destName}`};
}
