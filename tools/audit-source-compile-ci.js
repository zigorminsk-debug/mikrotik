#!/usr/bin/env node
'use strict';
// CI only: the certificate probe is deliberately unauthenticated and must
// NEVER be reused for production trust. The source is a synthetic local CHR.
const fs=require('fs'),tls=require('tls'),{collect}=require('../windows/audit/rest-readonly'),{compile}=require('../windows/audit/compile-safe');
(async()=>{
 const input=JSON.parse(fs.readFileSync(0,'utf8'));
 const fingerprint=await new Promise((resolve,reject)=>{
  const socket=tls.connect({host:'127.0.0.1',port:input.port,rejectUnauthorized:false,minVersion:'TLSv1.2'},()=>{const peer=socket.getPeerCertificate();socket.destroy();if(!peer||!peer.fingerprint256)return reject(Error('No fixture certificate'));resolve(peer.fingerprint256);});
  socket.setTimeout(20000,()=>socket.destroy(Error('Fixture timeout')));socket.on('error',reject);
 });
 const snapshot=await collect({host:'127.0.0.1',port:input.port,fingerprint,user:input.user,password:input.password},{allowLoopback:true,timeout:30000});
 if(snapshot.sections.length!==18||snapshot.sections.some(s=>s.status!=='ok'))throw Error('Fixture sections unavailable');
 const result=compile(snapshot,[{source:'ether1',target:'ether2'},{source:'ether2',target:'ether3'}]);
 if(!result.ok){console.error('Fixture rejected: '+result.skipped.join(' | '));process.exitCode=1;return;}
 process.stdout.write(JSON.stringify({commands:result.commands,checks:result.checks}));
})().catch(()=>{console.error('Synthetic source collection/compilation failed; no credentials or raw data logged.');process.exitCode=1;});
