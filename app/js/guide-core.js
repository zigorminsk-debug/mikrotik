/* Ядро контента учебника: реестр разделов и хелперы для описания шагов.
   Блочная модель: шаг = { t: заголовок, b: [ блоки... ] }.
   Виды блоков:
     P(text)            — абзац (поддерживается **жирный** и `код`)
     UL([..]) / OL([..])— списки
     CMD(code, title?)  — блок команд RouterOS с кнопкой копирования
     IMG(src, cap)      — скриншот
     NOTE/TIP/WARN(text)— подсказки
     H(text)            — подзаголовок внутри шага
     TBL([head],[rows]) — таблица
     RAW(html)          — «сырой» HTML (крайний случай)
*/
'use strict';
var GUIDE = { sections: [] };

function P(t){ return {k:'p', t:t}; }
function UL(items){ return {k:'ul', items:items}; }
function OL(items){ return {k:'ol', items:items}; }
function CMD(code, title){ return {k:'cmd', t:code, title:title||''}; }
function IMG(src, cap){ return {k:'img', src:src, cap:cap||''}; }
function NOTE(t){ return {k:'note', t:t}; }
function TIP(t){ return {k:'tip', t:t}; }
function WARN(t){ return {k:'warn', t:t}; }
function H(t){ return {k:'h', t:t}; }
function TBL(head, rows){ return {k:'tbl', head:head, rows:rows}; }
function RAW(t){ return {k:'raw', t:t}; }

function section(sec){ GUIDE.sections.push(sec); return sec; }
