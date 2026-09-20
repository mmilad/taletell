/// <reference types="vite/client" />
declare module '*.css';
interface Window { storyteller?: { generateImages: (request: unknown) => Promise<{ images: Array<{ id:string; provider:string; filePath?:string; dataUrl?:string; url?:string; metadata?:Record<string,unknown> }>; mode?:string }>; imageStatus?: () => Promise<{ ok:boolean; mode:'real'|'mock'; ready:boolean; model?:string; device?:string; gpu?:string; cuda?:boolean; detail?:string; error?:string }> } }
