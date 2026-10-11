import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const root=new URL('../../',import.meta.url),data=JSON.parse(readFileSync(new URL('data/academy-memorisation-modules.json',root)));
const file=new URL('migrations/academy/0013_memorisation_tasks.sql',root),marker='-- Workbook seed: modueles.xlsx';
const q=s=>"'"+String(s).replaceAll("'","''")+"'";
const sql=[marker,`-- Source SHA-256: ${data.sourceSha256}. Only surrounding whitespace is trimmed.`];
for(const subject of ['SURAHS','DUAS']){
  const name=subject==='SURAHS'?'Surahs':'Duas';
  sql.push(`INSERT INTO subject_catalog(subject_key,source_namespace,subject_id,name,active) SELECT 'ACADEMY:MEM-${subject}','ACADEMY','MEM-${subject}',${q(name)},1 WHERE NOT EXISTS(SELECT 1 FROM subject_catalog WHERE source_namespace='ACADEMY' AND lower(trim(name))=${q(name.toLowerCase())});`);
}
for(const [i,m] of data.modules.entries()){
  const subjectName=m.subject==='SURAHS'?'surahs':'duas',id=`MEM-${m.subject}-${m.level}`;
  const lookup=`SELECT c.module_id FROM academy_module_catalogue c JOIN subject_catalog s USING(subject_key) WHERE s.source_namespace='ACADEMY' AND lower(trim(s.name))=${q(subjectName)} AND c.name_key=${q(m.name.toLowerCase())}`;
  sql.push(`INSERT INTO academy_module_catalogue(module_id,subject_key,name,name_key,active,revision) SELECT ${q(id)},s.subject_key,${q(m.name)},${q(m.name.toLowerCase())},1,1 FROM subject_catalog s WHERE s.source_namespace='ACADEMY' AND lower(trim(s.name))=${q(subjectName)} AND NOT EXISTS(SELECT 1 FROM academy_module_catalogue c WHERE c.subject_key=s.subject_key AND c.name_key=${q(m.name.toLowerCase())});`);
  sql.push(`INSERT INTO memorisation_modules(module_id,subject,level,sort_order) SELECT module_id,${q(m.subject)},${q(m.level)},${i} FROM (${lookup});`);
  for(const [n,name] of m.tasks.entries())sql.push(`INSERT INTO memorisation_tasks(task_id,module_id,name,sort_order) SELECT ${q(id+'-'+String(n+1).padStart(2,'0'))},module_id,${q(name)},${n} FROM (${lookup});`);
}
const current=readFileSync(file,'utf8'),generated=current.split(marker)[0]+sql.join('\n')+'\n';
if(process.argv.includes('--check'))assert.equal(current,generated,'Workbook seed differs from the inspected source JSON');else writeFileSync(file,generated);
console.log(JSON.stringify({modules:data.modules.length,tasks:data.modules.reduce((n,m)=>n+m.tasks.length,0),checked:process.argv.includes('--check')}));
