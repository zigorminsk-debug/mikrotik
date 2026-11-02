'use strict';
// Synthetic documentation-only data for one-use CHR tests. Not user data.
const sec=(id,rows)=>({id,status:'ok',rows});
function fixture(){return {snapshot:{sections:[
 sec('interfaces',[{name:'physical-1',type:'ether'},{name:'physical-2',type:'ether'}]),
 sec('bridge',[{name:'bridge-physical',disabled:'false','vlan-filtering':'false','protocol-mode':'rstp'}]),
 sec('bridge-ports',[{bridge:'bridge-physical',interface:'physical-1',disabled:'false',pvid:'1','ingress-filtering':'false','frame-types':'admit-all'},{bridge:'bridge-physical',interface:'physical-2',disabled:'false',pvid:'1','ingress-filtering':'false','frame-types':'admit-all'}]),
 sec('bridge-vlans',[]),sec('addresses',[{interface:'bridge-physical',disabled:'false',dynamic:'false',address:'192.0.2.1/24'}])]},
 mapping:[{source:'physical-1',target:'ether2'},{source:'physical-2',target:'ether3'}]};}
module.exports={fixture};
