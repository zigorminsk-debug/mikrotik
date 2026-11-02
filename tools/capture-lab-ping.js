/* Windows tutorial screenshot of a mocked bridge. Does not start CHR or ping. */
'use strict';
const {app,BrowserWindow}=require('electron'),fs=require('fs'),path=require('path');
app.commandLine.appendSwitch('disable-gpu');
app.whenReady().then(async()=>{
 const win=new BrowserWindow({width:1200,height:1050,show:false,webPreferences:{offscreen:true,sandbox:true,contextIsolation:true,nodeIntegration:false}});
 try{
  await win.loadFile(path.resolve(__dirname,'../windows/www/index.html'));
  await win.webContents.executeJavaScript(`(async()=>{window.routerOS={launch:async()=>({ok:true}),launchClients:async(_router,state)=>({ok:true,clients:[{id:state.devices.find(d=>d.type==='pc').id,address:'192.168.88.100',type:'pc',mode:'dhcp'}]}),ping:async()=>({ok:false,cancelled:true}),pingClient:async()=>({ok:false,cancelled:true})};window.confirm=()=>true;location.hash='lab';await new Promise(r=>setTimeout(r,300));document.getElementById('lab_example_chr_isolated').click();window.Lab.run({instant:true});await new Promise(r=>setTimeout(r,150));const launch=document.querySelector('.lab-checked-launch[data-clients]');if(!launch)throw Error('Missing client launch');launch.click();await new Promise(r=>setTimeout(r,100));const panel=document.querySelector('#lab-checked-chr');if(!panel||!panel.querySelector('#lab-ping-run')||panel.querySelector('#lab-ping-run').disabled)throw Error('Missing controls');const source=panel.querySelector('#lab-ping-source');source.value=window.Lab.state.devices.find(d=>d.type==='pc').id;panel.scrollIntoView({block:'start'});window.scrollBy(0,-90);await new Promise(r=>setTimeout(r,600));})()`);
  const img=await win.webContents.capturePage();if(img.isEmpty())throw Error('Empty screenshot');fs.writeFileSync(path.join(process.env.RUNNER_TEMP,'guide-lab-ready.jpg'),img.toJPEG(35));
  await win.webContents.executeJavaScript(`(async()=>{const panel=document.querySelector('.lab-ping');document.getElementById('lab-ping-target').value='192.168.88.1';panel.scrollIntoView({block:'start'});window.scrollBy(0,-75);await new Promise(r=>setTimeout(r,500));})()`);
  const detail=await win.webContents.capturePage();if(detail.isEmpty())throw Error('Empty ping screenshot');fs.writeFileSync(path.join(process.env.RUNNER_TEMP,'guide-lab-detail.jpg'),detail.toJPEG(35));
 }catch(e){console.error('Screenshot failed:',e.message);process.exitCode=1;}finally{win.destroy();app.quit();}
});
