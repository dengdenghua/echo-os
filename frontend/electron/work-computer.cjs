// Separate Linux display/profile. No backend, model or desktop-owner login here.
const { app, BrowserWindow, session, desktopCapturer, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { pathToFileURL } = require('node:url');
const root = process.env.ECHO_WORK_COMPUTER_DIR;
if (process.platform !== 'linux' || !root || !path.isAbsolute(root)) throw Error('Invalid work computer');
app.setPath('userData', path.join(root, 'profile'));
app.disableHardwareAcceleration();
const {spawn,execFileSync}=require('node:child_process');
let win, desktop, server; const children=[];
const workspace=path.join(root,'workspace');fs.mkdirSync(workspace,{recursive:true});
const desktopURL=pathToFileURL(path.join(__dirname,'work-desktop.html')).href;
const nativeKey={Enter:'Return',ArrowLeft:'Left',ArrowRight:'Right',ArrowUp:'Up',ArrowDown:'Down',SelectAll:'ctrl+a',Backspace:'BackSpace',PageUp:'Prior',PageDown:'Next'};
const xdo=(...args)=>execFileSync('xdotool',args,{timeout:3000,encoding:'utf8'});
function launch(name){
 if(name==='browser'||name==='notes'){win.show();win.focus();if(name==='notes')return win.loadURL(home);return;}
 const commands={terminal:['/usr/bin/konsole',['--separate','--workdir',workspace]],files:['/usr/bin/dolphin',['--new-window',workspace]]};
 if(!commands[name])throw Error('未知应用');const [bin,args]=commands[name];if(!fs.existsSync(bin))throw Error('应用未安装');children.push(spawn(bin,args,{cwd:workspace,stdio:'ignore'}));
}

const home = pathToFileURL(path.join(__dirname, 'work-computer.html')).href;
const allowed = (url) => url === home || /^https?:\/\//i.test(url);
const keys = new Set(['Tab','Enter','Backspace','Delete','Escape','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown']);
async function command(c) {
  const wc = win.webContents;
  if (c.action === 'frame') {const screens=await desktopCapturer.getSources({types:['screen'],thumbnailSize:{width:1280,height:720}});if(!screens[0])throw Error('工作显示器不可用');return {ok:true,image:screens[0].thumbnail.toJPEG(72).toString('base64')};}
  if (c.action === 'launch') {await launch(c.text);return {ok:true,app:c.text};}
  if (c.action === 'home') {await wc.loadURL(home);win.show();win.focus();}
  else if (c.action === 'navigate') {
    const url = new URL(c.url);
    if (!['http:','https:'].includes(url.protocol) || url.username || url.password) throw Error('只允许 HTTP / HTTPS 网页');
    win.show();win.focus();await wc.loadURL(url.href);
  } else if (c.action === 'click') {
    let x=c.x, y=c.y;
    if (Number.isInteger(c.element) && c.element >= 0) {
      const point = await wc.executeJavaScript(`(() => { const e = window.__echoElements?.[${c.element}]; if(!e || !e.isConnected) return null; e.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'}); const r=e.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
      if (!point) throw Error('页面已更新，请重新查看');
      const bounds=win.getContentBounds();x=point.x+bounds.x;y=point.y+bounds.y;win.focus();
    }
    if (!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>=1280||y<0||y>=720) throw Error('无效坐标');
    // --sync waits for motion and can hang when clicking the same position again.
    xdo('mousemove',String(Math.round(x)),String(Math.round(y)),'click','1');
    await new Promise(resolve=>setTimeout(resolve,80));
  } else if(c.action === 'text') {
    if(typeof c.text !== 'string'||c.text.length>8000) throw Error('输入过长');
    if(win.isFocused())await wc.insertText(c.text);else {execFileSync('xclip',['-selection','clipboard'],{input:c.text,timeout:3000,stdio:['pipe','ignore','ignore']});const title=xdo('getactivewindow','getwindowname');xdo('key','--clearmodifiers',/konsole/i.test(title)?'ctrl+shift+v':'ctrl+v');}
  } else if(c.action === 'key') {
    if(!keys.has(c.key) && c.key!=='SelectAll')throw Error('不支持此按键');
    xdo('key','--clearmodifiers',nativeKey[c.key]||c.key);
    await new Promise(resolve=>setTimeout(resolve,80));
  } else if(c.action !== 'inspect') throw Error('不支持此操作');
  // DOM reads are observations, never evaluation supplied by the model/client.
  const observation = await wc.executeJavaScript(`(() => {
    const els=[...document.querySelectorAll('a,button,input,textarea,select,[contenteditable="true"]')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.height;}).slice(0,60);
    window.__echoElements=els;
    const active=document.activeElement;
    const focusedEditable=Boolean(active && (active.matches('textarea,input:not([type]),input[type=text],input[type=search],input[type=email],input[type=url],input[type=password],input[type=tel],input[type=number]') || active.isContentEditable));
    return {focusedEditable,text:document.body.innerText.slice(0,10000),elements:els.map((e,id)=>({id,tag:e.tagName,label:(e.getAttribute('aria-label')||e.placeholder||e.innerText||e.name||'').slice(0,120),value:e.type==='password'?'[private]':String(e.value??'').slice(0,1200)}))};
  })()`);
  const activeWindow=xdo('getactivewindow','getwindowname').trim();
  return {ok:true,title:wc.getTitle(),url:wc.getURL(),activeWindow,browserFocused:win.isFocused(),...observation,focusedEditable:win.isFocused() && observation.focusedEditable};
}
app.whenReady().then(async()=>{
  session.defaultSession.setPermissionRequestHandler((_w,_p,cb)=>cb(false));
  session.defaultSession.on('will-download',e=>e.preventDefault());
  // Theme only this private display; retain the distro's keyboard/mouse bindings.
  const themeDir=path.join(process.env.XDG_DATA_HOME,'themes/EchoWork/openbox-3');
  fs.mkdirSync(themeDir,{recursive:true});
  fs.copyFileSync(path.join(__dirname,'work-openbox.theme'),path.join(themeDir,'themerc'));
  const wmConfig=path.join(root,'openbox.xml');
  const distroConfig=fs.readFileSync('/etc/xdg/openbox/rc.xml','utf8');
  const themeConfig='<theme><name>EchoWork</name><titleLayout>ILC</titleLayout><keepBorder>yes</keepBorder><animateIconify>no</animateIconify>'+['ActiveWindow','InactiveWindow'].map(place=>`<font place="${place}"><name>sans</name><size>12</size><weight>normal</weight><slant>normal</slant></font>`).join('')+'</theme>';
  fs.writeFileSync(wmConfig,distroConfig.replace(/<theme>[\s\S]*?<\/theme>/,themeConfig).replace(/<margins>[\s\S]*?<\/margins>/,'<margins><top>42</top><bottom>104</bottom><left>24</left><right>24</right></margins>'));
  children.push(spawn('/usr/bin/openbox',['--config-file',wmConfig],{stdio:'ignore'}));
  desktop=new BrowserWindow({width:1280,height:720,x:0,y:0,type:'desktop',frame:false,resizable:false,show:true,webPreferences:{preload:path.join(__dirname,'work-desktop-preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true}});
  await desktop.loadURL(desktopURL);
  ipcMain.handle('work:launch',(event,name)=>{if(event.sender!==desktop.webContents || event.senderFrame.url!==desktopURL)throw Error('Forbidden');return launch(name);});
  win=new BrowserWindow({width:1072,height:536,x:104,y:54,frame:true,resizable:true,show:true,autoHideMenuBar:true,
    webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,devTools:false}});
  win.setMenu(null);
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',(e,url)=>{if(!allowed(url))e.preventDefault();});
  win.webContents.on('will-redirect',(e,url)=>{if(!allowed(url))e.preventDefault();});
  win.on('close',e=>{if(!app.isQuitting){e.preventDefault();win.hide();}});
  await win.loadURL(home);
  const sock=path.join(root,'browser.sock');
  if(fs.existsSync(sock))fs.unlinkSync(sock);
  server=net.createServer(client=>{
    let data='',used=false;
    client.setTimeout(25000,()=>client.destroy());
    client.on('error',()=>{});
    client.on('data',chunk=>{
      if(used)return;
      data+=chunk;
      if(data.length>40000){client.destroy();return;}
      if(!data.includes('\n'))return;
      used=true;
      Promise.resolve().then(()=>command(JSON.parse(data))).then(r=>client.end(JSON.stringify(r)+'\n')).catch(e=>client.end(JSON.stringify({ok:false,error:e.message})+'\n'));
    });
  });
  server.listen(sock,()=>fs.chmodSync(sock,0o600));
});
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',()=>{app.isQuitting=true;});
app.on('will-quit',()=>{server?.close();for(const child of children)child.kill();});
