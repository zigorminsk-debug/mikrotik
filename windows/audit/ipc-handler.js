'use strict';
// Injected dependencies make the
// consent boundary testable without touching real routers or opening sockets.
const {validate}=require('./rest-readonly');
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
 let busy=false;
 return async function audit(event,input){
  if(!isTrusted(event))return {ok:false,message:'Недопустимый источник запроса.'};
  if(busy)return {ok:false,message:'Чтение уже выполняется.'};
  if(!input||typeof input!=='object'||Array.isArray(input))return {ok:false,message:'Недопустимые параметры чтения.'};
  // Copy only the five primitive fields that are used. No URI, custom command,
  // interface, file path, endpoint, method or insecure TLS option is accepted.
  const options={host:input.host,port:input.port,fingerprint:input.fingerprint,user:input.user,password:input.password};
  try{validate(options,false);}catch(error){return {ok:false,message:SAFE_ERRORS.has(error.message)?error.message:'Недопустимые параметры чтения.'};}
  busy=true;
  try{
   const result=await showDialog({
    type:'warning',title:'Чтение рабочего MikroTik по IPv4',
    message:'Прочитать выбранные настройки маршрутизатора?',
    detail:'Адрес: '+options.host+':'+options.port+'\nSHA-256 сертификата: '+options.fingerprint.toUpperCase()+'\n\nСверьте отпечаток заранее по независимому доверенному каналу. При несовпадении пароль не отправляется. Используйте отдельного пользователя RouterOS без прав записи и sensitive. Будут отправлены только фиксированные запросы чтения выбранных разделов по HTTPS. Сброс и изменение настроек не выполняются. Служба и учётная запись должны быть заранее подготовлены администратором. Это неполный неатомарный снимок, он может содержать сетевые адреса и топологию. Виртуальный импорт и чтение по MAC пока недоступны.',
    buttons:['Отмена','Прочитать'],defaultId:0,cancelId:0,noLink:true
   });
   if(!result||result.response!==1||isStopped())return {ok:false,cancelled:true};
   const snapshot=await collect(options);
   if(isStopped())return {ok:false,cancelled:true};
   if(snapshot.sections.some(section=>section.status==='auth'))return {ok:false,message:'Ошибка авторизации. Проверьте имя, пароль и права учётной записи RouterOS.'};
   return {ok:true,report:describe(snapshot)};
  }catch(error){return {ok:false,message:error&&SAFE_ERRORS.has(error.message)?error.message:'Не удалось прочитать настройки. Данные и пароль не записаны приложением в журнал.'};}
  finally{options.password='';busy=false;}
 };
}
module.exports={createAuditHandler};
