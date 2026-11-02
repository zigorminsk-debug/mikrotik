#!/usr/bin/env node
'use strict';
// CI only. One disposable CHR on loopback; parameters arrive on stdin.
const assert=require('assert'),fs=require('fs'),https=require('https'),tls=require('tls');
const {TOPICS,collect}=require('../windows/audit/rest-readonly');
let stage='parse';
(async()=>{
 const input=JSON.parse(fs.readFileSync(0,'utf8'));
 // Only the disposable local CI fixture: learn its generated certificate with
 // an unauthenticated TLS handshake. No production trust or identity is inferred.
 stage='fixture-certificate-probe';const fingerprint=await new Promise((resolve,reject)=>{
  const socket=tls.connect({host:'127.0.0.1',port:input.port,rejectUnauthorized:false,minVersion:'TLSv1.2'},()=>{const peer=socket.getPeerCertificate();socket.destroy();if(!peer||!peer.fingerprint256)return reject(Error('No fixture certificate'));resolve(peer.fingerprint256);});
  socket.setTimeout(20000,()=>socket.destroy(Error('Fixture timeout')));socket.on('error',reject);
 });
 const options={host:'127.0.0.1',port:input.port,fingerprint,user:input.user,password:input.password};
 const sections=TOPICS;
 stage='bad-pin';const bad='00:'.repeat(31)+'00';await assert.rejects(()=>collect({...options,fingerprint:bad},{allowLoopback:true,topics:sections}),/отпечаток/i);
 stage='read-sections';const output=await collect(options,{allowLoopback:true,topics:sections,timeout:30000});
 assert.equal(output.sections.length,sections.length);for(const x of output.sections){if(x.status!=='ok')console.log('::error title=Audit fixture section::'+x.id+': '+x.status);assert.equal(x.status,'ok',x.id+': '+x.status);}
 stage='check-identity-and-address';const identity=output.sections.find(x=>x.id==='identity');assert(identity.rows.some(r=>r.name==='audit-fixture'));
 const addr=output.sections.find(x=>x.id==='addresses');assert(addr.rows.some(r=>r.address==='10.0.2.15/24'&&r.interface==='ether1'));
 assert.equal(output.complete,false);assert(!JSON.stringify(output).includes(input.password));
 // Deliberate write attempt ONLY against this disposable local fixture. Verify
 // the dedicated account is actually denied and the identity stays unchanged.
 stage='read-only-write-attempt';
 const changeIdentity=(user,name)=>new Promise((resolve,reject)=>{const body=JSON.stringify({name});const req=https.request({host:'127.0.0.1',port:input.port,path:'/rest/system/identity/set',method:'POST',rejectUnauthorized:false,headers:{authorization:'Basic '+Buffer.from(user+':'+input.password).toString('base64'),'content-type':'application/json','content-length':Buffer.byteLength(body)}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.end(body);});
 const writeStatus=await changeIdentity(input.user,'should-not-be-written');
 assert(writeStatus>=400,'Fixture read-only account allowed a write');
 stage='identity-after-write-attempt';let identityAgain=await collect(options,{allowLoopback:true,topics:[TOPICS.find(t=>t.id==='identity')],timeout:30000});assert(identityAgain.sections[0].rows.some(r=>r.name==='audit-fixture'));
 // Positive control on this disposable VM only: prove the endpoint supports a
 // write with admin, then restore the synthetic identity.
 stage='write-positive-control';assert.equal(await changeIdentity('admin','audit-positive-control'),200);
 identityAgain=await collect(options,{allowLoopback:true,topics:[TOPICS.find(t=>t.id==='identity')],timeout:30000});assert(identityAgain.sections[0].rows.some(r=>r.name==='audit-positive-control'));
 assert.equal(await changeIdentity('admin','audit-fixture'),200);
 console.log('::notice title=Audit IP research::HTTPS read-only collector read all 18 selected sections from isolated RouterOS CHR with a pinned disposable certificate learned from an unauthenticated loopback fixture probe, fixed property lists and no production credentials. The fixture probe is not a production trust model. Bad pin and a write by the restricted user were rejected; an administrator positive control wrote the same disposable-VM endpoint and restored it. This is not a production router or full audit.');
})().catch(()=>{console.log('::error title=Audit IP research::Disposable CHR HTTPS audit fixture failed at '+stage+'; no credentials or raw output logged.');process.exitCode=1;});
