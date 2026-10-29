#!/usr/bin/env node
/* Инвентаризация статических шагов; присутствие IMG внутри раздела не означает
   соответствие каждому действию. Итог нужно проверять вручную. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const dir = path.join(root, 'app/js');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(dir, 'guide-core.js'), 'utf8'), context);
for (const file of fs.readdirSync(dir).filter(f => /^sec-.*\.js$/.test(f)).sort())
  vm.runInContext(fs.readFileSync(path.join(dir, file), 'utf8'), context, {filename:file});
const clean = text => String(text || '').replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');
const out = ['# Инвентаризация иллюстраций учебника', '',
  'Создаётся командой `node tools/audit-screens.js`. Это инвентаризация, а не доказательство соответствия: изображения внутри раздела могут показывать другие значения, версию или действие.', '',
  'Нумерованные пункты статического учебника пока не имеют явной привязки к отдельным снимкам: наличие общего изображения не подтверждает покрытие пункта. Команды, абзацы, таблицы и действия вне нумерованных списков также требуют ручной проверки.', '',
  'Графическая лаборатория и интерактивный конструктор создают инструкции динамически: все комбинации устройств и их изображения проверяются отдельно, в эту статическую инвентаризацию они не входят.', ''];
let steps = 0, items = 0;
for (const section of context.GUIDE.sections) {
  if (!section.steps || !section.steps.length) continue;
  out.push('## ' + clean(section.title), '');
  for (const step of section.steps) {
    steps++;
    const blocks = step.b || [], images = blocks.filter(x => x.k === 'img');
    out.push('### ' + clean(step.t), '', '**Изображения в подразделе:** ' + (images.length ? images.map(x => '`' + clean(x.src) + '` — ' + clean(x.cap)).join('; ') : 'нет') + '.', '');
    for (const block of blocks) {
      if (block.k === 'ol') for (const item of block.items || []) {
        items++;
        out.push('- [ ] ' + clean(item) + ' — отдельный снимок к пункту не сопоставлен.');
      }
    }
    out.push('');
  }
}
out.splice(2, 0, '**Итого:** ' + steps + ' подразделов; ' + items + ' нумерованных пунктов без явной привязки отдельного снимка. Эти цифры не включают действия в абзацах и динамические инструкции.', '');
const result = out.join('\n') + '\n';
const output = path.join(root, 'docs/screenshot-audit.md');
if (process.argv.includes('--check')) {
  if (!fs.existsSync(output) || fs.readFileSync(output, 'utf8') !== result) {
    console.error('Инвентаризация устарела: запустите node tools/audit-screens.js');
    process.exitCode = 1;
  } else console.log('Инвентаризация актуальна.');
} else {
  fs.mkdirSync(path.dirname(output), {recursive:true});
  fs.writeFileSync(output, result);
  console.log('Записана инвентаризация: ' + steps + ' подразделов, ' + items + ' пунктов.');
}
