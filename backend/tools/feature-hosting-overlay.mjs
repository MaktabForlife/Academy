// Explicit reviewed build variant on a disposable GitHub runner only.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {checkFeatureTargets} from './feature-target-guard.mjs';
if(!process.env.GITHUB_ACTIONS)throw Error('Use the GitHub Feature build.');
const root=resolve(new URL('../..',import.meta.url).pathname),target=checkFeatureTargets(root);
const path=resolve(root,'config/hosting.json'),before=readFileSync(path),variant=readFileSync(resolve(root,'config/hosting.feature.json'));
const sha=x=>createHash('sha256').update(x).digest('hex');
if(JSON.parse(before).environment==='feature')throw Error('Feature variant is already selected.');
writeFileSync(path,variant);
const proof={commit:process.env.GITHUB_SHA,target,overlay:'config/hosting.feature.json -> config/hosting.json',originalSha256:sha(before),variantSha256:sha(variant)};
if(process.argv[2]){mkdirSync(process.argv[2],{recursive:true});writeFileSync(resolve(process.argv[2],'feature-build-variant.json'),JSON.stringify(proof,null,2)+'\n');}
console.log(JSON.stringify(proof));
