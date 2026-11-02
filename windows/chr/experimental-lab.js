'use strict';
// CI-only integration experiment. Never expose through IPC: UDP loopback is
// not a trust boundary; image authenticity/rights and process isolation need
// separate review before this can be a user-facing feature.
const dgram=require('dgram');
const {randomBytes}=require('crypto');
const {makePlan}=require('./plan');
const {endpointPlan}=require('./endpoint-plan');
const {ChrSession}=require('./session');
const {LinuxGuest}=require('./linux-guest');
const {EthernetHub}=require('./ethernet-hub');
async function reservePort(used){
  for(let attempt=0;attempt<30;attempt++){
    const socket=dgram.createSocket('udp4');
    let port;
    try {port=await new Promise((ok,no)=>{socket.once('error',no);socket.bind(0,'127.0.0.1',()=>ok(socket.address().port));});}
    finally {await new Promise(ok=>{try{socket.close(ok);}catch(_){ok();}});}
    if(!used.has(port)){used.add(port);return port;}
  }
  throw Error('Не удалось выделить порт виртуальной сети');
}
class ExperimentalLab {
  constructor({engine,state,routerId,qemu,chrImage,linuxImage,tempRoot,supervisor}) {
    this.plan=makePlan(engine,state,routerId);this.endpoints=endpointPlan(engine,state,routerId);
    const blockers=[...this.plan.blockers,...this.endpoints.blockers];
    // A generic Linux guest is not a printer. Do not silently substitute one.
    if(state.devices.some(x=>x.type==='printer'))blockers.push('Виртуальный принтер пока не реализован; Linux-клиент не заменяет печатающее устройство.');
    if(!blockers.length){
      const number=ip=>ip.split('.').reduce((n,x)=>n*256+Number(x),0);
      const [first,last]=this.plan.expected.lanPool.split('-').map(number);
      for(const segment of this.endpoints.segments)for(const client of segment.clients){
        if(client.mode==='static'&&number(client.ip)>=first&&number(client.ip)<=last)blockers.push('Статический адрес клиента пересекается с пулом DHCP. Измените адрес, чтобы избежать конфликта.');
      }
    }
    if(blockers.length)throw Error(blockers.join('\n'));
    this.paths={qemu,chrImage,linuxImage,tempRoot,supervisor};this.hubs=[];this.guests=new Map();this.router=null;
    this.closed=false;this.started=false;this.startWork=null;this.stopPromise=null;this.exitPromise=null;this.unexpectedExit=false;
  }
  check(){if(this.closed)throw Error('Лаборатория остановлена');if(this.unexpectedExit)throw Error('Одна из виртуальных машин завершилась');}
  track(vm){vm.exitPromise.then(()=>{if(!this.closed)this.unexpectedExit=true;});}
  start(){
    if(this.started||this.closed)return Promise.reject(Error('Лаборатория уже использована'));
    this.started=true;this.startWork=this.startOnce();
    return this.startWork.catch(async error=>{await this.stop();throw error;});
  }
  async startOnce(){
    const used=new Set(),links=[],members=[];
    for(const segment of this.endpoints.segments){
      const hub=await EthernetHub.create();this.hubs.push(hub);this.check();
      if(used.has(hub.port))throw Error('Конфликт портов виртуальной сети');used.add(hub.port);
      const routerPort=await reservePort(used);this.check();hub.addPeer(routerPort);links.push({name:segment.routerPort,localPort:routerPort,hubPort:hub.port});
      for(const endpoint of segment.clients){const port=await reservePort(used);this.check();hub.addPeer(port);members.push({endpoint,port,hubPort:hub.port});}
    }
    this.check();
    this.router=new ChrSession({qemu:this.paths.qemu,image:this.paths.chrImage,tempRoot:this.paths.tempRoot,supervisor:this.paths.supervisor,experimentalIsolatedLinks:links});
    const info=await this.router.start(this.plan);this.track(this.router);this.check();
    const prefix=randomBytes(2).toString('hex').match(/../g);
    for(let index=0;index<members.length;index++){
      const {endpoint,port,hubPort}=members[index];
      const mac='52:54:00:'+prefix.join(':')+':'+(index+1).toString(16).padStart(2,'0');
      const guest=new LinuxGuest({qemu:this.paths.qemu,image:this.paths.linuxImage,tempRoot:this.paths.tempRoot,supervisor:this.paths.supervisor,localPort:port,hubPort,mac});
      this.guests.set(endpoint.id,guest);await guest.start();this.track(guest);this.check();
      if(endpoint.mode==='static')await guest.setStatic(endpoint.ip,endpoint.gateway);
      const address=await guest.address();this.check();
      if(endpoint.mode==='static'&&address!==endpoint.ip)throw Error('Адрес Linux-клиента не совпал с выбранной схемой');
      endpoint.actualAddress=address;
    }
    this.exitPromise=Promise.race([this.router,...this.guests.values()].map(vm=>vm.exitPromise));
    return {router:info,clients:members.map(({endpoint})=>({id:endpoint.id,type:endpoint.type,mode:endpoint.mode,address:endpoint.actualAddress}))};
  }
  async pingClient(id,address){this.check();const guest=this.guests.get(id);if(!guest)throw Error('Виртуальный клиент не найден');return guest.ping(address);}
  async ping(address){this.check();return this.router.ping(address);}
  async resolve(name){this.check();return this.router.resolve(name);}
  stop(){if(!this.stopPromise){this.stopPromise=this.stopOnce();this.stopPromise.catch(()=>{this.stopPromise=null;});}return this.stopPromise;}
  async stopOnce(){
    this.closed=true;
    // Request termination before waiting for start, otherwise a booting VM can
    // keep the start task alive. Wait for each cleanup again after start settles.
    const early=[...this.guests.values(),...(this.router?[this.router]:[])].map(x=>x.stop().catch(()=>{}));
    if(this.startWork)await this.startWork.catch(()=>{});
    await Promise.all(early);
    const errors=[];
    for(const vm of [...this.guests.values()].reverse())try{await vm.stop();}catch(e){errors.push(e);}
    if(this.router)try{await this.router.stop();}catch(e){errors.push(e);}
    for(const hub of this.hubs.reverse())try{await hub.close();}catch(e){errors.push(e);}
    if(errors.length)throw Error('Не удалось удалить временные данные виртуальной лаборатории');
  }
}
module.exports={ExperimentalLab,reservePort};
