/* Reads a small ModuleName / TaskName workbook locally. No workbook is uploaded
   until the reviewed, classified module list is explicitly saved. */
(() => {
  'use strict';
  const LIMIT=8*1024*1024;
  const xml=text=>{const doc=new DOMParser().parseFromString(text,'application/xml');if(doc.getElementsByTagName('parsererror').length||/<!DOCTYPE|<!ENTITY/i.test(text))throw Error('The workbook contains invalid XML.');return doc;};
  const tags=(node,name)=>Array.from(node.getElementsByTagNameNS('*',name));
  async function unzip(file){
    if(file.size>2*1024*1024)throw Error('Choose an .xlsx workbook smaller than 2 MB.');
    const bytes=new Uint8Array(await file.arrayBuffer()),v=new DataView(bytes.buffer),decoder=new TextDecoder();let end=-1;
    for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(v.getUint32(i,true)===0x06054b50){end=i;break;}
    if(end<0)throw Error('Choose an Excel .xlsx workbook.');
    const count=v.getUint16(end+10,true);let pos=v.getUint32(end+16,true),total=0;const entries=new Map();
    if(count>300)throw Error('Choose a simple module list with fewer than 300 workbook files.');
    for(let i=0;i<count;i++){
      if(pos+46>bytes.length||v.getUint32(pos,true)!==0x02014b50)throw Error('The workbook is incomplete.');
      const flags=v.getUint16(pos+8,true),method=v.getUint16(pos+10,true),size=v.getUint32(pos+20,true),expanded=v.getUint32(pos+24,true),len=v.getUint16(pos+28,true),extra=v.getUint16(pos+30,true),comment=v.getUint16(pos+32,true),offset=v.getUint32(pos+42,true);
      const name=decoder.decode(bytes.slice(pos+46,pos+46+len));total+=expanded;
      if(flags&1||![0,8].includes(method)||total>LIMIT||entries.has(name)||name.includes('..'))throw Error('Choose a simple, unencrypted module workbook smaller than 8 MB when opened.');
      entries.set(name,{method,size,expanded,offset});pos+=46+len+extra+comment;
    }
    return async name=>{
      const e=entries.get(name);if(!e)return null;
      if(e.offset+30>bytes.length||v.getUint32(e.offset,true)!==0x04034b50)throw Error('The workbook is incomplete.');
      const start=e.offset+30+v.getUint16(e.offset+26,true)+v.getUint16(e.offset+28,true);
      if(start+e.size>bytes.length)throw Error('The workbook is incomplete.');
      let data=bytes.slice(start,start+e.size);
      if(e.method===8){
        let stream;try{stream=new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));}catch{throw Error('This browser cannot open .xlsx files. Use a current browser, or save the list as CSV.');}
        const reader=stream.getReader(),chunks=[];let n=0;
        while(true){const part=await reader.read();if(part.done)break;n+=part.value.length;if(n>e.expanded||n>LIMIT){await reader.cancel();throw Error('The workbook is too large.');}chunks.push(part.value);}
        data=new Uint8Array(n);let offset=0;for(const c of chunks){data.set(c,offset);offset+=c.length;}
      }
      if(data.length!==e.expanded)throw Error('The workbook is incomplete.');return decoder.decode(data);
    };
  }
  function csv(text){
    const rows=[];let row=[],cell='',quoted=false;
    for(let i=0;i<text.length;i++){
      const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else if(!cell||quoted)quoted=!quoted;else throw Error('Check the CSV quotation marks.');}
      else if(c===','&&!quoted){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';}else cell+=c;
    }
    if(quoted)throw Error('Check the CSV quotation marks.');if(cell||row.length){row.push(cell);rows.push(row);}return rows;
  }
  async function rows(file){
    if(/\.csv$/i.test(file.name)){if(file.size>2*1024*1024)throw Error('Choose a CSV smaller than 2 MB.');return csv(await file.text());}
    if(!/\.xlsx$/i.test(file.name))throw Error('Choose an .xlsx or CSV module list.');
    const read=await unzip(file),book=xml(await read('xl/workbook.xml')||''),rels=xml(await read('xl/_rels/workbook.xml.rels')||'');
    const sheet=tags(book,'sheet')[0],rel=tags(rels,'Relationship').find(r=>r.getAttribute('Id')===sheet?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id'));
    const target=rel?.getAttribute('Target');if(!target||rel.getAttribute('TargetMode')==='External'||target.includes('..'))throw Error('The first worksheet could not be read.');
    const path=target.startsWith('/')?target.slice(1):'xl/'+target;
    const shared=await read('xl/sharedStrings.xml'),strings=shared?tags(xml(shared),'si').map(n=>tags(n,'t').map(t=>t.textContent).join('')):[];
    const page=xml(await read(path)||''),out=[];
    for(const r of tags(page,'row')){
      const cells=[];for(const c of tags(r,'c')){
        if(tags(c,'f').length)throw Error('Use plain text for module and task names; remove formulas from the list.');
        const ref=c.getAttribute('r')||'',letters=/^[A-Z]+/.exec(ref)?.[0];if(!letters)throw Error('A worksheet cell has no position.');
        let index=0;for(const x of letters)index=index*26+x.charCodeAt(0)-64;index--;
        if(index>10)throw Error('Use a simple list with ModuleName and TaskName columns.');
        const type=c.getAttribute('t'),value=tags(c,'v')[0]?.textContent||'';
        cells[index]=type==='s'?strings[Number(value)]:type==='inlineStr'?tags(c,'t').map(t=>t.textContent).join(''):value;
      }
      if(cells.some(v=>String(v??'').trim()))out.push(cells);if(out.length>501)throw Error('Upload at most 500 task rows at a time.');
    }
    return out;
  }
  window.M4L_MEMORISATION_UPLOAD={async read(file){
    const data=(await rows(file)).filter(r=>r.some(v=>String(v??'').trim()));
    const headers=(data.shift()||[]).map(v=>String(v).replace(/^\uFEFF/,'').trim().toLowerCase()),moduleCol=headers.indexOf('modulename'),taskCol=headers.indexOf('taskname'),subjectCol=headers.indexOf('subject'),levelCol=headers.indexOf('level');
    if(moduleCol<0||taskCol<0)throw Error('The first row must contain ModuleName and TaskName. Optional columns: Subject and Level.');
    const modules=new Map();
    for(const [i,row] of data.entries()){
      const name=String(row[moduleCol]??'').trim(),task=String(row[taskCol]??'').trim();
      if(!name||!task)throw Error(`Row ${i+2} needs both ModuleName and TaskName.`);
      if(name.length>160||task.length>240)throw Error(`Shorten the name in row ${i+2}.`);
      const key=name.toLowerCase(),rawSubject=String(row[subjectCol]||'').trim().toUpperCase();
      const subject=['SURAHS','SURAH'].includes(rawSubject)?'SURAHS':['DUAS','DUA'].includes(rawSubject)?'DUAS':/^surahs?\b/i.test(name)?'SURAHS':/^duas?\b/i.test(name)?'DUAS':'';
      const level=String(row[levelCol]||/\d+$/.exec(name)?.[0]||'').trim();
      if(!modules.has(key))modules.set(key,{name,subject,level,tasks:[]});
      const m=modules.get(key);if(m.subject!==subject||m.level!==level)throw Error(`Keep Subject and Level consistent for ${name}.`);
      if(m.tasks.some(t=>t.toLowerCase()===task.toLowerCase()))throw Error(`Repeated task in ${name}: ${task}`);m.tasks.push(task);
      if(m.tasks.length>100||modules.size>30)throw Error('Upload at most 30 modules, with at most 100 tasks in each.');
    }
    if(!modules.size)throw Error('The workbook has no tasks.');return [...modules.values()];
  }};
})();
