/* Captures the tutorial UI, not a live WinBox window or VPN. */
'use strict';
const {app,BrowserWindow}=require('electron'),fs=require('fs'),path=require('path');
app.commandLine.appendSwitch('disable-gpu');
app.whenReady().then(async()=>{
 const win=new BrowserWindow({width:1400,height:1000,show:false,webPreferences:{offscreen:true,sandbox:true,contextIsolation:true,nodeIntegration:false}});
 try{
  await win.loadFile(path.resolve(__dirname,'../windows/www/index.html'));
  await win.webContents.executeJavaScript(`(async()=>{location.hash='ros-wireguard';await new Promise(r=>setTimeout(r,300));const tabs=[...document.querySelectorAll('.wb-tab')];if(tabs.length!==2||tabs[1].textContent!=='Peers')throw Error('Missing tabs');tabs[1].click();const panel=document.getElementById(tabs[1].getAttribute('aria-controls'));if(panel.hidden||!panel.querySelector('img'))throw Error('Missing panel or WinBox image');panel.querySelector('h2').scrollIntoView({block:'start'});window.scrollBy(0,-65);await new Promise(r=>setTimeout(r,600));})()`);
  let img=await win.webContents.capturePage();if(img.isEmpty())throw Error('Empty screenshot');fs.writeFileSync(path.join(process.env.RUNNER_TEMP,'guide-lab-ready.jpg'),img.toJPEG(35));
  await win.webContents.executeJavaScript(`(async()=>{const panel=document.querySelector('.wb-tab-panel:not([hidden])');const item=[...panel.querySelectorAll('.wb-field')].find(x=>x.querySelector('summary').textContent==='Allowed Address');if(!item)throw Error('No Allowed Address');item.open=true;item.scrollIntoView({block:'start'});window.scrollBy(0,-70);await new Promise(r=>setTimeout(r,500));})()`);
  img=await win.webContents.capturePage();if(img.isEmpty())throw Error('Empty detail');fs.writeFileSync(path.join(process.env.RUNNER_TEMP,'guide-lab-detail.jpg'),img.toJPEG(35));
 }catch(e){console.error('Tutorial capture failed:',e.message);process.exitCode=1;}finally{win.destroy();app.quit();}
});
