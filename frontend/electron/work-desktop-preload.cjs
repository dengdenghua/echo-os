const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('workDesktop',{launch:(name)=>ipcRenderer.invoke('work:launch',name)});
