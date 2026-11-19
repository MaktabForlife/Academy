import test from 'node:test';
import assert from 'node:assert/strict';
import {compactFloors,coversFloor} from '../floors.mjs';
test('typed account floors preserve a recovered credential pair',()=>{
 const cutoff={type:'accountCutoff',sub:'a',maxCe:4,maxAe:9};
 assert(coversFloor({...cutoff,maxAe:10},cutoff));assert(!coversFloor({...cutoff,sub:'b',maxAe:999},cutoff));
 assert(!coversFloor({...cutoff,maxCe:3,maxAe:999},cutoff));
});
test('dependency floors compact by actual owner epoch/revision, not publication cr',()=>{
 const base={type:'dependency',id:'roles',ownerEpoch:'one',revision:1,effect:'DENY',deniedActions:['read']};
 assert.equal(compactFloors(Array.from({length:1000},(_,i)=>({...base,revision:i+1}))).length,1);
 assert(!coversFloor({...base,ownerEpoch:'two',revision:100},base));
 assert(!coversFloor({...base,effect:'INVALIDATE',deniedActions:[]},base));
});
test('larger policy revision alone does not prove earlier shorter-clock application',()=>{
 const p={type:'policy',policyId:'session-inactivity',ownerEpoch:'e',revision:1,inactivityMinutes:15};
 assert(!coversFloor({...p,revision:2,inactivityMinutes:200},p));assert.equal(compactFloors([p,{...p,revision:2,inactivityMinutes:200}]).length,2);
});
