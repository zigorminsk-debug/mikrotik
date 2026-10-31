'use strict';
// Assisted, external WinBox launch; not a connection implementation. No MAC,
// user name, password, RouterOS commands or settings are passed to the process.
const winpath=require('path').win32;
function winboxWarning(resolved) {
  return {
    type:'warning',title:'Открыть отдельный WinBox?',
    message:'Запустить выбранную вами программу WinBox?',
    detail:'Файл: '+resolved+'\n\nПриложение не проверяет подлинность файла. Выбирайте только официальный WinBox MikroTik из доверенного источника. WinBox может самостоятельно обнаруживать устройства в сети. MAC-адрес и пароль не передаются: выберите устройство и войдите вручную в отдельном окне. Лаборатория не узнает, был ли выполнен вход, и не отправит настройки схемы.',
    buttons:['Отмена','Открыть WinBox'],defaultId:0,cancelId:0,noLink:true
  };
}
async function openWinbox({dialog,owner,fs,spawn,isStopped}) {
  try {
    if(isStopped())return {ok:false,cancelled:true};
    const picked=await dialog.showOpenDialog(owner,{
      title:'Выберите установленный WinBox от MikroTik',
      properties:['openFile'],filters:[{name:'Программа WinBox',extensions:['exe']}]
    });
    if(isStopped() || picked.canceled || !Array.isArray(picked.filePaths) || picked.filePaths.length!==1)return {ok:false,cancelled:true};
    const file=picked.filePaths[0];
    if(typeof file!=='string'||file.length>32760||!winpath.isAbsolute(file)||!/^winbox(?:64)?\.exe$/i.test(winpath.basename(file)))
      return {ok:false,message:'Выберите локальный файл WinBox.exe или winbox64.exe.'};
    const resolved=await fs.realpath(file);
    // Reject UNC/device paths and links resolving to network shares. The dialog,
    // not the renderer, supplies the executable path.
    if(!/^[A-Za-z]:\\/.test(resolved)||!/^winbox(?:64)?\.exe$/i.test(winpath.basename(resolved)))
      return {ok:false,message:'Нужен локальный файл WinBox.exe или winbox64.exe.'};
    const stat=await fs.stat(resolved);
    if(!stat.isFile()||isStopped())return {ok:false,message:'Выбранный файл недоступен.'};
    const choice=await dialog.showMessageBox(owner,winboxWarning(resolved));
    if(choice.response!==1||isStopped())return {ok:false,cancelled:true};
    const child=spawn(resolved,[],{detached:true,stdio:'ignore',windowsHide:false,shell:false});
    await new Promise((resolve,reject)=>{child.once('error',reject);child.once('spawn',resolve);});
    child.unref();return {ok:true};
  } catch (_) { return {ok:false,message:'Не удалось открыть WinBox. Проверьте файл и права доступа.'}; }
}
module.exports={openWinbox,winboxWarning};
