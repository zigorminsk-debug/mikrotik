/* CI-only Electron tutorial screenshot. Fake bridge; no VM or network traffic. */
'use strict';
const {app,BrowserWindow}=require('electron'),fs=require('fs'),path=require('path');
app.commandLine.appendSwitch('disable-gpu');
app.whenReady().then(async()=>{
 const win=new BrowserWindow({width:1200,height:1050,show:false,webPreferences:{offscreen:true,sandbox:true,contextIsolation:true,nodeIntegration:false}});
 try{
  await win.loadFile(path.resolve(__dirname,'../windows/www/index.html'));
  await win.webContents.executeJavaScript(`(async()=>{window.routerOS={launch:async()=>({ok:true}),launchClients:async(_id,state)=>({ok:true,clients:[{id:state.devices.find(d=>d.type==='pc').id,address:'192.168.88.100',type:'pc',mode:'dhcp'}]}),ping:async()=>({ok:false,cancelled:true}),pingClient:async()=>({ok:false,cancelled:true})};window.confirm=()=>true;location.hash='lab';await new Promise(r=>setTimeout(r,300));document.getElementById('lab_example_chr_isolated').click();window.Lab.run({instant:true});await new Promise(r=>setTimeout(r,200));document.querySelector('.lab-checked-launch[data-clients]').click();await new Promise(r=>setTimeout(r,200));const button=document.getElementById('lab-matrix-start');if(!button||button.disabled)throw Error('Matrix button not enabled');document.querySelector('.lab-ping-matrix').scrollIntoView({block:'center'});await new Promise(r=>setTimeout(r,500));})()`);
  const img=await win.webContents.capturePage();if(img.isEmpty())throw Error('Empty screenshot');fs.writeFileSync(path.join(process.env.RUNNER_TEMP,'lab-matrix.jpg'),img.toJPEG(35));
 }catch(e){console.error('Screenshot failed:',e.message);process.exitCode=1;}finally{win.destroy();app.quit();}
});
