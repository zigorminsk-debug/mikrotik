/* CI-only screenshots of the actual Windows Electron UI. No VM or network is
   started; the example contains only synthetic documentation addresses. */
'use strict';
const {app,BrowserWindow}=require('electron'),fs=require('fs'),path=require('path');
app.commandLine.appendSwitch('disable-gpu');
app.whenReady().then(async()=>{
 const win=new BrowserWindow({width:1200,height:850,show:false,webPreferences:{offscreen:true,sandbox:true,contextIsolation:true,nodeIntegration:false}});
 try{
  await win.loadFile(path.resolve(__dirname,'../windows/www/index.html'));
  await win.webContents.executeJavaScript(`(async()=>{
   location.hash='lab';await new Promise(r=>setTimeout(r,300));
   const btn=document.getElementById('lab_example_chr_isolated');if(!btn)throw Error('Example button missing');
   btn.click();if(Lab.state.devices.length!==3||Lab.state.links.length!==2)throw Error('Unexpected diagram');
   btn.scrollIntoView({block:'start'});await new Promise(r=>setTimeout(r,600));
  })()`);
  let img=await win.webContents.capturePage();if(img.isEmpty())throw Error('Empty diagram screenshot');
  fs.writeFileSync(path.join(process.env.RUNNER_TEMP,'chr-isolated-diagram.jpg'),img.toJPEG(40));
  await win.webContents.executeJavaScript(`(async()=>{
   const router=Lab.state.devices.find(x=>x.type==='router');if(!router)throw Error('No router');
   Lab.openSettings(router.id);const btn=document.getElementById('lm_open_chr');
   if(!btn||document.getElementById('lab-modal').hidden)throw Error('No RouterOS button');
   btn.scrollIntoView({block:'center'});await new Promise(r=>setTimeout(r,600));
  })()`);
  img=await win.webContents.capturePage();if(img.isEmpty())throw Error('Empty settings screenshot');
  fs.writeFileSync(path.join(process.env.RUNNER_TEMP,'chr-isolated-settings.jpg'),img.toJPEG(40));
  console.log('Captured example and settings; no virtual machine launched.');
 }catch(e){console.error('Screenshot failed:',e.message);process.exitCode=1;}finally{win.destroy();app.quit();}
});
