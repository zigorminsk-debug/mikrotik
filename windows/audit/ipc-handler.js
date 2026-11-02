'use strict';
// Injected dependencies make the
// consent boundary testable without touching real routers or opening sockets.
const {validate}=require('./rest-readonly');
const {preview}=require('./import-plan');
const SAFE_ERRORS=new Set([
 'Недопустимый адрес или порт.',
 'Нужен проверенный SHA-256 отпечаток сертификата.',
 'Недопустимый формат учётных данных.',
 'Тайм-аут HTTPS.',
 'Сертификат отсутствует.',
 'Отпечаток сертификата не совпадает; пароль не отправлен.',
 'Сертификат ещё не действует или истёк; пароль не отправлен.',
 'Неподдерживаемый формат HTTPS-ответа.',
 'Ответ слишком большой.',
 'Ошибка HTTPS-ответа.',
 'Некорректный ответ RouterOS.',
 'Ошибка HTTPS-соединения.',
 'Ошибка TLS-соединения.',
 'Снимок слишком большой; чтение остановлено.'
]);
function createAuditHandler({isTrusted,showDialog,isStopped,collect,describe}){
 let busy=false,snapshot=null,expiry=null,deadline=0,generation=0;
 function reset(){generation++;snapshot=null;deadline=0;if(expiry){clearTimeout(expiry);expiry=null;}}
 function sources(data){
  const sections=data&&Array.isArray(data.sections)?data.sections.filter(s=>s&&s.id==='bridge-ports'):[];
  if(sections.length!==1||sections[0].status!=='ok'||!Array.isArray(sections[0].rows)||sections[0].rows.length<1||sections[0].rows.length>4)return [];
  const names=sections[0].rows.map(row=>row&&row.interface);
  return names.every(name=>typeof name==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.-]{0,30}$/.test(name))&&new Set(names).size===names.length?names:[];
 }
 async function audit(event,input){
  if(!isTrusted(event))return {ok:false,message:'Недопустимый источник запроса.'};
  if(busy)return {ok:false,message:'Чтение уже выполняется.'};
  reset();const current=generation;
  if(!input||typeof input!=='object'||Array.isArray(input))return {ok:false,message:'Недопустимые параметры чтения.'};
  // Copy only the five primitive fields that are used. No URI, custom command,
  // interface, file path, endpoint, method or insecure TLS option is accepted.
  const options={host:input.host,port:input.port,fingerprint:input.fingerprint,user:input.user,password:input.password};
  try{validate(options,false);}catch(error){return {ok:false,message:SAFE_ERRORS.has(error.message)?error.message:'Недопустимые параметры чтения.'};}
  // RouterOS often displays a continuous 64-digit hash; show a canonical
  // representation in the native dialog without accepting partial hashes.
  options.fingerprint=options.fingerprint.replace(/:/g,'').toUpperCase().match(/.{2}/g).join(':');
  busy=true;
  try{
   const result=await showDialog({
    type:'warning',title:'Чтение рабочего MikroTik по IPv4',
    message:'Прочитать выбранные настройки маршрутизатора?',
    detail:'Адрес: '+options.host+':'+options.port+'\nSHA-256 сертификата: '+options.fingerprint.toUpperCase()+'\n\nСверьте отпечаток заранее по независимому доверенному каналу. При несовпадении пароль не отправляется. Используйте отдельного пользователя RouterOS без прав записи и sensitive. Будут отправлены только фиксированные запросы чтения выбранных разделов по HTTPS. Сброс и изменение настроек не выполняются. Служба и учётная запись должны быть заранее подготовлены администратором. Это неполный неатомарный снимок, он может содержать сетевые адреса и топологию. Виртуальный импорт и чтение по MAC пока недоступны.',
    buttons:['Отмена','Прочитать'],defaultId:0,cancelId:0,noLink:true
   });
   if(!result||result.response!==1||isStopped()||current!==generation)return {ok:false,cancelled:true};
   const data=await collect(options);
   if(isStopped()||current!==generation)return {ok:false,cancelled:true};
   if(data.sections.some(section=>section.status==='auth'))return {ok:false,message:'Ошибка авторизации. Проверьте имя, пароль и права учётной записи RouterOS.'};
   const report=describe(data),portSources=sources(data);
   // Only the last successful read lives in memory, for at most 10 minutes.
   // Never keep credentials; no disk or renderer-supplied snapshot is used.
   snapshot=data;deadline=Date.now()+10*60*1000;expiry=setTimeout(()=>{if(current===generation)reset();},10*60*1000);expiry.unref();
   return {ok:true,report,portSources};
  }catch(error){return {ok:false,message:error&&SAFE_ERRORS.has(error.message)?error.message:'Не удалось прочитать настройки. Данные и пароль не записаны приложением в журнал.'};}
  finally{options.password='';busy=false;}
 }
 audit.clear=function(event){if(!isTrusted(event))return {ok:false};reset();return {ok:true};};
 audit.reset=reset; // main-process lifecycle only; not exposed to the renderer
 audit.preview=function(event,mapping){
  if(!isTrusted(event))return {ok:false,message:'Недопустимый источник запроса.'};
  if(snapshot&&Date.now()>=deadline)reset();
  if(isStopped()||busy||!snapshot)return {ok:false,message:'Снимок недоступен или устарел. Считайте настройки заново.'};
  if(!Array.isArray(mapping)||mapping.length>4)return {ok:false,message:'Недопустимое сопоставление портов.'};
  const clean=[];for(const item of mapping){
   if(!item||typeof item!=='object'||typeof item.source!=='string'||item.source.length>31||typeof item.target!=='string'||item.target.length>6)return {ok:false,message:'Недопустимое сопоставление портов.'};
   clean.push({source:item.source,target:item.target});
  }
  try{return {ok:true,plan:preview(snapshot,clean)};}
  catch(_){return {ok:false,message:'Не удалось построить предварительный план.'};}
 };
 return audit;
}
module.exports={createAuditHandler};
