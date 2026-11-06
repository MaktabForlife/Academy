// Encrypt only the approved synthetic seed for a RAM-held recipient key.
import assert from 'node:assert/strict';
import {createPublicKey,createHash,randomBytes,createCipheriv,publicEncrypt,constants} from 'node:crypto';
import {readFileSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
const sha=value=>createHash('sha256').update(value).digest('hex');
export function sealFeatureSeed(payload,publicPem,commit){
 assert.match(commit,/^[a-f0-9]{40}$/);
 const publicKey=createPublicKey(publicPem);assert.equal(publicKey.asymmetricKeyType,'rsa');assert(publicKey.asymmetricKeyDetails.modulusLength>=3072);
 const recipientSha256=sha(publicPem),plain=Buffer.from(JSON.stringify(payload));assert(plain.length<=100000,'Synthetic seed transport is too large.');
 const key=randomBytes(32),nonce=randomBytes(12),aad=Buffer.from(JSON.stringify(['FEATURE_SYNTHETIC_ENCRYPTED_SEED_V1',commit,recipientSha256]));
 try{
  const cipher=createCipheriv('aes-256-gcm',key,nonce);cipher.setAAD(aad);const ciphertext=Buffer.concat([cipher.update(plain),cipher.final()]);
  return {schema:1,kind:'FEATURE_SYNTHETIC_ENCRYPTED_SEED_V1',commit,recipientSha256,payloadSha256:sha(plain),nonce:nonce.toString('base64url'),tag:cipher.getAuthTag().toString('base64url'),ciphertext:ciphertext.toString('base64url'),wrappedKey:publicEncrypt({key:publicKey,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},key).toString('base64url')};
 }finally{key.fill(0);plain.fill(0);}
}
if(process.argv[1]&&resolve(process.argv[1])===new URL(import.meta.url).pathname){
 assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_REPOSITORY,'MaktabForlife/Academy');assert.equal(process.env.GITHUB_REF,'refs/heads/feature-preview');
 assert.equal(sha(process.env.FEATURE_SEED_RECIPIENT_PUBLIC_KEY),'c1708bc1d11133b95ba8cff7e025aa1b8fe2e325bf4d37654d0e97ba3090d9b5','The reviewed RAM recipient key changed.');
 const [input,output]=process.argv.slice(2);assert(input&&output&&resolve(input)!==resolve(output));
 const payload={core:readFileSync(resolve(input,'core-synthetic-seed.sql'),'utf8'),admin:readFileSync(resolve(input,'admin-synthetic-seed.sql'),'utf8'),receipt:JSON.parse(readFileSync(resolve(input,'synthetic-seed-receipt.json'),'utf8'))};
 const envelope=sealFeatureSeed(payload,process.env.FEATURE_SEED_RECIPIENT_PUBLIC_KEY,process.env.GITHUB_SHA);
 mkdirSync(output,{recursive:true});writeFileSync(resolve(output,'feature-synthetic-seed.encrypted.json'),JSON.stringify(envelope)+'\n');
 for(const name of ['core-synthetic-seed.sql','admin-synthetic-seed.sql','synthetic-seed-receipt.json'])rmSync(resolve(input,name));
 console.log(JSON.stringify({kind:envelope.kind,commit:envelope.commit,recipientSha256:envelope.recipientSha256,encryptedBytes:envelope.ciphertext.length,plaintextUploaded:false}));
}
