/// <reference types="vite/client" />
declare module '*.css';
interface Window { storyteller?: { generateImages: (request: unknown) => Promise<{ images: Array<{ id:string; provider:string; filePath?:string; dataUrl?:string; metadata?:Record<string,unknown> }> }> } }
