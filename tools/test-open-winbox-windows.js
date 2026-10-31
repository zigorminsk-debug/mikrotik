#!/usr/bin/env node
'use strict';
// Windows CI only: the selected executable is an inert test stub, not WinBox.
const assert=require('assert'),fs=require('fs').promises,path=require('path'),{spawn}=require('child_process');
const {openWinbox}=require('../windows/physical/open-winbox');
(async()=>{
 const target=path.resolve(process.argv[2]||''),marker=path.resolve(process.argv[3]||'');
 if(process.platform!=='win32'||path.basename(target).toLowerCase()!=='winbox.exe')throw Error('Invalid CI parameters');
 process.env.WB_CI_MARKER=marker;
 const dialog={showOpenDialog:async()=>({canceled:false,filePaths:[target]}),showMessageBox:async()=>({response:1})};
 const result=await openWinbox({dialog,owner:null,fs,spawn,isStopped:()=>false});assert(result.ok);
 let contents=null;
 for(let i=0;i<100;i++){try{contents=await fs.readFile(marker,'utf8');break;}catch(e){if(e.code!=='ENOENT')throw e;await new Promise(r=>setTimeout(r,100));}}
 assert.equal(contents,'no-arguments');await fs.unlink(marker);
 console.log('::notice title=Windows launcher integration::A local inert WinBox.exe stub was started without arguments. No official WinBox, network or router was used.');
})().catch(()=>{console.log('::error title=Windows launcher integration::Local stub did not start as expected');process.exitCode=1;});
