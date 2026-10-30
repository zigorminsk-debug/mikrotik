'use strict';
// Fixed synthetic values for isolated Windows CI; no provider or user data.
const base = require('./chr-ci-fixture').state;
const state = JSON.parse(JSON.stringify(base));
state.devices.find(d => d.id === 'r').cfg.wanFailover = true;
state.devices.push({id:'isp2',type:'isp',name:'Test backup ISP',cfg:{kind:'static',priority:'backup',ip:'198.51.101.2/30',gw:'198.51.101.1',dns:'8.8.8.8'}});
state.links.push({a:'r',b:'isp2'});
module.exports = {state};
