/* Частичный аудит IPv4: безопасное текстовое отображение выбранных разделов. */
(function (global) {
'use strict';
// Uses textContent only: every value returned by a device is untrusted.
function createAuditUI(container, bridge) {
  var doc=container.ownerDocument,disposed=false,busy=false;
  function node(tag,text,cls) {var e=doc.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
  function label(form,text,id,type,attrs){var l=node('label',text), input=node('input');input.id=id;input.type=type;Object.keys(attrs||{}).forEach(function(k){input.setAttribute(k,attrs[k]);});l.appendChild(input);form.appendChild(l);return input;}
  container.replaceChildren();
  var header=node('h3','Чтение рабочего MikroTik по IPv4 (экспериментальный неполный аудит)');container.appendChild(header);
  container.appendChild(node('p','Только выбранные разделы RouterOS 7 по HTTPS. На физическом устройстве функция ещё не проверена. Это не полная копия и не проверка трафика. Данные могут содержать адреса и топологию; они не сохраняются в файл или схему. Снимок временно хранится в памяти Windows-компонента до закрытия формы или истечения 10 минут. Отчёт остаётся на экране до закрытия формы; полная очистка памяти ОС не гарантируется. MAC-подключение и перенос в виртуальную машину пока недоступны. Начатое чтение нельзя остановить закрытием формы.','note'));
  container.appendChild(node('p','Администратор заранее настраивает www-ssl и отдельную учётную запись без прав записи и sensitive. Самостоятельно сверьте SHA-256 сертификата по независимому доверенному каналу. Не используйте отпечаток, полученный через непроверенное соединение.','fs-hint'));
  var form=node('form');form.setAttribute('autocomplete','off');container.appendChild(form);
  var host=label(form,'IPv4 устройства','audit-ip','text',{inputmode:'decimal',maxlength:'15',autocomplete:'off',spellcheck:'false'});
  var port=label(form,'Порт HTTPS','audit-port','number',{min:'1',max:'65535',autocomplete:'off'});port.value='443';
  var pin=label(form,'Проверенный SHA-256 сертификата (64 шестнадцатеричных символа, с двоеточиями или без)','audit-pin','text',{maxlength:'95',autocomplete:'off',spellcheck:'false'});
  var user=label(form,'Пользователь только для чтения','audit-user','text',{maxlength:'128',autocomplete:'off'});
  var password=label(form,'Пароль','audit-password','password',{maxlength:'512',autocomplete:'new-password'});
  var submit=node('button','Прочитать выбранные настройки','btn primary');submit.type='submit';form.appendChild(submit);
  var status=node('p','', 'fs-hint');status.setAttribute('role','status');container.appendChild(status);
  var output=node('div');container.appendChild(output);
  var planning=node('div');container.appendChild(planning);
  var available=bridge&&typeof bridge.auditIp==='function';if(!available){submit.disabled=true;[host,port,pin,user,password].forEach(function(input){input.disabled=true;});status.textContent='Чтение доступно только в Windows-приложении.';}
  function showReport(report){
    output.replaceChildren();
    if(!report||!Array.isArray(report.sections)||report.sections.length>40){status.textContent='Некорректный ответ Windows-компонента.';return;}
    output.appendChild(node('p',typeof report.warning==='string'?report.warning:'Неполный отчёт; отсутствующие данные неизвестны.','note'));
    var statusText={auth:'Ошибка авторизации',forbidden:'Доступ запрещён',unavailable:'Раздел недоступен', 'http-error':'Ошибка HTTP', 'not-read':'Не считывался',unknown:'Неизвестно'};
    report.sections.forEach(function(section){
      if(!section||typeof section.title!=='string')return;
      var block=node('details'), title=section.title+' — '+(section.status==='ok'?'считано':(statusText[section.status]||'неизвестно'));
      block.appendChild(node('summary',title));if(typeof section.purpose==='string')block.appendChild(node('p',section.purpose));output.appendChild(block);
      if(section.status!=='ok'||!Array.isArray(section.rows))return;
      if(section.rows.length>2000){block.appendChild(node('p','Слишком много записей для отображения.'));return;}
      if(!section.rows.length){block.appendChild(node('p','В ответе нет записей; это не доказывает отсутствия других настроек.'));return;}
      var pager=node('div'),list=node('div'),prev=node('button','← Предыдущие 25','btn ghost'),next=node('button','Следующие 25 →','btn ghost'),count=node('span');
      prev.type=next.type='button';pager.appendChild(prev);pager.appendChild(count);pager.appendChild(next);block.appendChild(pager);block.appendChild(list);var page=0;
      function pageRows(){
        list.replaceChildren();var from=page*25,to=Math.min(from+25,section.rows.length);count.textContent=' '+(from+1)+'–'+to+' из '+section.rows.length+' ';prev.disabled=page===0;next.disabled=to===section.rows.length;
        section.rows.slice(from,to).forEach(function(fields,idx){
          var row=node('details');row.appendChild(node('summary','Запись '+(from+idx+1)));list.appendChild(row);
          if(!Array.isArray(fields)||fields.length>64){row.appendChild(node('p','Неподдерживаемая запись.'));return;}
          var dl=node('dl');row.appendChild(dl);fields.forEach(function(field){
            if(!field||typeof field.label!=='string'||typeof field.purpose!=='string')return;
            dl.appendChild(node('dt',field.label));
            var value=field.present===true&&typeof field.value==='string'?field.value:'Неизвестно: поле отсутствует в ответе';
            dl.appendChild(node('dd',value+' — '+field.purpose));
          });
        });
      }
      prev.addEventListener('click',function(){if(page>0){page--;pageRows();}});next.addEventListener('click',function(){if((page+1)*25<section.rows.length){page++;pageRows();}});pageRows();
    });
  }
  function showPlanning(portSources){
    planning.replaceChildren();
    if(!bridge||typeof bridge.auditPreview!=='function')return;
    var title=node('h4','Предварительный план переноса (только просмотр)');planning.appendChild(title);
    planning.appendChild(node('p','Модель включает только один мост RSTP без VLAN-фильтрации, 1–4 Ethernet-порта и один статический IPv4. Все остальные настройки пропускаются. План не запускает VM, не выполняет команды и не доказывает безопасность или связность.','note'));
    var ports=Array.isArray(portSources)&&portSources.length<=4?portSources:[], selectors=[];
    ports.forEach(function(source){
      if(typeof source!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,30}$/.test(source))return;
      var labelNode=node('label','Физический порт '+source+' → виртуальный порт '),select=node('select');
      var first=node('option','Выберите порт');first.value='';select.appendChild(first);
      ['ether2','ether3','ether4','ether5'].forEach(function(target){var option=node('option',target);option.value=target;select.appendChild(option);});
      labelNode.appendChild(select);planning.appendChild(labelNode);selectors.push({source:source,select:select});
    });
    if(!selectors.length)planning.appendChild(node('p','Нет подходящего списка из 1–4 портов; можно посмотреть причину отказа.'));
    var button=node('button','Проверить предварительный план','btn');button.type='button';planning.appendChild(button);
    var resultBox=node('div');resultBox.setAttribute('role','status');planning.appendChild(resultBox);var pending=false;
    button.addEventListener('click',function(){
      if(disposed||pending)return;
      var mapping=selectors.map(function(item){return {source:item.source,target:item.select.value};});
      if(mapping.some(function(item){return !item.target;})){resultBox.textContent='Выберите виртуальный порт для каждого физического порта.';return;}
      if(new Set(mapping.map(function(item){return item.target;})).size!==mapping.length){resultBox.textContent='Каждому физическому порту нужен отдельный виртуальный порт.';return;}
      pending=true;button.disabled=true;resultBox.textContent='Проверка предварительной модели…';
      Promise.resolve().then(function(){return bridge.auditPreview(mapping);}).then(function(result){
        if(disposed)return;resultBox.replaceChildren();
        if(!result||!result.ok||!result.plan){resultBox.appendChild(node('p',result&&typeof result.message==='string'?result.message:'Не удалось построить предварительный план.'));return;}
        var plan=result.plan;
        resultBox.appendChild(node('p',Array.isArray(plan.items)&&plan.items.length?'Поддерживаемая предварительная модель; перенос не выполнялся.':'Предварительная модель не создана.'));
        if(Array.isArray(plan.items))plan.items.slice(0,6).forEach(function(item){
          if(!item||typeof item!=='object')return;
          var text=item.kind==='bridge'?'Мост: audit-lan, RSTP, VLAN-фильтрация выключена.':item.kind==='port'?'Виртуальный порт '+item.target+' в мосту audit-lan.':item.kind==='ipv4'?'IPv4 '+item.address+' на мосту audit-lan.':'Неизвестный элемент.';
          resultBox.appendChild(node('p',text));
        });
        if(Array.isArray(plan.skipped))plan.skipped.slice(0,20).forEach(function(text){if(typeof text==='string')resultBox.appendChild(node('p','Пропущено: '+text));});
        if(Array.isArray(plan.limitations))plan.limitations.slice(0,20).forEach(function(text){if(typeof text==='string')resultBox.appendChild(node('p',text,'fs-hint'));});
      }).catch(function(){if(!disposed)resultBox.textContent='Ошибка связи с Windows-компонентом.';}).finally(function(){pending=false;if(!disposed)button.disabled=false;});
    });
  }
  form.addEventListener('submit',function(event){
    event.preventDefault();if(disposed||busy||!available)return;
    var request={host:host.value.trim(),port:Number(port.value),fingerprint:pin.value.trim().toUpperCase(),user:user.value,password:password.value};password.value='';
    output.replaceChildren();planning.replaceChildren();status.textContent='Ожидание подтверждения Windows и чтение выбранных разделов…';submit.disabled=true;busy=true;
    // Defer to a Promise so synchronous bridge failures are also handled safely.
    Promise.resolve().then(function(){return disposed ? null : bridge.auditIp(request);}).then(function(result){
      if(disposed)return;if(!result||!result.ok){status.textContent=result&&result.cancelled?'Чтение отменено.':(result&&typeof result.message==='string'?result.message:'Не удалось прочитать настройки.');return;}
      status.textContent='Выбранные разделы прочитаны; отчёт неполный.';showReport(result.report);showPlanning(result.portSources);
    }).catch(function(){if(!disposed)status.textContent='Ошибка связи с Windows-компонентом.';}).finally(function(){request.password='';busy=false;if(!disposed)submit.disabled=false;});
  });
  return {dispose:function(){disposed=true;if(bridge&&typeof bridge.auditClear==='function'){try{Promise.resolve(bridge.auditClear()).catch(function(){});}catch(_){}}password.value='';host.value='';port.value='';pin.value='';user.value='';container.replaceChildren();}};
}
var api={createAuditUI:createAuditUI};global.PhysicalAuditUI=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
