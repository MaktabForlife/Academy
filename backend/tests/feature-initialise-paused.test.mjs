import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assertSeeded,isolatedNamespaces,redactInstallationDiagnostic} from '../tools/feature-initialise-paused.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../../'+p,import.meta.url),'utf8'));
test('First Feature installation stays closed for wrong stores, unverified seeds, live effects and unknown baselines',()=>{
 const good=()=>[read('config/feature-seed-installation-receipt.json'),read('config/feature-first-installation-baseline.json')];assertSeeded(...good());
 const changes=[a=>a[0].state='PENDING',a=>a[0].accountId='wrong',a=>a[0].databaseIds[0]='1c8aece3-dc1d-40d1-8a82-01ab4f63336f',a=>a[0].foreignKeyErrors.core=1,a=>a[0].syntheticAccounts=5,a=>a[0].existingDatabaseEffects=1,a=>a[0].featureActivated=true,a=>a[0].schemaHashes.admin='0'.repeat(64),a=>a[1].workerMigrationTag='unknown',a=>a[1].oldLiveNamespaces=[]];
 for(const change of changes){const a=good();change(a);assert.throws(()=>assertSeeded(...a));}
});
test('First Feature install requires new distinct namespaces belonging to only its exact two scripts',()=>{
 const make=()=>[{bindings:[{name:'ACADEMY_SPLIT_COORDINATOR',type:'durable_object_namespace',class_name:'AcademySplitCoordinator',namespace_id:'1'.repeat(32),script_name:'academy-feature-split-coordinator'},{name:'PROGRAM_TIMETABLE_COORDINATOR',type:'durable_object_namespace',class_name:'ProgramTimetableCoordinator',namespace_id:'2'.repeat(32),script_name:'feature_worker'}]},{bindings:[{name:'ACADEMY_SPLIT_COORDINATOR',type:'durable_object_namespace',class_name:'AcademySplitCoordinator',namespace_id:'1'.repeat(32),script_name:'academy-feature-split-coordinator'}]}];
 assert.equal(isolatedNamespaces(...make()).timetableNamespaceId,'2'.repeat(32));
 for(const change of [a=>a[0].bindings[1].namespace_id='aa75328c13ee4f42b406ccf5ebbe851a',a=>a[0].bindings[0].script_name='academy_split_coordinator',a=>a[0].bindings[1].namespace_id='1'.repeat(32),a=>a[1].bindings[0].namespace_id='3'.repeat(32)]){const a=make();change(a);assert.throws(()=>isolatedNamespaces(...a));}
});
test('Retained installation diagnostics remove raw, JSON-escaped and Cloudflare credential values',()=>{
 const values=['synthetic-private-value-1234567890','synthetic\nmulti"line-value'],text='HTTP 403 '+values[0]+' '+JSON.stringify(values[1])+' cfat_not_a_real_token_123';
 const clean=redactInstallationDiagnostic(text,values);
 assert(clean.includes('HTTP 403'));for(const value of [...values,...values.map(x=>JSON.stringify(x).slice(1,-1)),'cfat_not_a_real_token_123'])assert(!clean.includes(value));
});
