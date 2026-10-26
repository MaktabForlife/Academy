(() => {
 'use strict';
 function scheduleDate(a){
  const assignment=a.assessmentKind==='ASSIGNMENT',value=assignment?a.dueAt:a.examDate||a.dueAt||a.availableFrom;
  if(!value)return {text:assignment?'No due date':'Date not set',sort:Infinity};
  const calendar=/^\d{4}-\d{2}-\d{2}$/.test(value),instant=new Date(calendar?value+'T12:00:00Z':value);
  if(!Number.isFinite(instant.getTime()))throw new Error('Check the '+(assignment?'due date':'exam date')+' for '+a.title+' before exporting.');
  const timeZone=calendar?'UTC':a.timezone||'Africa/Johannesburg';
  const clock=new Intl.DateTimeFormat('en-GB',{timeZone,hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  // Retain the selected day for older deadlines stored at the next midnight.
  if(assignment&&!calendar&&clock.format(instant)==='00:00:00'&&instant.getUTCMilliseconds()===0)instant.setTime(instant.getTime()-1);
  const time=assignment?(calendar?'13:00':new Intl.DateTimeFormat('en-GB',{timeZone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(instant)):null;
  return {text:new Intl.DateTimeFormat('en-GB',{timeZone,dateStyle:'medium'}).format(instant),time,sort:instant.getTime()};
 }
 function wrap(ctx,value,width){
  const lines=[];let line='';
  for(const word of String(value??'').split(/\s+/)){
   if(ctx.measureText((line?line+' ':'')+word).width<=width){line+=(line?' ':'')+word;continue;}
   if(line){lines.push(line);line='';}
   for(const char of word){if(line&&ctx.measureText(line+char).width>width){lines.push(line);line='';}line+=char;}
  }
  if(line)lines.push(line);return lines.length?lines:[''];
 }
 const stage=(register,rows)=>['CANCELLED','ARCHIVED'].includes(register.status)?register.status==='CANCELLED'?'Cancelled':'Archived':rows.length&&rows.every(a=>a.published)?'Final':'Draft';
 async function prepare(register,assessments){
  if(!register.canEdit)throw new Error('This Imtihaan includes learning areas outside your administration access.');
  const rows=assessments.filter(a=>a.registerId===register.id),dates=new Map(rows.map(a=>[a,scheduleDate(a)]));
  rows.sort((a,b)=>(dates.get(a).sort-dates.get(b).sort)||a.activityName.localeCompare(b.activityName)||a.className.localeCompare(b.className)||a.subject.localeCompare(b.subject));
  if(!rows.length)throw new Error('Add assessment dates before exporting this Imtihaan.');
  if(!window.PDFLib)throw new Error('PDF tools did not load. Refresh and try again.');
  await document.fonts.ready;
  const label=stage(register,rows),canvas=document.createElement('canvas');canvas.width=1684;canvas.height=1190;
  const ctx=canvas.getContext('2d'),width=canvas.width,height=canvas.height,pad=64,tableWidth=width-2*pad;
  ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);ctx.fillStyle='#f4edf6';ctx.fillRect(0,0,width,230);
  ctx.fillStyle='#63386e';ctx.font='bold 27px Arial';ctx.fillText('UMM ABBAD ACADEMY',pad,63);
  ctx.fillStyle='#302633';let titleSize=40,titleLines;do{ctx.font=titleSize+'px Georgia';titleLines=wrap(ctx,register.name,width-2*pad-220);if(titleLines.length<=2)break;titleSize-=2;}while(titleSize>=12);titleLines.forEach((line,i)=>ctx.fillText(line,pad,118+i*45));
  ctx.font='24px Arial';ctx.fillText('Imtihaan schedule',pad,211);
  ctx.fillStyle=label==='Final'?'#365c49':'#74467e';ctx.fillRect(width-pad-180,48,180,58);ctx.fillStyle='#fff';ctx.font='bold 26px Arial';ctx.textAlign='center';ctx.fillText(label.toUpperCase(),width-pad-90,87);ctx.textAlign='left';
  const headers=['Exam date / Due date','Program / Course','Class','Subject / Module','Assessment','Duration','Total mark'],weights=[.11,.16,.16,.22,.17,.10,.08],columns=weights.map(w=>w*tableWidth),font=20,lineHeight=27;
  ctx.font=font+'px Arial';
  const content=rows.map(a=>{
   const cells=[dates.get(a).text,a.activityName,a.className,[a.subject,a.subjectDescriptor].filter(Boolean).join(' · '),a.title,a.timingMode==='UNTIMED'?'Untimed':a.durationMinutes+' min',String(a.maximumMark)];
   const lines=cells.map((v,i)=>[...wrap(ctx,v,columns[i]-24),...(i===0&&dates.get(a).time?[dates.get(a).time]:[])]);return {lines,height:Math.max(...lines.map(a=>a.length))*lineHeight+26};
  });
  ctx.font='bold 19px Arial';const headingLines=headers.map((v,i)=>wrap(ctx,v,columns[i]-24)),headerHeight=Math.max(...headingLines.map(a=>a.length))*lineHeight+26;
  const tableHeight=headerHeight+content.reduce((n,r)=>n+r.height,0),scale=Math.min(1,(height-340)/tableHeight),top=256;
  ctx.save();ctx.translate(pad+(tableWidth-tableWidth*scale)/2,top);ctx.scale(scale,scale);
  const drawRow=(lines,y,h,header,index)=>{
   ctx.fillStyle=header?'#74467e':index%2?'#faf7fb':'#fff';ctx.fillRect(0,y,tableWidth,h);ctx.strokeStyle='#ded1e3';ctx.lineWidth=1;ctx.strokeRect(0,y,tableWidth,h);ctx.font=(header?'bold ':'')+font+'px Arial';ctx.fillStyle=header?'#fff':'#302633';
   let x=0;lines.forEach((cell,i)=>{cell.forEach((line,j)=>ctx.fillText(line,x+12,y+13+font+j*lineHeight));x+=columns[i];if(i<columns.length-1){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y+h);ctx.stroke();}});
  };
  drawRow(headingLines,0,headerHeight,true,0);let y=headerHeight;content.forEach((row,i)=>{drawRow(row.lines,y,row.height,false,i);y+=row.height;});ctx.restore();
  ctx.fillStyle='#675b6c';ctx.font='20px Arial';ctx.fillText(label==='Draft'?'DRAFT - schedule has not been fully released to learners':label==='Final'?'FINAL - schedule released to learners':label.toUpperCase()+' - retained schedule',pad,height-58);ctx.font='18px Arial';ctx.fillText('Dates and times follow the assessment time zone. Papers and results are released separately.',pad,height-28);
  ctx.textAlign='right';ctx.fillText(rows.length+' assessment date'+(rows.length===1?'':'s'),width-pad,height-58);ctx.textAlign='left';
  const png=await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Image export failed.')),'image/png'));
  const doc=await window.PDFLib.PDFDocument.create(),page=doc.addPage([841.89,595.28]),image=await doc.embedPng(await png.arrayBuffer());page.drawImage(image,{x:0,y:0,width:841.89,height:595.28});doc.setTitle(register.name+' - '+label+' Imtihaan schedule');doc.setSubject(label+' schedule, '+rows.length+' assessment dates');
  const name=(register.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'imtihaan')+'-'+label.toLowerCase();
  return {label,canvas,count:rows.length,image:new File([png],name+'.png',{type:'image/png'}),pdf:new File([await doc.save()],name+'.pdf',{type:'application/pdf'})};
 }
 function download(file){const url=URL.createObjectURL(file),link=document.createElement('a');link.href=url;link.download=file.name;link.hidden=true;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
 async function share(file,title){
  try{if(navigator.share&&navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title});return 'shared';}}
  catch(e){if(e.name==='AbortError')return 'cancelled';}
  download(file);return 'downloaded';
 }
 window.M4L_IMTIHAAN_EXPORT={prepare,download,share,stage};
})();
