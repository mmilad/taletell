import { MockImageProvider } from '../../../packages/image-provider/src/index';
import { generateWithPythonWorker } from './worker-client';

const request = {
  mode: 'asset',
  prompt: 'A friendly fox in a children’s storybook forest',
  subject: 'character',
  references: [{ assetId: 'fox-reference', role: 'identity' }],
  variants: 3
} as const;
const provider = process.env.STORYTELLER_USE_WORKER === '1' ? 'flux-worker' : new MockImageProvider();
const result = typeof provider === 'string' ? await generateWithPythonWorker(request) : await provider.generate(request);

console.log(JSON.stringify({ app: 'image-lab', provider: typeof provider === 'string' ? provider : provider.id, variants: result }, null, 2));
