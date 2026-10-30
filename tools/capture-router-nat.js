/* Capture the real router settings UI on Windows CI. */
'use strict';
const {app, BrowserWindow} = require('electron');
const fs = require('fs');
const path = require('path');
app.commandLine.appendSwitch('disable-gpu');
app.whenReady().then(async () => {
  const win = new BrowserWindow({width:1000,height:900,show:false,webPreferences:{offscreen:true,sandbox:true,contextIsolation:true,nodeIntegration:false}});
  try {
    await win.loadFile(path.resolve(__dirname,'../windows/www/index.html'));
    win.webContents.setZoomFactor(0.85);
    await win.webContents.executeJavaScript(`(async () => {
      location.hash='lab'; await new Promise(r=>setTimeout(r,250));
      const router=Lab.place('router',220,120), server=Lab.place('server',220,300);
      Lab.link(router,server); Lab.select(router); document.getElementById('insp_cfg').click();
      const on = document.getElementById('lm_pub_0_on');
      if (!on || document.getElementById('lab-modal').hidden) throw Error('NAT controls missing');
      on.checked=true; on.dispatchEvent(new Event('change'));
      document.getElementById('lm_pub_0_external').value='8443';
      document.getElementById('lm_pub_0_local').value='443';
      const count=document.getElementById('lm_pub_0_count'); count.value='2'; count.dispatchEvent(new Event('change'));
      document.getElementById('lm_pub_0_extra_1_proto').value='udp';
      document.getElementById('lm_pub_0_extra_1_external').value='5353';
      document.getElementById('lm_pub_0_extra_1_local').value='53';
      on.scrollIntoView({block:'start'}); document.querySelector('#lab-modal .modal-card').scrollTop -= 140; await new Promise(r=>setTimeout(r,700));
    })()`);
    const image=await win.webContents.capturePage();
    if (image.isEmpty()) throw Error('Capture is empty');
    fs.writeFileSync(path.join(process.env.RUNNER_TEMP,'router-nat.jpg'),image.toJPEG(65));
  } catch(e) { console.error('Capture failed:',e.message); process.exitCode=1; }
  finally {win.destroy();app.quit();}
});
