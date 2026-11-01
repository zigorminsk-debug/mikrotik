/* CI-only screenshot of Windows app with synthetic scheme, without CHR or network. */
'use strict';
const {app,BrowserWindow}=require('electron'),fs=require('fs'),path=require('path');
app.commandLine.appendSwitch('disable-gpu');
app.whenReady().then(async()=>{
 const win=new BrowserWindow({width:1200,height:850,show:false,webPreferences:{offscreen:true,sandbox:true,contextIsolation:true,nodeIntegration:false}});
 try{
  await win.loadFile(path.resolve(__dirname,'../windows/www/index.html'));
  await win.webContents.executeJavaScript(`(async()=>{
   location.hash='lab';await new Promise(r=>setTimeout(r,300));document.getElementById('lab_example_chr_isolated').click();
   const isp=Lab.state.devices.find(x=>x.type==='isp');if(!isp)throw Error('No provider');Lab.openSettings(isp.id);
   const kind=document.getElementById('lm_kind');if(!kind)throw Error('No WAN type');kind.value='dhcp';kind.dispatchEvent(new Event('change',{bubbles:true}));
   kind.scrollIntoView({block:'center'});await new Promise(r=>setTimeout(r,600));
  })()`);
  const img=await win.webContents.capturePage();if(img.isEmpty())throw Error('Empty capture');fs.writeFileSync(path.join(process.env.RUNNER_TEMP,'chr-dhcp-settings.jpg'),img.toJPEG(35));
 }catch(e){console.error('Screenshot failed:',e.message);process.exitCode=1;}finally{win.destroy();app.quit();}
});
