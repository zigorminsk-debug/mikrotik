'use strict';
// Experimental disposable CirrOS guest controller. NOT wired to IPC or the UI.
// It is safe only in an explicitly isolated QEMU topology; CirrOS has public
// credentials. Never connect this guest to a Windows LAN or user-mode NAT.
const fs=require('fs').promises,constants=require('fs').constants,path=require('path'),net=require('net');
const {spawn}=require('child_process'),{randomBytes}=require('crypto');
const {ChrConsole}=require('./console'),{validTarget}=require('./ping');
function portOk(port){return Number.isInteger(port)&&port>0&&port<=65535;}
function macOk(mac){return typeof mac==='string'&&/^52:54:00:(?:[0-9a-f]{2}:){2}[0-9a-f]{2}$/i.test(mac);}
async function shellResult(console,command,kind) {
  const token='LINUX'+randomBytes(16).toString('hex'),a=token.slice(0,16),b=token.slice(16);
  await console.settle();
  console.send(command+`; printf '%s%sR%sEND\\n' '${a}' '${b}' "$result"`);
  const raw=await console.expect(new RegExp(token+'R([0-9.]{1,15})END'),60000);
  const value=raw.slice(token.length+1,-3);
  if(kind==='count' && /^[0-3]$/.test(value))return Number(value);
  if(kind==='ip' && validTarget(value))return value;
  if(kind==='status' && /^(?:0|1)$/.test(value))return Number(value);
  throw Error('Некорректный ответ виртуального клиента');
}
class LinuxGuest {
  constructor({qemu,image,tempRoot,supervisor,localPort,hubPort,mac}) {
    if(![qemu,image,tempRoot,supervisor].every(x=>typeof x==='string'&&path.isAbsolute(x)))throw Error('Недопустимые пути виртуального клиента');
    if(path.basename(qemu).toLowerCase()!=='qemu-system-x86_64.exe'||path.basename(image)!=='cirros-0.6.3-x86_64-disk.img'||path.basename(supervisor).toLowerCase()!=='chr-supervisor.exe')throw Error('Недопустимые компоненты виртуального клиента');
    if(!portOk(localPort)||!portOk(hubPort)||localPort===hubPort||!macOk(mac))throw Error('Недопустимое изолированное соединение клиента');
    Object.assign(this,{qemu,image,tempRoot,supervisor,localPort,hubPort,mac});
    this.server=null;this.socket=null;this.proc=null;this.exitPromise=null;this.console=null;this.directory=null;this.stopPromise=null;this.startWork=null;this.closed=false;this.started=false;this.busy=false;this.failed=false;
    this.cancelled=new Promise(resolve=>{this.cancel=resolve;});
  }
  start(){
    if(this.started||this.closed)return Promise.reject(Error('Клиент уже использован'));
    this.started=true;
    // Keep the underlying start distinct from its error-cleanup wrapper: stop
    // must wait for pending filesystem operations, but must not deadlock on
    // the wrapper that itself calls stop after a start failure.
    this.startWork=this.startOnce();
    return this.startWork.catch(async error=>{await this.stop();throw Error('Не удалось запустить изолированный Linux-клиент: '+error.message);});
  }
  async startOnce(){
      await fs.mkdir(this.tempRoot,{recursive:true});if(this.closed)throw Error('Клиент остановлен');
      this.directory=await fs.mkdtemp(path.join(this.tempRoot,'session-'));if(this.closed)throw Error('Клиент остановлен');
      const disk=path.join(this.directory,'disk.img');await fs.copyFile(this.image,disk,constants.COPYFILE_EXCL);if(this.closed)throw Error('Клиент остановлен');
      this.server=net.createServer();this.server.on('listening',()=>{if(this.closed&&this.server.listening)this.server.close();});
      await Promise.race([new Promise((ok,no)=>{this.server.once('error',no);this.server.listen(0,'127.0.0.1',ok);}),this.cancelled.then(()=>{throw Error('Клиент остановлен');})]);if(this.closed)throw Error('Клиент остановлен');
      const args=['-machine','pc,accel=tcg','-m','256','-smp','1','-display','none','-monitor','none','-no-reboot','-serial',`tcp:127.0.0.1:${this.server.address().port}`,'-drive',`file=${disk.replace(/,/g,',,')},format=qcow2,if=virtio`,'-netdev',`socket,id=lan,udp=127.0.0.1:${this.hubPort},localaddr=127.0.0.1:${this.localPort}`,'-device',`e1000,netdev=lan,mac=${this.mac}`];
      let timer;const accepted=new Promise((ok,no)=>{timer=setTimeout(()=>no(Error('Тайм-аут консоли клиента')),60000);this.server.once('connection',socket=>{if(this.closed){socket.destroy();no(Error('Клиент остановлен'));return;}this.socket=socket;ok(socket);});this.server.once('error',no);});
      this.proc=spawn(this.supervisor,[disk,this.qemu,...args],{stdio:['pipe','ignore','ignore'],windowsHide:true});this.proc.stdin.on('error',()=>{});
      this.exitPromise=new Promise(ok=>{this.proc.once('error',ok);this.proc.once('exit',ok);});
      const socket=await Promise.race([accepted,this.exitPromise.then(()=>{throw Error('QEMU завершился до запуска клиента');}),this.cancelled.then(()=>{throw Error('Клиент остановлен');})]).finally(()=>clearTimeout(timer));
      if(this.closed){socket.destroy();throw Error('Клиент остановлен');}
      this.server.close();this.console=new ChrConsole(socket,{timeout:240000});
      await this.console.expect(/login:\s*$/im,240000);await this.console.settle();this.console.send('cirros');await this.console.expect(/password:\s*$/im,30000);await this.console.settle();this.console.send('gocubsgo');await this.console.expect(/\$\s*$/m,30000);await this.console.settle();
      if(this.closed)throw Error('Клиент остановлен');
  }
  async operation(fn){if(!this.started||this.closed||!this.console||this.failed)throw Error('Клиент недоступен; перезапустите лабораторию');if(this.busy)throw Error('Клиент занят');this.busy=true;try{return await fn();}catch(error){this.failed=true;throw error;}finally{this.busy=false;}}
  async address(){return this.operation(()=>shellResult(this.console,"result=$(ip -4 addr show dev eth0 | awk '/inet / {split($2,a,\"/\");print a[1];exit}')",'ip'));}
  async setStatic(ip,gateway,dns){
    if(!validTarget(ip)||(gateway!==''&&!validTarget(gateway))||!validTarget(dns))throw Error('Недопустимые настройки IPv4 клиента');
    return this.operation(async()=>{
      // Well-known image, fixed commands only. The gateway is from the
      // validated scheme; never interpolate a name or renderer command.
      const cmd='sudo dhcpcd -k eth0 >/dev/null 2>&1 || true; sudo ip addr flush dev eth0 && sudo ip addr add '+ip+'/24 dev eth0 && sudo ip link set eth0 up'+(gateway?' && sudo ip route add default via '+gateway:'')+` && sudo sh -c 'printf "nameserver %s\\n" "${dns}" > /etc/resolv.conf'; result=$?`;
      if(await shellResult(this.console,cmd,'status')!==0)throw Error('Не удалось назначить адрес или DNS клиенту');
      if(await shellResult(this.console,`grep -Fx 'nameserver ${dns}' /etc/resolv.conf >/dev/null; result=$?`,'status')!==0)throw Error('DNS клиента не совпал с выбранной схемой');
    });
  }
  async ping(ip){
    if(!validTarget(ip))throw Error('Укажите допустимый IPv4-адрес');
    return this.operation(async()=>{
      // Parse only the fixed BusyBox ping packet-count line, not terminal output.
      const cmd="out=$(ping -c 3 -W 2 "+ip+" 2>&1); result=$(printf '%s\\n' \"$out\" | sed -n 's/^.*transmitted, *\\([0-3]\\) \\(packets \\)\\{0,1\\}received.*$/\\1/p')";
      return {sent:3,received:await shellResult(this.console,cmd,'count')};
    });
  }
  stop(){if(!this.stopPromise){this.stopPromise=this.stopOnce();this.stopPromise.catch(()=>{this.stopPromise=null;});}return this.stopPromise;}
  async stopOnce(){
    this.closed=true;this.cancel();
    if(this.console)this.console.close();else if(this.socket)this.socket.destroy();
    if(this.server&&this.server.listening)this.server.close();
    if(this.proc&&this.proc.exitCode===null&&this.proc.signalCode===null)this.proc.stdin.end();
    // start may still be making/copying a disk. Wait until it observes closed
    // before deleting the directory, or a late copy can leave private data.
    if(this.startWork)await this.startWork.catch(()=>{});
    if(this.exitPromise){let timer;const done=await Promise.race([this.exitPromise.then(()=>true),new Promise(ok=>{timer=setTimeout(()=>ok(false),10000);})]);clearTimeout(timer);if(!done){this.proc.kill();await this.exitPromise;}}
    if(this.directory)await fs.rm(this.directory,{recursive:true,force:true,maxRetries:5,retryDelay:200});
  }
}
module.exports={LinuxGuest,portOk,macOk,shellResult};
