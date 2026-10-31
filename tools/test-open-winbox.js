#!/usr/bin/env node
'use strict';
const assert=require('assert'),{EventEmitter}=require('events');
const {openWinbox}=require('../windows/physical/open-winbox');
(async()=>{
 let picked={canceled:true},choice=0,real='C:\\Official\\WinBox.exe',stopped=false,isFile=true,spawnError=false;
 const dialogs=[],runs=[];
 const dialog={showOpenDialog:async(_w,opts)=>{dialogs.push(opts);return picked;},showMessageBox:async(_w,opts)=>{dialogs.push(opts);return {response:choice};}};
 const fs={realpath:async()=>real,stat:async()=>({isFile:()=>isFile})};
 function spawn(...args){runs.push(args);const p=new EventEmitter();p.unref=()=>{p.unrefed=true;};process.nextTick(()=>p.emit(spawnError?'error':'spawn',new Error('safe test')));return p;}
 const call=()=>openWinbox({dialog,owner:{},fs,spawn,isStopped:()=>stopped});
 assert((await call()).cancelled);assert.equal(runs.length,0);
 picked={canceled:false,filePaths:['C:\\temp\\calc.exe']};assert(!(await call()).ok);assert.equal(runs.length,0);
 picked={canceled:false,filePaths:['\\\\server\\share\\WinBox.exe']};real='\\\\server\\share\\WinBox.exe';assert(!(await call()).ok);assert.equal(runs.length,0);
 picked={canceled:false,filePaths:['C:\\Official\\WinBox.exe']};real='C:\\Official\\WinBox.exe';choice=0;assert((await call()).cancelled);assert.equal(runs.length,0);
 assert.equal(dialogs.at(-1).defaultId,0);assert(dialogs.at(-1).detail.includes('не проверяет подлинность'));assert(dialogs.at(-1).detail.includes('не отправит настройки'));
 choice=1;assert((await call()).ok);assert.equal(runs.length,1);assert.equal(runs[0][0],real);assert.deepEqual(runs[0][1],[]);assert.equal(runs[0][2].shell,false);
 real='\\\\server\\share\\WinBox.exe';assert(!(await call()).ok);assert.equal(runs.length,1);
 real='C:\\Official\\WinBox.exe';isFile=false;assert(!(await call()).ok);assert.equal(runs.length,1);
 isFile=true;stopped=true;assert((await call()).cancelled);assert.equal(runs.length,1);
 stopped=false;spawnError=true;assert(!(await call()).ok);assert.equal(runs.length,2);
 console.log('Внешний WinBox: доверенный путь выбирается пользователем, отмена по умолчанию, без аргументов и секретов.');
})().catch(e=>{console.error(e);process.exitCode=1;});
