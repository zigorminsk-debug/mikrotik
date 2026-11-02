#!/usr/bin/env node
'use strict';
// Local TLS fixture only: no physical MikroTik and no production credentials.
const assert=require('assert'),https=require('https'),crypto=require('crypto'),fs=require('fs'),os=require('os'),path=require('path'),{execFileSync}=require('child_process');
const {TOPICS,validIp,validate,sanitize,collect}=require('../windows/audit/rest-readonly');
(async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'audit-fixture-'));let server;
 try{
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-keyout',path.join(temp,'key.pem'),'-out',path.join(temp,'cert.pem'),'-days','1','-nodes','-subj','/CN=temporary-ci'],{stdio:'ignore'});
  const key=fs.readFileSync(path.join(temp,'key.pem')),cert=fs.readFileSync(path.join(temp,'cert.pem'));
  const fingerprint=new crypto.X509Certificate(cert).fingerprint256;let requests=[],mode='ok';
  server=https.createServer({key,cert},(req,res)=>{
   requests.push({method:req.method,url:req.url,auth:req.headers.authorization});
   if(mode==='redirect'){res.writeHead(302,{Location:'https://example.com/'});res.end();return;}
   if(mode==='auth'){res.writeHead(401);res.end();return;}
   if(mode==='forbidden'){res.writeHead(403);res.end();return;}
   if(mode==='large'){res.writeHead(200);res.end('x'.repeat(1024*1024+1));return;}
   if(mode==='invalid'){res.writeHead(200);res.end('{invalid');return;}
   if(mode==='compressed'){res.writeHead(200,{'content-encoding':'gzip'});res.end('not-a-gzip-stream');return;}
   if(mode==='hang')return;
   if(mode==='crowd'){res.writeHead(200);res.end(JSON.stringify(Array.from({length:1900},()=>({name:'x'.repeat(400)}))));return;}
   res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify([{name:'ether1',type:'ether',disabled:'false',password:'MUST_NOT_ESCAPE',comment:'MUST_NOT_ESCAPE'}]));
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
  const opts={host:'127.0.0.1',port,fingerprint,user:'readonly',password:'fixture-only'};
  assert(!validIp('127.0.0.1'));assert(validIp('127.0.0.1',true));for(const ip of ['localhost','192.168.1.01','0.0.0.0','192.168.1.255','169.254.1.1','224.1.1.1','::1'])assert(!validIp(ip));assert(validIp('192.168.88.1'));
  assert.throws(()=>validate({...opts,fingerprint:'wrong'},true));assert.throws(()=>validate({...opts,user:'bad:user'},true));assert.throws(()=>validate({...opts,fingerprint:'aa'.repeat(32)},true));
  const topic=TOPICS.find(x=>x.id==='interfaces');
  await assert.rejects(()=>collect({...opts,fingerprint:'00:'.repeat(31)+'00'},{allowLoopback:true,topics:[topic]}),/отпечаток/i);assert.equal(requests.length,0,'Credentials must never reach an untrusted certificate');
  const realNow=Date.now;try{Date.now=()=>Date.parse(new crypto.X509Certificate(cert).validTo)+1;await assert.rejects(()=>collect(opts,{allowLoopback:true,topics:[topic]}),/истёк/i);assert.equal(requests.length,0,'Expired certificate must not receive credentials');}finally{Date.now=realNow;}
  const out=await collect(opts,{allowLoopback:true,topics:[topic]});assert.equal(out.complete,false);assert.equal(out.sections[0].status,'ok');assert.equal(out.sections[0].rows[0].name,'ether1');assert(!JSON.stringify(out).includes('MUST_NOT_ESCAPE'));assert.equal(requests.length,1);assert.equal(requests[0].method,'GET');assert(requests[0].url.startsWith('/rest/interface?'));assert(requests[0].url.includes('.proplist='));assert.equal(requests[0].auth,'Basic '+Buffer.from('readonly:fixture-only').toString('base64'));
  for(const [m,status] of [['redirect','http-error'],['auth','auth'],['forbidden','forbidden']]){mode=m;const result=await collect(opts,{allowLoopback:true,topics:[topic]});assert.equal(result.sections[0].status,status);}
  for(const m of ['large','invalid','compressed']){mode=m;await assert.rejects(()=>collect(opts,{allowLoopback:true,topics:[topic]}),error=>!error.message.includes(opts.password));}
  mode='crowd';await assert.rejects(()=>collect(opts,{allowLoopback:true,topics:[topic,topic,topic,topic]}),/снимок слишком большой/i);
  mode='hang';await assert.rejects(()=>collect(opts,{allowLoopback:true,topics:[topic],timeout:100}),/тайм-аут/i);
  mode='auth';const n=requests.length;const stopped=await collect(opts,{allowLoopback:true,topics:[topic,TOPICS[0]]});assert.equal(stopped.sections.length,1);assert.equal(requests.length,n+1);
  await assert.rejects(()=>collect(opts,{allowLoopback:true,topics:[{path:'/rest/system/reset-configuration'}]}),/перечень/);
  assert.throws(()=>sanitize(Array.from({length:2001},()=>({name:'x'})),topic));assert.throws(()=>sanitize([{name:{untrusted:true}}],topic));assert.throws(()=>sanitize([{name:'a'.repeat(513)}],topic));assert.throws(()=>sanitize([{name:'ether1\u202eabc'}],topic));assert.throws(()=>sanitize([{name:'line\nbreak'}],topic));
  console.log('Audit HTTPS research: fixed GET-only topics, pin before credentials, bounds, redaction and no redirects tested with local fake TLS server; not a real router.');
 }finally{if(server)await new Promise(r=>server.close(r));fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
