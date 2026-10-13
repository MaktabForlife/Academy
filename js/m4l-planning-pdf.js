/* Render Unicode text with the browser's fonts, then assemble disposable A4 pages. */
(function(){
 'use strict';
 async function create(plan){
  if(!window.PDFLib)throw Error('The PDF tools are still loading. Try again.');
  await document.fonts.ready;
  const pdf=await PDFLib.PDFDocument.create(),pages=[],W=1190,H=1684,margin=88,bottom=H-110;
  let canvas,ctx,y;
  function finish(){ctx.fillStyle='#696574';ctx.font='21px Arial';ctx.textAlign='left';ctx.fillText(plan.activityName,margin,H-58,W-margin*2-180);ctx.textAlign='right';ctx.fillText('Page '+(pages.length+1),W-margin,H-58);pages.push(canvas.toDataURL('image/png'));}
  function page(){if(canvas)finish();canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);ctx.fillStyle='#72477b';ctx.font='bold 25px Arial';ctx.fillText('UMM ABBAD ACADEMY',margin,65);ctx.fillStyle='#ded4e2';ctx.fillRect(margin,82,W-margin*2,2);y=132;}
  function wrap(text,size,bold=false){ctx.font=`${bold?'bold ':''}${size}px Arial`;const out=[];for(const paragraph of String(text||'').split('\n')){let line='';for(const word of paragraph.split(/\s+/)){if(!word)continue;let pieces=[word];if(ctx.measureText(word).width>W-margin*2){pieces=[];let chunk='';for(const char of word){if(ctx.measureText(chunk+char).width>W-margin*2&&chunk){pieces.push(chunk);chunk='';}chunk+=char;}if(chunk)pieces.push(chunk);}for(const piece of pieces){const candidate=line?line+' '+piece:piece;if(ctx.measureText(candidate).width>W-margin*2&&line){out.push(line);line=piece;}else line=candidate;}}out.push(line);}return out;}
  function write(text,size=26,bold=false,color='#292631'){
   for(const line of wrap(text,size,bold)){if(y+size*1.5>bottom)page();ctx.font=`${bold?'bold ':''}${size}px Arial`;ctx.fillStyle=color;const rtl=/^[\s\d\W]*[\u0590-\u08ff]/.test(line);ctx.direction=rtl?'rtl':'ltr';ctx.textAlign=rtl?'right':'left';ctx.fillText(line,rtl?W-margin:margin,y);y+=size*1.5;}ctx.direction='ltr';ctx.textAlign='left';
  }
  function section(label,body){if(!body)return;if(y+100>bottom)page();y+=18;write(label,24,true,'#72477b');write(body,26);}
  page();write(plan.content.title||'Teaching plan',40,true);y+=12;
  write(plan.activityName+(plan.runName?' · '+plan.runName:''),29,true);
  write(plan.teacherName,26);
  write(plan.period==='ENTIRE'?'Entire course':'Week commencing '+plan.weekStart,24,false,'#696574');
  if(plan.submittedAt)write('Submitted '+new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:plan.timezone}).format(new Date(plan.submittedAt)),21,false,'#696574');
  else write('DRAFT',23,true,'#8a6100');
  section('Overview',plan.content.overview);
  for(const [index,lesson] of plan.content.lessons.entries()){
   if(y+150>bottom)page();y+=24;write([lesson.date,lesson.className,lesson.subject||'Lesson '+(index+1)].filter(Boolean).join(' · '),29,true,'#72477b');
   section('Learning objectives',lesson.objectives);section('Activities / teaching plan',lesson.activities);section('Resources / preparation',lesson.resources);
   await new Promise(resolve=>setTimeout(resolve,0));
  }
  section('Reflection / follow-up',plan.content.reflection);
  finish();for(const data of pages){const png=await pdf.embedPng(data);pdf.addPage([595.28,841.89]).drawImage(png,{x:0,y:0,width:595.28,height:841.89});}

  return new Blob([await pdf.save()],{type:'application/pdf'});
 }
 async function output(plan,share=false){const blob=await create(plan),name=(plan.activityName+' - '+plan.teacherName+' - '+(plan.weekStart||'entire-course')).replace(/[^\p{L}\p{N} ._-]/gu,'').slice(0,150)+'.pdf',file=new File([blob],name,{type:'application/pdf'});
  if(share&&navigator.share&&navigator.canShare?.({files:[file]})){try{await navigator.share({files:[file],title:plan.content.title});return;}catch(e){if(e.name==='AbortError')return;}}
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
 }
 window.M4L_PLANNING_PDF={create,output};
})();
