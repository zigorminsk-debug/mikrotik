/* Electron tutorial only, no live WinBox or CHR. */
'use strict';
const {app,BrowserWindow}=require('electron'),fs=require('fs'),path=require('path');
app.commandLine.appendSwitch('disable-gpu');
app.whenReady().then(async()=>{
 const win=new BrowserWindow({width:1400,height:1000,show:false,webPreferences:{offscreen:true,sandbox:true,contextIsolation:true,nodeIntegration:false}});
 try{
  await win.loadFile(path.resolve(__dirname,'../windows/www/index.html'));
  for(const [section,tab,field,kind] of [['ros-ppp','OVPN Servers','Certificate / Require Client Certificate','ready'],['ros-bridge','MDB','Group','detail']]){
   await win.webContents.executeJavaScript(`(async()=>{location.hash=${JSON.stringify(section)};await new Promise(r=>setTimeout(r,400));const tab=[...document.querySelectorAll('.wb-tab')].find(x=>x.textContent===${JSON.stringify(tab)});if(!tab)throw Error('Missing tab');tab.click();const panel=document.getElementById(tab.getAttribute('aria-controls'));if(panel.hidden)throw Error('Hidden panel');const item=[...panel.querySelectorAll('.wb-field')].find(x=>x.querySelector('summary').textContent===${JSON.stringify(field)});if(!item)throw Error('Missing field');item.open=true;item.scrollIntoView({block:'start'});window.scrollBy(0,-70);await new Promise(r=>setTimeout(r,500));})()`);
   const img=await win.webContents.capturePage();if(img.isEmpty())throw Error('Empty screenshot');fs.writeFileSync(path.join(process.env.RUNNER_TEMP,'guide-lab-'+kind+'.jpg'),img.toJPEG(35));
  }
 }catch(e){console.error('Tutorial capture failed:',e.message);process.exitCode=1;}finally{win.destroy();app.quit();}
});
