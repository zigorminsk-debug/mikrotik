'use strict';
// Genuine native dialog with production options, a fake pathname and Cancel.
const {app,BrowserWindow,dialog}=require('electron');
const path=require('path');
const {winboxWarning}=require('../windows/physical/open-winbox');
app.whenReady().then(async()=>{
 const win=new BrowserWindow({width:1100,height:800,show:true,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
 try {
  await win.loadFile(path.join(__dirname,'../windows/www/index.html'));
  await win.webContents.executeJavaScript("location.hash='lab'; document.getElementById('lab_example').click();");
  const result=await dialog.showMessageBox(win,winboxWarning('C:\\Example\\WinBox.exe'));
  if(result.response!==0)throw Error('Capture must cancel WinBox launch');
  console.log('Native WinBox warning shown and cancelled. No WinBox was started.');
 } catch(e){console.error(e);process.exitCode=1;} finally {win.destroy();app.quit();}
});
