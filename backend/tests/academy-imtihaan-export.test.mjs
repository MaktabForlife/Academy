import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';

const source=readFileSync(new URL('../../js/m4l-imtihaan-export.js',import.meta.url),'utf8');
const {PDFDocument}=createRequire(import.meta.url)('../../js/vendor/pdf-lib-1.17.1.min.js');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6qlQAAAAASUVORK5CYII=','base64');
const register={id:'mixed-imtihaan',name:'Mixed exam and assignment schedule',status:'REGISTERED',canEdit:true};
const paper=(extra={})=>({registerId:register.id,activityName:'Reboot Your Maktab',className:'All classes',subject:'Qasas',title:'Assessment',assessmentKind:'EXAM',examDate:'2026-12-04',durationMinutes:60,maximumMark:100,published:false,...extra});
function harness(navigator={}){
 const drawn=[],downloads=[],timers=[],links=[];
 const ctx={measureText:text=>({width:String(text).length*10}),fillText:text=>drawn.push(String(text)),fillRect(){},strokeRect(){},save(){},restore(){},translate(){},scale(){},beginPath(){},moveTo(){},lineTo(){},stroke(){}};
 const document={fonts:{ready:Promise.resolve()},body:{appendChild(link){link.connected=true;}},createElement(tag){
  if(tag==='canvas')return {getContext:()=>ctx,toBlob:callback=>callback(new Blob([png],{type:'image/png'}))};
  const link={connected:false,click(){downloads.push({name:this.download,connected:this.connected});},remove(){this.connected=false;}};links.push(link);return link;
 }};
 const window={PDFLib:{PDFDocument}};
 new Function('window','document','navigator','File','Blob','URL','setTimeout',source)(window,document,navigator,File,Blob,{createObjectURL:()=> 'blob:export',revokeObjectURL(){}},fn=>timers.push(fn));
 return {exporter:window.M4L_IMTIHAAN_EXPORT,drawn,downloads,timers,links};
}

test('mixed native exam and assignment dates export as a valid one-page PDF with the chosen due day',async()=>{
 const h=harness();
 const rows=[paper(),paper({assessmentKind:'ASSIGNMENT',examDate:null,dueAt:'2026-12-05T22:00:00.000Z',availableFrom:'2026-10-01T08:00:00Z',timezone:'Africa/Johannesburg',timingMode:'UNTIMED',durationMinutes:null})];
 const file=await h.exporter.prepare(register,rows);
 assert.equal(file.pdf.type,'application/pdf');
 assert.match(file.pdf.name,/-draft.pdf$/);
 const pdf=await PDFDocument.load(await file.pdf.arrayBuffer());assert.equal(pdf.getPageCount(),1);
 assert(h.drawn.includes('4 Dec 2026'));assert(h.drawn.includes('5 Dec 2026'));assert(!h.drawn.includes('6 Dec 2026'));
 assert(h.drawn.includes('Untimed'));assert.equal(file.count,2);
});
test('13:00 assignment deadlines print their exact time without shifting to 12:59',async()=>{
 const h=harness();await h.exporter.prepare(register,[paper({assessmentKind:'ASSIGNMENT',examDate:null,dueAt:'2026-12-05T11:00:00.000Z',timezone:'Africa/Johannesburg',timingMode:'UNTIMED'})]);
 assert(h.drawn.includes('5 Dec 2026'));assert(h.drawn.includes('13:00'));assert(!h.drawn.includes('12:59'));
});
test('assignments with no optional deadline export without treating their opening date as a due date',async()=>{
 const h=harness();await h.exporter.prepare(register,[paper({assessmentKind:'ASSIGNMENT',examDate:null,dueAt:null,availableFrom:'2026-10-01T08:00:00Z',timingMode:'UNTIMED'})]);
 assert(h.drawn.join(' ').includes('No due date'));assert(!h.drawn.includes('1 Oct 2026'));
});
test('deadline formatting uses the assessment time zone and tolerates timestamp-shaped legacy exam dates',async()=>{
 const h=harness();await h.exporter.prepare(register,[paper({assessmentKind:'ASSIGNMENT',examDate:null,dueAt:'2026-12-06T05:00:00Z',timezone:'America/New_York'}),paper({examDate:'2026-12-04T12:00:00+02:00'})]);
 assert(h.drawn.includes('5 Dec 2026'));assert(h.drawn.includes('4 Dec 2026'));
});
test('exports contain only the selected register and retain draft/final status',async()=>{
 const h=harness(),file=await h.exporter.prepare(register,[paper({published:true}),paper({registerId:'outside',examDate:'invalid'})]);
 assert.equal(file.count,1);assert.equal(file.label,'Final');assert.match(file.pdf.name,/-final.pdf$/);
 await assert.rejects(h.exporter.prepare({...register,canEdit:false},[paper()]),/outside your administration access/);
});
test('downloads attach their link to the document and clean up after clicking',()=>{
 const h=harness();h.exporter.download(new File(['pdf'],'schedule.pdf',{type:'application/pdf'}));
 assert.deepEqual(h.downloads,[{name:'schedule.pdf',connected:true}]);assert.equal(h.links[0].connected,false);assert.equal(h.timers.length,1);
});
test('native sharing receives the actual PDF file',async()=>{
 let shared;const h=harness({canShare:()=>true,share:async input=>{shared=input;}}),file=new File(['pdf'],'schedule.pdf',{type:'application/pdf'});
 assert.equal(await h.exporter.share(file,'Imtihaan schedule'),'shared');assert.equal(shared.files[0],file);assert.equal(shared.title,'Imtihaan schedule');assert.equal(h.downloads.length,0);
});
test('share cancellation does not start an unwanted download',async()=>{
 const h=harness({canShare:()=>true,share:async()=>{throw Object.assign(new Error('Cancelled'),{name:'AbortError'});}});
 assert.equal(await h.exporter.share(new File(['pdf'],'schedule.pdf'),'Schedule'),'cancelled');assert.equal(h.downloads.length,0);
});
for(const [label,navigator] of [
 ['unavailable',{}],
 ['unsupported files',{canShare:()=>false,share:async()=>assert.fail('Cannot share this file')}],
 ['lost browser activation',{canShare:()=>true,share:async()=>{throw Object.assign(new Error('Activation expired'),{name:'NotAllowedError'});}}],
 ['capability check failure',{canShare:()=>{throw new TypeError('Unsupported');},share:async()=>assert.fail('Capability check failed')}]
])test('sharing falls back to a PDF download when '+label,async()=>{
 const h=harness(navigator);assert.equal(await h.exporter.share(new File(['pdf'],'schedule.pdf',{type:'application/pdf'}),'Schedule'),'downloaded');assert.equal(h.downloads[0].name,'schedule.pdf');assert.equal(h.downloads[0].connected,true);
});
