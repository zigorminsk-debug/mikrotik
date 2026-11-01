/* Real Chromium layout on a disposable Windows runner; not an Android test. */
'use strict';
const {app,BrowserWindow}=require('electron'),path=require('path');
app.commandLine.appendSwitch('disable-gpu');
app.whenReady().then(async()=>{
 const win=new BrowserWindow({width:360,height:700,show:false,useContentSize:true,webPreferences:{offscreen:true,sandbox:true,contextIsolation:true,nodeIntegration:false}});
 try {
  await win.loadFile(path.resolve(__dirname,'../windows/www/index.html'));
  for(const [width,height] of [[320,640],[360,700],[412,700],[640,320],[1200,700]]){
   win.setContentSize(width,height);await new Promise(r=>setTimeout(r,150));
   const result=await win.webContents.executeJavaScript(`(async()=>{
    const must=(v,m)=>{if(!v)throw Error(m)}; const $=id=>document.getElementById(id);
    const visible=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&r.left>=-1&&r.right<=innerWidth+1&&r.top>=-1&&r.bottom<=innerHeight+1};
    while($('fs_val').textContent!=='100%')$('fs_minus').click();
    location.hash='intro';await new Promise(r=>setTimeout(r,100));
    const before=parseFloat(getComputedStyle(document.querySelector('#content .sec-header h1')).fontSize);
    const contentWidth=document.querySelector('.content-wrap').getBoundingClientRect().width;
    for(let i=0;i<3;i++)$('fs_plus').click();
    const after=parseFloat(getComputedStyle(document.querySelector('#content .sec-header h1')).fontSize);
    must(Math.abs(after/before-1.5)<.02,'title font did not grow');
    must(Math.abs(document.querySelector('.content-wrap').getBoundingClientRect().width-contentWidth)<1,'content width changed');
    must(!$('fs_plus').closest('.content-wrap').style.zoom,'page zoom still enabled');
    must(visible($('fs_plus'))&&visible($('fs_minus'))&&visible($('btn_update')),'top controls offscreen');
    must(document.documentElement.scrollWidth<=innerWidth+1,'page overflows horizontally');
    if(innerWidth<=820){
     must(visible($('burger')),'menu button offscreen');$('burger').click();await new Promise(r=>setTimeout(r,300));
     const nav=$('nav'), sidebar=$('sidebar');must(sidebar.classList.contains('open'),'menu did not open');
     nav.scrollTop=nav.scrollHeight;await new Promise(r=>setTimeout(r,100));
     const target=Array.from(nav.querySelectorAll('a')).find(a=>a.getAttribute('href')==='#about');
     must(target&&visible(target),'last menu item unreachable');
     const r=target.getBoundingClientRect();must(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2).closest('a')===target,'menu item obscured');
     target.click();await new Promise(r=>setTimeout(r,100));
     must(location.hash==='#about'&&!sidebar.classList.contains('open'),'menu navigation failed');
    }
    location.hash='ros-interfaces';await new Promise(r=>setTimeout(r,120));
    const tabs=[...document.querySelectorAll('.wb-tab')];must(tabs.length===13,'Interfaces tabs missing');
    tabs[6].click();const panel=document.getElementById(tabs[6].getAttribute('aria-controls'));
    const practice=panel.querySelector('.wb-practice');must(practice&&practice.querySelectorAll('li').length>=3,'VLAN practice missing');practice.open=true;
    const field=panel.querySelector('.wb-field');field.open=true;await new Promise(r=>setTimeout(r,80));
    must(document.documentElement.scrollWidth<=innerWidth+1,'practice page overflows horizontally');
    must(panel.scrollWidth<=panel.clientWidth+1,'practice panel overflows horizontally');
    tabs[0].focus();tabs[0].dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}));
    must(tabs[12].getAttribute('aria-selected')==='true'&&document.activeElement===tabs[12],'last tab not reachable by keyboard');
    const tabRect=tabs[12].getBoundingClientRect(), barRect=tabs[12].parentNode.getBoundingClientRect();
    must(tabRect.left>=barRect.left-1&&tabRect.right<=barRect.right+1,'last tab did not scroll into view');
    window.confirm=()=>true;window.routerOS={launch:async()=>({ok:true}),ping:async()=>({ok:false,cancelled:true})};
    location.hash='lab';await new Promise(r=>setTimeout(r,100));$('lab_example_chr_isolated').click();window.Lab.run({instant:true});await new Promise(r=>setTimeout(r,100));
    must(document.querySelector('.lab-ping-availability').textContent.includes('на Android реальный ping'),'Android ping limitation missing');
    for(const id of ['lab-ping-source','lab-ping-preset','lab-ping-target','lab-ping-run']){const e=$(id),rect=e.getBoundingClientRect();must(rect.width>0&&rect.left>=-1&&rect.right<=innerWidth+1,'ping control overflows: '+id);}
    must(document.documentElement.scrollWidth<=innerWidth+1,'lab overflows horizontally');
    return {width:innerWidth,before,after};
   })()`);
   console.log('Font responsive layout:',JSON.stringify(result));
  }
 }catch(e){console.error('Responsive test failed:',e.message);console.log('::error title=Responsive layout::'+String(e.message).replace(/[\r\n%]/g,' '));process.exitCode=1;}finally{win.destroy();app.quit();}
});
