/* Просмотр снимка целиком и в увеличении. Работает офлайн в браузере и WebView. */
(function () {
'use strict';
var modal = document.getElementById('shot-viewer');
var stage = document.getElementById('shot-stage');
var img = document.getElementById('shot-full');
var title = document.getElementById('shot-viewer-title');
var level = document.getElementById('shot-level');
var fitButton = document.getElementById('shot-fit');
var plus = document.getElementById('shot-in');
var minus = document.getElementById('shot-out');
var close = document.getElementById('shot-close');
var fitted = 1, scale = 1, lastFocus = null;
function dimensions() { return { w: img.naturalWidth || 800, h: img.naturalHeight || 500 }; }
function apply() {
  img.style.width = Math.max(1, Math.round(dimensions().w * scale)) + 'px';
  level.textContent = Math.round(scale * 100) + '%';
}
function fit() {
  var d = dimensions();
  var width = Math.max(1, (stage.clientWidth || window.innerWidth || 800) - 24);
  var height = Math.max(1, (stage.clientHeight || Math.round((window.innerHeight || 600) * 0.7)) - 24);
  fitted = Math.min(1, width / d.w, height / d.h);
  scale = fitted;
  apply();
  stage.scrollLeft = 0; stage.scrollTop = 0;
}
function open(source, trigger) {
  if (!source || !source.getAttribute('src')) return;
  lastFocus = trigger;
  title.textContent = source.alt || 'Просмотр изображения';
  img.alt = source.alt || 'Изображение';
  img.onload = fit;
  img.src = source.src;
  modal.hidden = false;
  fit();
  close.focus();
}
function dismiss() {
  modal.hidden = true;
  img.onload = null;
  img.removeAttribute('src');
  if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
}
document.addEventListener('click', function (e) {
  var trigger = e.target.closest && e.target.closest('.shot-zoom');
  var picture = e.target.closest && e.target.closest('figure.shot img');
  var figure = trigger ? trigger.closest('figure.shot') : picture && picture.closest('figure.shot');
  if (figure) { e.preventDefault(); open(figure.querySelector('img'), trigger || picture); }
});
fitButton.addEventListener('click', fit);
plus.addEventListener('click', function () { scale = Math.min(4, scale * 1.4); apply(); });
minus.addEventListener('click', function () { scale = Math.max(fitted, scale / 1.4); apply(); });
close.addEventListener('click', dismiss);
modal.addEventListener('click', function (e) { if (e.target === modal) dismiss(); });
document.addEventListener('keydown', function (e) { if (!modal.hidden && e.key === 'Escape') dismiss(); });
window.addEventListener('resize', function () { if (!modal.hidden) fit(); });
})();
