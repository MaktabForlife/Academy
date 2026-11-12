import {markBounds,textLayout} from './m4l-pdf-compare-model.mjs?v=107.43';

const types=new Set(['text','pen','highlight','rectangle','ellipse','line','arrow']);
const finite=value=>typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<1e7;
export function validMark(mark){
 if(!mark||typeof mark!=='object'||!types.has(mark.type)||!Number.isInteger(mark.page)||mark.page<1||typeof mark.id!=='string'||mark.id.length>150||!/^#[\da-f]{6}$/i.test(mark.colour))return false;
 if(!finite(mark.width??2)||mark.width<0||mark.width>200)return false;
 if(mark.fillColour!==undefined&&!/^#[\da-f]{6}$/i.test(mark.fillColour))return false;
 if(mark.type==='text'&&(typeof mark.text!=='string'||mark.text.length>20000||!finite(mark.size)||mark.size<1||mark.size>300||!['auto','ltr','rtl'].includes(mark.direction)))return false;
 if(['line','arrow'].includes(mark.type)&&(!Array.isArray(mark.points)||mark.points.length!==2||mark.paths))return false;
 if(['text','rectangle','ellipse'].includes(mark.type)&&(mark.points||mark.paths))return false;
 const paths=mark.paths||mark.points&&[mark.points];
 if(paths)return Array.isArray(paths)&&paths.length>0&&paths.length<=1000&&paths.every(path=>Array.isArray(path)&&path.length>0&&path.length<=100000&&path.every(p=>p&&finite(p.x)&&finite(p.y)))&&paths.reduce((total,path)=>total+path.length,0)<=200000;
 return [mark.x,mark.y,mark.w,mark.h].every(finite)&&mark.w>0&&mark.h>0;
}
export function markPaths(mark){
 if(mark.paths)return mark.paths;
 if(mark.points){
  if(mark.type!=='arrow')return [mark.points];
  const [a,b]=mark.points,angle=Math.atan2(b.y-a.y,b.x-a.x),length=Math.max(12,mark.width*5);
  return [[a,b],[{x:b.x-length*Math.cos(angle-.5),y:b.y-length*Math.sin(angle-.5)},b,{x:b.x-length*Math.cos(angle+.5),y:b.y-length*Math.sin(angle+.5)}]];
 }
 const {x,y,w,h}=mark;
 if(mark.type==='ellipse')return [Array.from({length:65},(_,i)=>({x:x+w/2+w/2*Math.cos(i*Math.PI/32),y:y+h/2+h/2*Math.sin(i*Math.PI/32)}))];
 return [[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h},{x,y}]];
}
const hexColour=colour=>[1,3,5].map(i=>parseInt(colour.slice(i,i+2),16));
const colourHex=colour=>'#'+Array.from(colour||[41,35,54]).map(c=>Math.round(c).toString(16).padStart(2,'0')).join('');
export function annotationRecord(mark,viewport,editorTypes,measureContext){
 const unit=viewport.userUnit||1,b=markBounds(mark),pad=mark.type==='text'?0:Math.max(3,mark.width*(mark.type==='highlight'?3:1));
 const corners=[[b.x-pad,b.y-pad],[b.x+b.w+pad,b.y+b.h+pad]].map(([x,y])=>viewport.convertToPdfPoint(x,y));
 const rect=[Math.min(corners[0][0],corners[1][0]),Math.min(corners[0][1],corners[1][1]),Math.max(corners[0][0],corners[1][0]),Math.max(corners[0][1],corners[1][1])];
 const base={pageIndex:mark.page-1,rect,rotation:viewport.rotation||0,color:hexColour(mark.colour)};
 if(mark.type==='text'){
  const value=measureContext?textLayout(measureContext,mark).lines.join('\n'):mark.text;
  return {...base,annotationType:editorTypes.FREETEXT,fontSize:mark.size/unit,value};
 }
 const paths=markPaths(mark).map(path=>path.map(p=>viewport.convertToPdfPoint(p.x,p.y))),points=paths.map(path=>path.flat()),lines=paths.map(path=>path.flatMap(([x,y])=>[NaN,NaN,NaN,NaN,x,y]));
 if(mark.polygon)return {...base,annotationType:editorTypes.HIGHLIGHT,opacity:.3,quadPoints:Float32Array.from(paths.flatMap(path=>[path[0],path[1],path[3],path[2]].flat())),outlines:points};
 return {...base,annotationType:editorTypes.INK,opacity:mark.type==='highlight'?.3:1,thickness:mark.width*(mark.type==='highlight'?6:1)/unit,paths:{points,lines}};
}
function fingerprint(dict,PDFName){return JSON.stringify(['Rect','Contents','DA','C','CA','BS','Rotate','AP'].map(key=>dict.get(PDFName.of(key))?.toString()||''));}
function refId(ref){return Number.isInteger(ref?.objectNumber)?ref.objectNumber+'R'+(ref.generationNumber||''):'';}
function rawAnnotations(doc,lib){
 const result=new Map();
 doc.getPages().forEach((page,index)=>{const list=page.node.lookupMaybe(lib.PDFName.of('Annots'),lib.PDFArray);for(let i=0;list&&i<list.size();i++){const ref=list.get(i),dict=doc.context.lookup(ref);if(dict instanceof lib.PDFDict)result.set(refId(ref),{dict,ref,page:index+1});}});
 return result;
}
// Extract supported annotations into editable objects and remove only those
// appearances from the right-hand base document. Links/widgets/notes stay intact.
export async function importEditable(original,pdf,lib){
 const doc=await lib.PDFDocument.load(original.slice(),{updateMetadata:false}),raw=rawAnnotations(doc,lib),marks=[],removed=new Set();
 const supported=new Set(['FreeText','Ink','Highlight','Square','Circle','Line']);
 const pages=[...new Set([...raw.values()].filter(entry=>supported.has(entry.dict.get(lib.PDFName.of('Subtype'))?.toString().slice(1))).map(entry=>entry.page))];
 for(const number of pages){
  const page=await pdf.getPage(number),viewport=page.getViewport({scale:1}),annotations=await page.getAnnotations({intent:'display'});
  for(const data of annotations){
   const entry=raw.get(data.id);if(!entry||data.readOnly||data.noHTML||data.isEditable===false)continue;
   // Preserve threaded/commented annotations as-is rather than dropping replies.
   if(data.popupRef)continue;
   let mark=null;
   try{const encoded=entry.dict.lookupMaybe(lib.PDFName.of('M4LMark'),lib.PDFHexString);if(encoded){const stored=JSON.parse(encoded.decodeText());if(stored.version===1&&stored.fingerprint===fingerprint(entry.dict,lib.PDFName)&&validMark(stored.mark))mark={...stored.mark,page:number};}}catch{}
   const rect=data.rect?.length===4?viewport.convertToViewportRectangle(data.rect):null;
   if(!mark&&rect){
    const x=Math.min(rect[0],rect[2]),y=Math.min(rect[1],rect[3]),w=Math.abs(rect[2]-rect[0]),h=Math.abs(rect[3]-rect[1]),base={id:crypto.randomUUID(),page:number,colour:colourHex(data.color),width:(data.borderStyle?.rawWidth||data.borderStyle?.width||2)*viewport.userUnit};
    if(data.subtype==='FreeText'){
     const text=(data.textContent||[]).join('\n')||data.contentsObj?.str||'';if(text)mark={...base,type:'text',x,y,w:Math.max(24,w),h:Math.max(12,h),size:(data.defaultAppearanceData?.fontSize||20)*viewport.userUnit,colour:colourHex(data.defaultAppearanceData?.fontColor),text,direction:'auto'};
    }else if(data.subtype==='Highlight'&&data.quadPoints?.length>=8){
     const paths=[];for(let i=0;i<data.quadPoints.length;i+=8)paths.push([0,2,6,4].map(offset=>{const [x,y]=viewport.convertToViewportPoint(data.quadPoints[i+offset],data.quadPoints[i+offset+1]);return {x,y};}));mark={...base,type:'highlight',polygon:true,paths};
    }else if(data.subtype==='Ink'&&data.inkLists?.length){
     const paths=data.inkLists.map(list=>Array.from({length:list.length/2},(_,i)=>{const [x,y]=viewport.convertToViewportPoint(list[i*2],list[i*2+1]);return {x,y};}));
     mark={...base,type:data.opacity<.5?'highlight':'pen',width:base.width/(data.opacity<.5?6:1),paths};
    }else if(['Square','Circle'].includes(data.subtype))mark={...base,type:data.subtype==='Square'?'rectangle':'ellipse',x,y,w,h,fill:false};
    else if(data.subtype==='Line'&&data.lineCoordinates?.length===4){const coords=data.lineCoordinates;mark={...base,type:data.lineEndings?.includes('OpenArrow')?'arrow':'line',points:[0,2].map(i=>{const [x,y]=viewport.convertToViewportPoint(coords[i],coords[i+1]);return {x,y};})};}
   }
   if(mark&&validMark(mark)){if(marks.some(existing=>existing.id===mark.id))mark.id=crypto.randomUUID();marks.push(mark);removed.add(String(entry.ref));}
  }
 }
 if(!removed.size)return {bytes:original,marks};
 for(const page of doc.getPages()){
  const list=page.node.lookupMaybe(lib.PDFName.of('Annots'),lib.PDFArray);if(!list)continue;
  for(let i=list.size()-1;i>=0;i--)if(removed.has(String(list.get(i))))list.remove(i);
 }
 return {bytes:await doc.save(),marks};
}
export async function exportEditable(bytes,marks,pdfjs,lib,measureContext){
 const loading=pdfjs.getDocument({data:bytes.slice(),cMapUrl:'/pdf-viewer/web/cmaps/',cMapPacked:true,standardFontDataUrl:'/pdf-viewer/web/standard_fonts/',wasmUrl:'/pdf-viewer/web/wasm/',isEvalSupported:false});
 try{
  const pdf=await loading.promise,counts=new Map(),records=new Map();
  for(const mark of marks){if(!validMark(mark))throw Error('Invalid editable mark.');const page=await pdf.getPage(mark.page),record=annotationRecord(mark,page.getViewport({scale:1}),pdfjs.AnnotationEditorType,measureContext);pdf.annotationStorage.setValue('pdfjs_internal_editor_academy_'+mark.id,record);records.set(mark.id,record);counts.set(mark.page,(counts.get(mark.page)||0)+1);}
  const result=marks.length?await pdf.saveDocument():bytes.slice(),doc=await lib.PDFDocument.load(result,{updateMetadata:false});
  // Keep parametric shape/text settings in each real PDF annotation, not a
  // flattened page image. Native PDF.js edits invalidate this fingerprint.
  for(const [number,count] of counts){const list=doc.getPage(number-1).node.lookup(lib.PDFName.of('Annots'),lib.PDFArray),pageMarks=marks.filter(mark=>mark.page===number);for(let i=0;i<count;i++){const dict=doc.context.lookup(list.get(list.size()-count+i)),mark=pageMarks[i],record=records.get(mark.id);
   if(mark.fill&&['rectangle','ellipse'].includes(mark.type)){
    const points=record.paths.points[0],path=[];for(let j=0;j<points.length;j+=2)path.push(`${points[j]} ${points[j+1]} ${j?'l':'m'}`);path.push('h');const rgb=record.color.map(value=>value/255).join(' '),outline=path.join('\n');
    const fill=hexColour(mark.fillColour||mark.colour).map(value=>value/255).join(' ');
    const stream=doc.context.flateStream(`q /M4LFill gs ${fill} rg ${outline} f Q q ${rgb} RG ${record.thickness} w 1 J 1 j ${outline} S Q`,{Type:'XObject',Subtype:'Form',FormType:1,BBox:record.rect,Resources:{ExtGState:{M4LFill:{Type:'ExtGState',ca:.18}}}});dict.set(lib.PDFName.of('AP'),doc.context.obj({N:doc.context.register(stream)}));
   }
   dict.set(lib.PDFName.of('M4LMark'),lib.PDFHexString.fromText(JSON.stringify({version:1,mark,fingerprint:fingerprint(dict,lib.PDFName)})));
  }}
  return doc.save();
 }finally{await loading.destroy();}
}
