// Only public synthetic template preparation. Never accepts a hosted database.
import assert from 'node:assert/strict';
const marker='__PRIVATE_FEATURE_PIN_HASH__';
export function credentialFreeSeedTemplate(seed){
 assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(seed.report.kind,'FEATURE_SYNTHETIC_ONLY');
 assert.deepEqual(seed.report.accounts.map(a=>a.id),['feature-synthetic-global','feature-synthetic-admin-a','feature-synthetic-learner-a','feature-synthetic-outsider']);
 const rows=seed.databases.core.prepare('SELECT account_id,pin_hash FROM account_credentials ORDER BY account_id').all();
 assert.equal(rows.length,4);const hashes=[...new Set(rows.map(x=>x.pin_hash))];assert.equal(hashes.length,1);
 const hash=hashes[0];assert.match(hash,/^v3\$pbkdf2-sha256\$100000\$[-_A-Za-z0-9]{22}\$[0-9a-f]{64}$/);
 assert.equal(seed.sql.core.split(hash).length-1,4);assert(!seed.sql.admin.includes(hash));assert(!JSON.stringify(seed.report).includes(hash));
 const core=seed.sql.core.replaceAll(hash,marker);assert(!core.includes(hash));assert(!core.includes('v3$pbkdf2-sha256$'));
 return {core,admin:seed.sql.admin,publicReport:seed.report,credentialPlaceholders:4,containsCredentialHash:false,executableAsSeed:false};
}
