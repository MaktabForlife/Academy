import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,privateDecrypt,createDecipheriv,createHash,constants} from 'node:crypto';
import {sealFeatureSeed} from '../tools/feature-seed-encrypt.mjs';
test('Synthetic seed artifact contains authenticated ciphertext only and decrypts solely with the RAM-held recipient',()=>{
 const pair=generateKeyPairSync('rsa',{modulusLength:3072}),pem=pair.publicKey.export({type:'spki',format:'pem'}),commit='a'.repeat(40);
 const payload={core:"INSERT INTO accounts VALUES('synthetic-only');",admin:'synthetic-admin',receipt:{syntheticOnly:true}};
 const sealed=sealFeatureSeed(payload,pem,commit);
 assert(!JSON.stringify(sealed).includes('INSERT INTO accounts'));assert(!JSON.stringify(sealed).includes('synthetic-admin'));
 const key=privateDecrypt({key:pair.privateKey,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},Buffer.from(sealed.wrappedKey,'base64url'));
 const open=value=>{const d=createDecipheriv('aes-256-gcm',key,Buffer.from(value.nonce,'base64url'));d.setAAD(Buffer.from(JSON.stringify([value.kind,value.commit,value.recipientSha256])));d.setAuthTag(Buffer.from(value.tag,'base64url'));return Buffer.concat([d.update(Buffer.from(value.ciphertext,'base64url')),d.final()]);};
 const plain=open(sealed);assert.deepEqual(JSON.parse(plain),payload);assert.equal(createHash('sha256').update(plain).digest('hex'),sealed.payloadSha256);
 assert.throws(()=>open({...sealed,commit:'b'.repeat(40)}));
 const changed=Buffer.from(sealed.ciphertext,'base64url');changed[0]^=1;assert.throws(()=>open({...sealed,ciphertext:changed.toString('base64url')}));
 key.fill(0);plain.fill(0);
});
