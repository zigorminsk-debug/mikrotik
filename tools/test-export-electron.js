/* Windows CI: exercise export with real Chromium canvas, not jsdom. */
'use strict';
const {app,BrowserWindow,nativeImage}=require('electron');
const path=require('path'),assert=require('assert'),fs=require('fs');
const {parseGIF,decompressFrames}=require('./node_modules/gifuct-js');
app.commandLine.appendSwitch('disable-gpu');
app.whenReady().then(async()=>{
  const win=new BrowserWindow({width:1000,height:720,show:false,webPreferences:{offscreen:true,sandbox:true,contextIsolation:true,nodeIntegration:false}});
  try {
    await win.loadFile(path.join(__dirname,'../windows/www/index.html'));
    const result=await win.webContents.executeJavaScript(`(async () => {
      location.hash='lab'; await new Promise(r=>setTimeout(r,100));
      window.LAB_INSTANT=true; document.getElementById('lab_example').click();
      document.getElementById('lab_run').click();
      const board=document.getElementById('lab-canvas');
      // Render uses the same icons as the live application; the test drives the buttons
      // by intercepting the trusted Windows save bridge below in a separate step.
      const iconHtml={}; for(const n of board.querySelectorAll('.lab-dev')) {
        const t=Array.from(n.classList).find(c=>c.startsWith('t-')).slice(2);
        iconHtml[t]=n.querySelector('.lab-ico').innerHTML;
      }
      const png=await LabExport.render(board,iconHtml,'png');
      const gif=await LabExport.render(board,iconHtml,'gif');
      return {png:Array.from(new Uint8Array(await png.arrayBuffer())),gif:Array.from(new Uint8Array(await gif.arrayBuffer())),width:board.clientWidth,height:board.clientHeight,flows:board.querySelectorAll('.lab-flow').length};
    })()`);
    fs.writeFileSync(path.join(process.env.RUNNER_TEMP,'diagram-export-ui.jpg'),(await win.webContents.capturePage()).toJPEG(55));
    assert(result.flows>0,'No modeled active path');
    const png=Buffer.from(result.png); assert(png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])));
    const image=nativeImage.createFromBuffer(png); assert(!image.isEmpty()); const size=image.getSize(); assert.equal(size.width,result.width);assert.equal(size.height,result.height);
    const gif=Buffer.from(result.gif);assert.equal(gif.subarray(0,6).toString(),'GIF89a');
    const parsed=parseGIF(gif);const frames=decompressFrames(parsed,true);assert.equal(frames.length,10);assert(frames.every(f=>f.delay===80));
    assert(frames[0].patch.some((v,i)=>v!==frames[5].patch[i]),'Animation frames must actually differ');
    console.log(`Windows Electron export: PNG ${size.width}x${size.height}, GIF ${frames.length} animated frames; simulated paths ${result.flows}.`);
  } catch(e) {console.error(e);process.exitCode=1;} finally {win.destroy();app.quit();}
});
