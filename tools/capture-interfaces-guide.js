/* Screenshot of the application tutorial, not WinBox and not CHR. */
'use strict';
const {app,BrowserWindow}=require('electron'),fs=require('fs'),path=require('path');
app.commandLine.appendSwitch('disable-gpu');
app.whenReady().then(async()=>{
 const win=new BrowserWindow({width:1400,height:950,show:false,webPreferences:{offscreen:true,sandbox:true,contextIsolation:true,nodeIntegration:false}});
 try{
  await win.loadFile(path.resolve(__dirname,'../windows/www/index.html'));
  await win.webContents.executeJavaScript(`(async()=>{location.hash='ros-interfaces';await new Promise(r=>setTimeout(r,300));const tabs=[...document.querySelectorAll('.wb-tab')];if(tabs.length!==13||tabs[6].textContent!=='VLAN')throw Error('Missing tabs');tabs[6].click();const panel=document.getElementById(tabs[6].getAttribute('aria-controls'));if(panel.hidden)throw Error('Panel not shown');const d=[...panel.querySelectorAll('details')].find(x=>x.querySelector('summary').textContent==='VLAN ID');if(!d)throw Error('Missing VLAN ID');d.open=true;document.querySelector('.wb-guide').scrollIntoView({block:'start'});await new Promise(r=>setTimeout(r,600));})()`);
  const img=await win.webContents.capturePage();if(img.isEmpty())throw Error('Empty screenshot');fs.writeFileSync(path.join(process.env.RUNNER_TEMP,'guide-lab-ready.jpg'),img.toJPEG(35));
 }catch(e){console.error('Screenshot failed:',e.message);process.exitCode=1;}finally{win.destroy();app.quit();}
});
