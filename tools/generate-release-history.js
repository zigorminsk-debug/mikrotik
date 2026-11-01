#!/usr/bin/env node
'use strict';
// Offline, deterministic copy of the committed Russian release notes. This is
// bundled in the application; it does not request GitHub or execute Markdown.
const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..'),dir=path.join(root,'docs','releases'),out=path.join(root,'app','js','release-history.js');
const files=fs.readdirSync(dir).filter(name=>/^\d+\.\d+\.\d+\.md$/.test(name));
const version=name=>name.replace(/\.md$/,'').split('.').map(Number);
files.sort((a,b)=>{const x=version(a),y=version(b);for(let i=0;i<3;i++)if(x[i]!==y[i])return y[i]-x[i];return 0;});
function plain(text){return text.replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g,'$1').replace(/\*\*/g,'').replace(/`/g,'').trim();}
function parse(text){
 const entries=[];let paragraph=[];
 const flush=()=>{if(paragraph.length){entries.push({kind:'text',text:plain(paragraph.join(' '))});paragraph=[];}};
 for(const line of text.replace(/\r\n/g,'\n').split('\n')){
  const heading=/^#{1,6}\s+(.+)$/.exec(line),bullet=/^\s*[-*]\s+(.+)$/.exec(line);
  if(!line.trim()){flush();continue;}
  if(heading){flush();entries.push({kind:'heading',text:plain(heading[1])});}
  else if(bullet){flush();entries.push({kind:'bullet',text:plain(bullet[1])});}
  else paragraph.push(line.trim());
 }
 flush();return entries.filter(e=>e.text);
}
const history=files.map(file=>({version:file.slice(0,-3),entries:parse(fs.readFileSync(path.join(dir,file),'utf8'))}));
const current=/window\.APP_VERSION\s*=\s*'([^']+)'/.exec(fs.readFileSync(path.join(root,'app','js','version.js'),'utf8'));
if(!current || !history.some(item=>item.version===current[1]))throw Error('Нет описания текущей версии в docs/releases');
if(history.some(item=>!item.entries.length))throw Error('Описание версии не должно быть пустым');
const output='/* Создано из docs/releases командой node tools/generate-release-history.js. */\nwindow.RELEASE_HISTORY = '+JSON.stringify(history,null,2)+';\n';
if(process.argv.includes('--check')){
 if(!fs.existsSync(out)||fs.readFileSync(out,'utf8')!==output){console.error('История версий устарела: node tools/generate-release-history.js');process.exitCode=1;}
 else console.log('История версий актуальна.');
}else{fs.writeFileSync(out,output);console.log('История версий: '+history.length+' записей.');}
