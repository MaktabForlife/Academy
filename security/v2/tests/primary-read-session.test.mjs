import test from 'node:test';
import assert from 'node:assert/strict';
import {PrimaryStore} from '../store.mjs';
function provider(){
 let current={revision:1},replica={revision:1},sessions=0;
 const db={withSession(mode){
  assert.equal(mode,'first-primary');sessions++;let first=true;
  return {prepare(sql){let args=[];return {bind(...values){args=values;return this;},async first(){const row=first?current:replica;first=false;return structuredClone(row);},async all(){const row=first?current:replica;first=false;return {results:[structuredClone(row)]};}};},async batch(){return [];}};
 }};
 return {db,write:value=>{current=value;},sessions:()=>sessions};
}
test('a reused owning store reads latest primary on each authoritative first() call',async()=>{
 const f=provider(),store=new PrimaryStore(f.db,{app:'studio',env:'production'});
 assert.equal((await store.first('SELECT revision FROM synthetic')).revision,1);f.write({revision:2});assert.equal((await store.first('SELECT revision FROM synthetic')).revision,2);
});
test('authoritative all() does not inherit an earlier request replica bookmark',async()=>{
 const f=provider(),store=new PrimaryStore(f.db,{app:'hifz',env:'production'});
 assert.equal((await store.all('SELECT revision FROM synthetic'))[0].revision,1);f.write({revision:3});assert.equal((await store.all('SELECT revision FROM synthetic'))[0].revision,3);
});
test('lifecycle recovery sees newly committed ACTIVE evidence instead of a stale missing/seed read',async()=>{
 const f=provider(),store=new PrimaryStore(f.db,{app:'studio',env:'production',securityPrefix:'auth-private/v2/production/studio/test/'});
 assert.equal((await store.lifecycle('synthetic-control')).revision,1);f.write({state:'ACTIVE',semantic_revision:2});assert.equal((await store.lifecycle('synthetic-control')).state,'ACTIVE');
});
