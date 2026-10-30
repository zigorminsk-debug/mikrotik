#!/usr/bin/env node
'use strict';
// Windows CI: close parent pipe and require job shutdown and disk cleanup.
const fs = require('fs');
const os = require('os');
const path = require('path');
const {spawn} = require('child_process');
const assert = require('assert');
const helper = process.argv[2];
if (process.platform !== 'win32' || !helper) throw Error('Windows supervisor path required');
const root = fs.mkdtempSync(path.join(os.tmpdir(),'chr-job-test-'));
const dir = fs.mkdtempSync(path.join(root,'session-'));
const disk = path.join(dir, 'disk.img'); fs.writeFileSync(disk,'test');
const cmd = path.join(process.env.SystemRoot, 'System32', 'cmd.exe');
const child = spawn(helper,[disk,cmd,'/d','/c','ping','127.0.0.1','-n','120'],{stdio:['pipe','ignore','ignore'],windowsHide:true});
let timer = setTimeout(() => { child.kill(); console.error('Supervisor timed out'); process.exitCode=1; }, 15000);
child.on('error',e=>{clearTimeout(timer);console.error(e.message);process.exitCode=1;});
child.on('exit',code=>{
  clearTimeout(timer);
  try { assert.strictEqual(code,0); assert(!fs.existsSync(disk)); assert(!fs.existsSync(dir)); console.log('Windows Job Object: parent pipe closure killed child and removed disk.'); }
  catch(e){console.error(e.message);process.exitCode=1;}
  finally {fs.rmSync(root,{recursive:true,force:true});}
});
setTimeout(()=>{ if (child.exitCode !== null || child.signalCode !== null) { console.error('Supervisor exited before parent disconnect'); process.exitCode=1; return; } child.stdin.end(); },1000);
