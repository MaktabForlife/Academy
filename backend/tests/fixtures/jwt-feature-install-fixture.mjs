// LOCAL ONLY: schema receipt is illustrative; it is not a hosted DDL receipt.
import {readFileSync} from 'node:fs';
import {setupContract} from '../../tools/jwt-feature-setup-contract.mjs';
const json=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
export const bw=json('../../wrangler.feature.jsonc'),bc=json('../../wrangler.feature-coordinator.jsonc'),baseline=json('../../../config/feature-initialisation-receipt.json');
import {compileInstallPackage} from '../../tools/jwt-feature-install-package.mjs';
export const ids=['cdbe97bc-f3d9-400e-8806-ed9a0d143d26','ed77f2a7-4439-4841-8691-2b41063d8960'];
export const schemaFixture=()=>({schema:1,state:'STARTING_FOOTPRINT_REVIEWED_PRIVATE_ATTESTATION_PENDING',planId:'JWT_FEATURE_FRESH_20261106a',accountId:bw.account_id,databaseNames:['jwt-feature-core-20261106a','jwt-feature-admin-20261106a'],databaseIds:ids,
 ddlHashes:{core:'1b2d6c85ee3fd797a7fab9bb297d7b700b30542a4fba1428996da21236afa9ce',admin:'0cebae64a69e62a235b3828eb39d1001e3d23b992ffeb391920239096018a830',auth:'f9e8948fc4459cb85b6609da0cac488d2e9bec8d438b1c3ecd43e16062aeed0d'},
 startingFootprints:{core:{observedObjects:1,orderedDefinitionHash:'746047e55a185d77723c183c1652a18afafa0ea6a9ced7a623c652fe404c90bc',firstDefinitionHash:'ba6adc0dad88252e65296438061de7e8d62e238bcfd1aa882817f5e4a536f739',userRows:'NOT_QUERIED'},admin:{observed:'NOT_OPENED',expectedObjects:0,expectedOrderedDefinitionHash:'4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945'}},
 observed:{coreEditorSQLSubmissions:7,adminEditorOpened:false,failedBatchUsage:'UNMEASURED'},reviewedSchemaPrimitive:'4ca61b81d57b8b9419a1fa2a4072d6272f28e9ba',reviewedAt:'2026-11-06T00:00:00.000Z'});
export function packageFixture(){
 const source=process.env.GITHUB_SHA,{contract}=setupContract({source,databaseIds:ids,structuredDDL:true}),receipt=schemaFixture(),issued=Math.floor(Date.now()/1000);
 const p=compileInstallPackage({baseWorker:bw,baseCoordinator:bc,baseline,schemaReceipt:receipt,contract,source,owner:'12345-1',issued,expires:issued+900});
 p.publicManifest.coordinatorSourceDigest='e'.repeat(64); // Illustrative LOCAL provenance only.
 return {p,contract,receipt};
}
