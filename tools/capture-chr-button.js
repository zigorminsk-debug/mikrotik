/* Windows CI: a full, unaltered capture of the application's real settings UI. */
'use strict';
const {app, BrowserWindow} = require('electron');
const fs = require('fs');
const path = require('path');
app.commandLine.appendSwitch('disable-gpu');
app.whenReady().then(async () => {
  const win = new BrowserWindow({width:1100,height:800,show:false,webPreferences:{offscreen:true,sandbox:true,contextIsolation:true,nodeIntegration:false}});
  try {
    await win.loadFile(path.resolve(__dirname,'../windows/www/index.html'));
    await win.webContents.executeJavaScript(`(async () => {
      location.hash='lab'; await new Promise(r=>setTimeout(r,250));
      const id=Lab.place('router',220,120); Lab.select(id);
      document.getElementById('insp_cfg').click();
      if (!document.getElementById('lm_open_chr') || document.getElementById('lab-modal').hidden) throw Error('RouterOS button not visible');
      await new Promise(r=>setTimeout(r,500));
    })()`);
    const image = await win.webContents.capturePage();
    if (image.isEmpty()) throw Error('Capture is empty');
    const out = path.join(process.env.RUNNER_TEMP,'chr-button.jpg');
    fs.writeFileSync(out, image.toJPEG(88));
    console.log('Captured actual application window:', out);
  } catch (e) { console.error('Capture failed:',e.message); process.exitCode=1; }
  finally {win.destroy();app.quit();}
});
