import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';

export const digest=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
export const identifier=name=>{if(!/^[a-z_][a-z_0-9]*$/i.test(name))throw Error('Invalid schema identifier');return '"'+name+'"';};
export function restoreSnapshot(snapshot){
 if(snapshot.format!=='ACADEMY_PRIVATE_RECOVERY_V1')throw Error('Use a verified Academy recovery snapshot.');
 const db=new DatabaseSync(':memory:');
 try{
  const schema=snapshot.records.filter(r=>r.kind==='SCHEMA');db.exec('PRAGMA foreign_keys=OFF');
  for(const row of schema.filter(r=>r.type==='table'))db.exec(row.data);
  for(const record of snapshot.records.filter(r=>r.kind==='DATA'))for(const row of JSON.parse(record.data)){
   const names=Object.keys(row);db.prepare('INSERT INTO '+identifier(record.name)+'('+names.map(identifier).join(',')+') VALUES('+names.map(()=>'?').join(',')+')').run(...Object.values(row));
  }
  for(const row of schema.filter(r=>r.type!=='table'))db.exec(row.data);
  db.exec('PRAGMA foreign_keys=ON');if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Source snapshot integrity failed');
  return db;
 }catch(error){db.close();throw error;}
}
