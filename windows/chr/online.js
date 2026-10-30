'use strict';
// Fail closed. Only these explicitly configured synthetic WANs have been
// prepared for an internet experiment. Never replace selected user addresses.
// They are two NATs on one host, not separate physical providers.
function validateDualInternet(expected) {
  if (!expected || !Array.isArray(expected.wans) || expected.wans.length !== 2 || !Array.isArray(expected.lanPorts)) return false;
  const wanted = [
    {port:'ether1',address:'10.0.2.20/24',gateway:'10.0.2.2',distance:'1'},
    {port:'ether4',address:'10.0.3.20/24',gateway:'10.0.3.2',distance:'2'}
  ];
  return wanted.every(w => expected.wans.filter(x => x && Object.keys(w).every(k => x[k] === w[k])).length === 1)
    && expected.wanPort === wanted[0].port && expected.wanAddress === wanted[0].address && expected.wanGateway === wanted[0].gateway
    && expected.dns === '10.0.2.3,10.0.3.3'
    && !expected.lanPorts.some(p => !p || p.name === 'ether1' || p.name === 'ether4');
}
module.exports = {validateDualInternet};
