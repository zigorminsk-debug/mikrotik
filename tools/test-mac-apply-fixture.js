'use strict';
// Fixed non-sensitive commands for an isolated, disposable CHR only.
const {createHash}=require('crypto');
const E=require('../app/js/lab-sim'),{makePlan}=require('../windows/chr/plan'),{state}=require('./chr-ci-fixture');
const expectedHash='2043111944798745408b19ee3fb089087d290f5012ac0aea93cce57ccb7cabe7';
function fixture(){
 const plan=makePlan(E,state,'r');if(plan.blockers.length)throw Error('Fixture blocked');
 const commands=plan.groups.flatMap(g=>g.commands);
 if(commands.length!==44||createHash('sha256').update(commands.join('\n'),'utf8').digest('hex')!==expectedHash)throw Error('CI fixture digest mismatch');
 return {plan,commands};
}
if(require.main===module){const x=fixture();if(x.commands.some(c=>/[\r\n\0]/.test(c)))throw Error('Invalid fixture');console.log('CI-only, pinned synthetic MAC apply fixture: '+x.commands.length+' commands. No network or router used.');}
module.exports={fixture};
