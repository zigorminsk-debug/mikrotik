'use strict';
// Actual Electron/Windows native warning from the production options. The
// disposable capture does not launch a CHR; the operator is automated in CI.
const {app,BrowserWindow,dialog}=require('electron');
const path=require('path');
const {networkWarning}=require('../windows/chr/network-warning');
app.whenReady().then(async()=>{
 const win=new BrowserWindow({width:1100,height:800,show:true,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
 try {
  await win.loadFile(path.join(__dirname,'../windows/www/index.html'));
  await win.webContents.executeJavaScript("location.hash='lab'; document.getElementById('lab_example').click();");
  const result=await dialog.showMessageBox(win,networkWarning());
  if(result.response!==0)throw Error('Capture must cancel the online session');
  console.log('Native online warning shown and cancelled. No CHR was started.');
 } catch(e){console.error(e);process.exitCode=1;} finally {win.destroy();app.quit();}
});
