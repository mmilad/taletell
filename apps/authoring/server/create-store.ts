import { createMemoryStore } from '../src/api/memory-store.ts';
import type { DbController } from '../src/api/store.ts';
import { sqliteFile } from './paths.ts';
import { createSqliteStore } from './sqlite-store.ts';
/** Build the active DbController. Set STORYTELLER_STORE=postgres later and implement that adapter. */
export function createDbController():DbController {
  const kind=(process.env.STORYTELLER_STORE||'sqlite').toLowerCase();
  if (kind==='memory') return createMemoryStore();
  const filePath=process.env.STORYTELLER_SQLITE||sqliteFile;
  return createSqliteStore(filePath);
}

export const createProjectStore=createDbController;
