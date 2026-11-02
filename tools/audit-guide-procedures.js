#!/usr/bin/env node
'use strict';
// Structural inventory of the actual guide data in browser script order.
// Counts are NOT proof that instructions, screenshots or RouterOS behaviour are correct.
const fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'app/index.html'),'utf8');
const scripts=[...html.matchAll(/<script src="js\/([^"]+)"/g)].map(x=>x[1]);
const begin=scripts.indexOf('guide-core.js'),end=scripts.indexOf('release-history.js');
if(begin<0||end<begin)throw Error('Не найден порядок скриптов учебника');
const ctx=vm.createContext({});ctx.window=ctx;
for(const file of scripts.slice(begin,end))vm.runInContext(fs.readFileSync(path.join(root,'app/js',file),'utf8'),ctx,{filename:file});
const clean=x=>String(x||'').replace(/\s+/g,' ').replace(/\|/g,'\\|');
const visible=ctx.GUIDE.sections.filter(s=>!s.hiddenNav),sections=visible.filter(s=>!s.type),lines=[
 '# Инвентаризация пошаговых инструкций', '',
 'Генерируется `node tools/audit-guide-procedures.js` по порядку загрузки учебника, включая вкладки Interfaces, WireGuard, PPP и Bridge. Счётчик показывает только структуру. Список действий не доказывает полноту, корректность или проверку на RouterOS; раздел с нулём списков может содержать описания или команды в других блоках.', '',
 'Нужна ручная проверка смысла каждого действия, совместимости версий, безопасности, отрицательных тестов и отдельного оригинального снимка. Вкладки показывают набор выбранных полей, не гарантируя все поля WinBox. Команды и динамические инструкции конструктора в эти цифры не включены.', '',
 '## Видимые страницы', '', '| Раздел | Подразделы | Подразделы с нумерованным списком | Без нумерованного списка |', '|---|---:|---:|---:|'
];
for(const s of visible){const steps=Array.isArray(s.steps)?s.steps:[],withList=steps.filter(st=>(st.b||[]).some(b=>b.k==='ol'&&Array.isArray(b.items)&&b.items.length));lines.push('| '+clean(s.title)+' (`'+clean(s.id)+'`) | '+steps.length+' | '+withList.length+' | '+(steps.length-withList.length)+' |');}
lines.push('','## Подразделы без нумерованного списка','','Каждый пункт требует ручной оценки: здесь может быть справка, команда или неполная инструкция, а не обязательно ошибка.','');
for(const s of sections){const missing=(s.steps||[]).filter(st=>!(st.b||[]).some(b=>b.k==='ol'&&Array.isArray(b.items)&&b.items.length));if(missing.length)lines.push('- **'+clean(s.title)+'**: '+missing.map(st=>clean(st.t)).join('; ')+'.');}
lines.push('','## Вкладки с отдельными практическими примерами','','В этих данных есть текстовые шаги и выбранные поля; отдельного снимка к каждому шагу рендерер пока не поддерживает. Текст должен проверяться вручную.','','| Раздел / вкладка | Описанные поля | Текстовые шаги | Пример отсутствует |','|---|---:|---:|---|');
const groups=[['Interfaces',ctx.INTERFACES_GUIDE,ctx.INTERFACES_PRACTICE],['WireGuard',ctx.WIREGUARD_GUIDE,ctx.WIREGUARD_PRACTICE],['PPP',ctx.PPP_GUIDE,ctx.PPP_PRACTICE],['Bridge',ctx.BRIDGE_GUIDE,ctx.BRIDGE_PRACTICE]];
for(const [group,tabs,practice] of groups){if(!Array.isArray(tabs)||!practice)throw Error('Не загружены вкладки '+group);for(const tab of tabs){const p=practice[tab.name],steps=p&&Array.isArray(p.steps)?p.steps:[];lines.push('| '+clean(group)+' / '+clean(tab.name)+' | '+(Array.isArray(tab.fields)?tab.fields.length:0)+' | '+steps.length+' | '+(steps.length?'нет':'ДА')+' |');}}
lines.push('','## Приоритеты ручной проверки','','- DHCP: мастер, статические аренды, конфликт диапазонов, DNS, клиент и отдельные снимки.', '- Сертификаты: отличие CA и серверного/клиентского сертификатов, имя, доверие, защита ключей, отзыв и отдельные снимки.', '- OpenVPN: совместимость версий и клиента, реальные сертификаты, маршруты, firewall, положительный и отрицательный обмен. В приложении автоматическое применение VPN пока заблокировано.', '- Разделы без практической процедуры и все вкладки: порядок действий, проверки, откат и оригинальные снимки; динамические схемы и физическое оборудование учитываются отдельно.','');
const result=lines.join('\n').replace(/\n+$/, '')+'\n',target=path.join(root,'docs/guide-procedure-audit.md');
if(process.argv.includes('--check')){if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==result){console.error('Инвентаризация инструкций устарела.');process.exitCode=1;}else console.log('Инвентаризация инструкций актуальна.');}
else{fs.writeFileSync(target,result);console.log('Инвентаризация инструкций: '+visible.length+' страниц, '+groups.reduce((n,x)=>n+x[1].length,0)+' вкладок.');}
