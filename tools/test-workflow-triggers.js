#!/usr/bin/env node
'use strict';
// Guard against a tag launching every slow research workflow: GitHub does not
// evaluate push paths filters on tags. Relevant changes still trigger on branch
// pushes and each specialised workflow remains available by manual dispatch.
const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.join(__dirname,'../.github/workflows');
const exempt=new Set(['build.yml','android-update-check.yml','android-replacement-1201.yml']);
const files=fs.readdirSync(root).filter(x=>x.endsWith('.yml'));
assert(files.includes('build.yml') && files.includes('android-update-check.yml'));
for(const name of files.filter(x=>!exempt.has(x))){
 const text=fs.readFileSync(path.join(root,name),'utf8');
 assert(/\n  push:\n    branches: \['\*\*'\][^\n]*\n    paths:\n/.test(text),name+': branch and paths filter required');
 assert(/\n  workflow_dispatch:/.test(text),name+': manual dispatch required');
}
const build=fs.readFileSync(path.join(root,'build.yml'),'utf8');
assert(/\n  push:\s*\n/.test(build),'tag Build must remain enabled');
assert(build.includes("if: startsWith(github.ref, 'refs/tags/v')"),'release must remain tag-triggered');
const update=fs.readFileSync(path.join(root,'android-update-check.yml'),'utf8');
assert(update.includes("tags: ['v*']"),'tagged Android update test must remain enabled');
console.log('Triggers: '+(files.length-exempt.size)+' специализированных workflow — ветки и ручной запуск; Build и Android update — также теги.');
