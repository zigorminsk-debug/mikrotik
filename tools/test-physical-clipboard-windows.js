/* Windows CI: real Electron IPC and the runner's disposable clipboard, no network. */
'use strict';
const {app,BrowserWindow,clipboard}=require('electron');
const path=require('path'),os=require('os');
app.commandLine.appendSwitch('disable-gpu');
app.setPath('userData',path.join(os.tmpdir(),'mikrotik-physical-clipboard-ci'));
require('../windows/main.js');
(async()=>{
 try {
  await app.whenReady();
  let win;
  for(let n=0;n<100;n++){win=BrowserWindow.getAllWindows()[0];if(win && !win.webContents.isLoading())break;await new Promise(r=>setTimeout(r,100));}
  if(!win||win.webContents.isLoading())throw Error('Main window not ready');
  clipboard.writeText('CI_BEFORE');
  const result=await win.webContents.executeJavaScript(`(async()=>{
   location.hash='lab';await new Promise(r=>setTimeout(r,300));
   const id=Lab.place('router',200,120);Lab.openSettings(id);await new Promise(r=>setTimeout(r,200));
   const input=document.getElementById('lm_manual_mac'),button=document.getElementById('lm_copy_mac'),status=document.getElementById('lm_copy_mac_status');
   if(!input||!button||button.disabled)throw Error('Control unavailable');
   input.value='02:aa:bb:cc:dd:ee';input.dispatchEvent(new Event('input',{bubbles:true}));button.click();
   for(let i=0;i<50&&!status.textContent.includes('скопирован');i++)await new Promise(r=>setTimeout(r,50));
   return status.textContent;
  })()`);
  if(!result.includes('скопирован')||clipboard.readText()!=='02:AA:BB:CC:DD:EE')throw Error('Clipboard did not receive MAC');
  const bad=await win.webContents.executeJavaScript(`window.routerOS.copyPhysicalMac('FF:FF:FF:FF:FF:FF')`);
  if(bad.ok||clipboard.readText()!=='02:AA:BB:CC:DD:EE')throw Error('Invalid MAC altered clipboard');
  console.log('::notice title=Manual MAC IPC::Real Windows Electron renderer and IPC copied a synthetic MAC; invalid address rejected. No network or WinBox.');
 } catch(e) { console.error('Clipboard integration failed:',e.message);process.exitCode=1; }
 finally {clipboard.clear();for(const w of BrowserWindow.getAllWindows())w.destroy();app.quit();}
})();
