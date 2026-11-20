import test from 'node:test';
import assert from 'node:assert/strict';
import {RightsMemo} from '../rights-memo.mjs';
test('permission memo remains bounded as account and permission counts grow',()=>{
 const cache=new RightsMemo({maxBytes:4096,maxEntries:16});
 for(let account=0;account<1000;account++){cache.set('synthetic-'+account,Object.freeze({roles:['student'],grants:Array.from({length:account%20+1},(_,i)=>'permission-'+i)}));assert(cache.budget.serializedPayloadBytes<=4096);assert(cache.size<=16);}
 assert.equal(cache.get('synthetic-0'),undefined);assert(cache.get('synthetic-999'));
});
test('least-recently-used eviction is performance only and oversized values are not retained',()=>{
 const cache=new RightsMemo({maxBytes:1000,maxEntries:2}),a=Object.freeze({role:'a'}),b=Object.freeze({role:'b'});
 cache.set('a',a).set('b',b);assert.equal(cache.get('a'),a);cache.set('c',{role:'c'});assert.equal(cache.get('b'),undefined);assert.equal(cache.get('a'),a);
 cache.set('huge',{data:'x'.repeat(2000)});assert.equal(cache.has('huge'),false);assert(cache.budget.serializedPayloadBytes<=1000);
 cache.clear();assert.equal(cache.budget.serializedPayloadBytes,0);assert.equal(cache.size,0);
});
