/* Export the currently visible diagram, not configuration or credentials. */
(function () {
'use strict';
var colors = {isp:'#7c3aed',router:'#0284c7',switch:'#475569',pc:'#16a34a',server:'#d97706',printer:'#be185d'};
function snapshot(board, icons) {
  var width = Math.round(board.clientWidth), height = Math.round(board.clientHeight);
  if (!width || !height) throw new Error('Откройте лабораторию перед сохранением.');
  // Bound time and memory for large/high-DPI displays, retaining the entire board.
  var scale = Math.min(1, 1600 / width, 1000 / height);
  var lines = Array.from(board.querySelectorAll('#lab-svg line, #lab-svg text')).filter(function(el) {
    return el.classList.contains('lab-link') || el.classList.contains('lab-link-lbl') || el.classList.contains('lab-flow');
  }).map(function(el) {
    var flow = el.classList.contains('lab-flow'), back = el.classList.contains('lab-flow-back');
    var out = {flow:flow,back:back,text:el.tagName.toLowerCase()==='text',label:el.textContent,
      x1:Number(el.getAttribute('x1')),y1:Number(el.getAttribute('y1')),x2:Number(el.getAttribute('x2')),y2:Number(el.getAttribute('y2')),
      x:Number(el.getAttribute('x')),y:Number(el.getAttribute('y'))};
    return out;
  });
  var nodes = Array.from(board.querySelectorAll('.lab-dev')).map(function(el) {
    var type = Object.keys(colors).filter(function(k) {return el.classList.contains('t-' + k);})[0];
    return {type:type,x:parseFloat(el.style.left)||0,y:parseFloat(el.style.top)||0,
      name:el.querySelector('.lab-nm').textContent, badge:(el.querySelector('.lab-ip')||{}).textContent||'',
      off:el.classList.contains('powered-off')};
  });
  if (!nodes.length) throw new Error('Схема пуста: добавьте хотя бы одно устройство.');
  return {width:width,height:height,scale:scale,lines:lines,nodes:nodes,icons:icons};
}
function iconImages(scene) {
  var types = Array.from(new Set(scene.nodes.map(function(n){return n.type;})));
  return Promise.all(types.map(function(type) {
    return new Promise(function(resolve, reject) {
      var img = new Image(); img.onload=function(){resolve([type,img]);}; img.onerror=function(){reject(new Error('Не удалось подготовить значки схемы.'));};
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(scene.icons[type].replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" style="color:' + colors[type] + '" '));
    });
  })).then(function(pairs) { var map={}; pairs.forEach(function(p){map[p[0]]=p[1];}); return map; });
}
function round(ctx,x,y,w,h,r) {
  ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();
}
function draw(ctx,scene,images,frame) {
  var w=scene.width,h=scene.height;
  ctx.setTransform(scene.scale,0,0,scene.scale,0,0);
  ctx.fillStyle='#f8fafc'; ctx.fillRect(0,0,w,h);
  ctx.fillStyle='#cbd5e1'; for(var x=0;x<w;x+=20) for(var y=0;y<h;y+=20) {ctx.beginPath();ctx.arc(x,y,1,0,Math.PI*2);ctx.fill();}
  scene.lines.forEach(function(l) {
    if(l.text) {ctx.font='11px sans-serif';ctx.textAlign='center';ctx.lineWidth=4;ctx.strokeStyle='#f8fafc';ctx.strokeText(l.label,l.x,l.y);ctx.fillStyle='#475569';ctx.fillText(l.label,l.x,l.y);return;}
    ctx.beginPath();ctx.moveTo(l.x1,l.y1);ctx.lineTo(l.x2,l.y2);ctx.lineWidth=l.flow?4:3;ctx.lineCap='round';ctx.strokeStyle=l.flow?(l.back?'#16a34a':'#0284c7'):'#64748b';
    ctx.setLineDash(l.flow?[9,16]:[]);ctx.lineDashOffset=l.flow ? 25-(frame*2.5)+(l.back?12:0) : 0;ctx.stroke();ctx.setLineDash([]);
  });
  scene.nodes.forEach(function(n) {
    round(ctx,n.x+20,n.y,56,50,10);ctx.fillStyle='#fff';ctx.fill();ctx.lineWidth=2;ctx.strokeStyle='#cbd5e1';ctx.stroke();
    ctx.save();if(n.off) ctx.globalAlpha=.38;ctx.drawImage(images[n.type],n.x+25,n.y+5,46,40);ctx.restore();
    ctx.textAlign='center';ctx.textBaseline='top';ctx.font='bold 12px sans-serif';ctx.fillStyle='#0f172a';ctx.fillText(n.name,n.x+48,n.y+53,96);
    ctx.font='10px sans-serif';ctx.fillStyle='#334155';ctx.fillText(n.badge,n.x+48,n.y+69,96);
    round(ctx,n.x,n.y,32,20,5);ctx.fillStyle=n.off?'#fee2e2':'#dcfce7';ctx.fill();ctx.strokeStyle=n.off?'#b91c1c':'#15803d';ctx.lineWidth=1;ctx.stroke();ctx.fillStyle=n.off?'#991b1b':'#166534';ctx.font='bold 10px sans-serif';ctx.fillText(n.off?'OFF':'ON',n.x+16,n.y+5);
    ctx.textBaseline='alphabetic';
  });
}
function render(board, icons, format) {
  var scene = snapshot(board,icons);
  if (format !== 'png' && format !== 'gif') return Promise.reject(new Error('Неизвестный формат.'));
  if (format === 'gif' && !scene.lines.some(function(l){return l.flow;})) return Promise.reject(new Error('Для GIF сначала запустите модель и убедитесь, что есть активный путь.'));
  var canvas=document.createElement('canvas'); canvas.width=Math.max(1,Math.round(scene.width*scene.scale));canvas.height=Math.max(1,Math.round(scene.height*scene.scale));
  var ctx=canvas.getContext('2d'); if(!ctx) return Promise.reject(new Error('Экспорт изображений не поддерживается.'));
  return iconImages(scene).then(function(images) {
    if(format==='png') {draw(ctx,scene,images,0);return new Promise(function(resolve,reject){canvas.toBlob(function(b){if(b) resolve(b);else reject(new Error('Не удалось создать PNG.'));},'image/png');});}
    var gif=window.gifenc.GIFEncoder(), palette, frame=0;
    function next() {
      draw(ctx,scene,images,frame);
      var rgba=ctx.getImageData(0,0,canvas.width,canvas.height).data;
      if (!palette) palette=window.gifenc.quantize(rgba,256);
      gif.writeFrame(window.gifenc.applyPalette(rgba,palette),canvas.width,canvas.height,{palette:palette,delay:80,repeat:0});
      if (++frame<10) return new Promise(function(resolve){setTimeout(resolve,0);}).then(next);
      gif.finish();return new Blob([gif.bytes()],{type:'image/gif'});
    }
    return next();
  });
}
window.LabExport = {snapshot:snapshot,render:render};
})();
