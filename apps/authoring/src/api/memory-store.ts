import type { Project } from '../domain';
import { mergeStory, summarizeStory, type DbController } from './store';

/** In-memory DbController for tests and STORYTELLER_STORE=memory. */
export function createMemoryStore(seed:Project[]=[]):DbController {
  const stories=new Map<string,Project>(seed.map(project=>[project.id,project]));
  return {
    async listStories() {
      return [...stories.values()].map(summarizeStory).sort((left,right)=>right.updatedAt.localeCompare(left.updatedAt));
    },
    async getStory(id) {
      return stories.get(id);
    },
    async saveStory(project) {
      const next=mergeStory(stories.get(project.id),project);
      stories.set(next.id,next);
      return next;
    },
    async deleteStory(id) {
      return stories.delete(id);
    }
  };
}
