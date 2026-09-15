const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('storyteller', {
  generateImages: (request) => ipcRenderer.invoke('generate-images', request)
});
