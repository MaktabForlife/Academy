/* Academy plans: paginated A4 PDF download and one continuous PNG for sharing. */
(function(){
 'use strict';
 let generation=0;
 function reset(){generation++;for(const dialog of document.querySelectorAll('.lp-share-dialog'))dialog.close();}
 async function create(plan,imageOnly=false){
  if(!imageOnly&&!window.PDFLib)throw Error('The PDF tools are still loading. Try again.');
  await document.fonts.ready;
  const pdf=imageOnly?null:await PDFLib.PDFDocument.create(),pages=[],drawing=[],W=1190,H=1684,margin=76,inner=22,bottom=H-100;
  let canvas,ctx,y,recording=imageOnly;
  const date=iso=>new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:plan.timezone||'Africa/Johannesburg'}).format(new Date(iso));
  function wrap(text,size=24,bold=false,width=W-2*margin-2*inner){
   ctx.font=`${bold?'bold ':''}${size}px Arial`;
   const out=[];
   for(const paragraph of String(text||'').split('\n')){
    let line='';
    for(const word of paragraph.split(/\s+/)){
     if(!word)continue;
     const pieces=[];let chunk='';
     for(const char of word){if(ctx.measureText(chunk+char).width>width&&chunk){pieces.push(chunk);chunk='';}chunk+=char;}if(chunk)pieces.push(chunk);
     for(const piece of pieces){const candidate=line?line+' '+piece:piece;if(ctx.measureText(candidate).width>width&&line){out.push(line);line=piece;}else line=candidate;}
    }
    out.push(line);
   }
   return out;
  }
  function paint(line,x,baseline,size=24,bold=false,width=W-2*margin-2*inner,color='#292631'){
   if(recording){drawing.push({text:[line,x,baseline,size,bold,width,color]});return;}
   ctx.font=`${bold?'bold ':''}${size}px Arial`;ctx.fillStyle=color;
   const rtl=/^[\s\d\W]*[\u0590-\u08ff]/.test(line);ctx.direction=rtl?'rtl':'ltr';ctx.textAlign=rtl?'right':'left';ctx.fillText(line,rtl?x+width:x,baseline);ctx.direction='ltr';ctx.textAlign='left';
  }
  function border(x,top,width,height,color){
   if(recording){drawing.push({border:[x,top,width,height,color]});return;}
   ctx.strokeStyle=color;ctx.lineWidth=2;ctx.strokeRect(x,top,width,height);
  }
  function finish(){
   ctx.strokeStyle='#72477b';ctx.lineWidth=2;ctx.strokeRect(40,40,W-80,H-80);
   paint('Umm Abbad Academy',margin,H-63,19,false,650,'#72477b');
   ctx.font='19px Arial';ctx.textAlign='right';ctx.fillText('Page '+(pages.length+1),W-margin,H-63);ctx.textAlign='left';pages.push(canvas.toDataURL('image/png'));
  }
  function page(){
   if(canvas)finish();canvas=document.createElement('canvas');canvas.width=W;canvas.height=imageOnly?1:H;ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);y=98;
   paint(plan.period==='ENTIRE'?'Entire-course plan':'Weekly plan',margin,y,28,false);y+=56;
   for(const line of wrap(plan.activityName,42,true,W-2*margin)){paint(line,margin,y,42,true,W-2*margin);y+=51;}
   if(plan.runName){paint(plan.runName,margin,y,22,false,W-2*margin,'#696574');y+=35;}
   const teacher=wrap('Teacher: '+plan.teacherName,24,false,W-2*margin);
   for(const line of teacher){paint(line,margin,y,24);y+=32;}
   paint(plan.period==='ENTIRE'?'Entire course':'Week starting: '+plan.weekStart,margin,y,24);y+=32;
   if(!plan.submittedAt){paint('DRAFT',margin,y,19,true,W-2*margin,'#696574');y+=34;}
  }
  function bodyLines(parts){
   return parts.flatMap(([label,text])=>text?[...(label?wrap(label,23,true).map(text=>({text,bold:true,color:'#72477b'})):[]),...wrap(text).map(text=>({text})),{text:''}]:[]);
  }
  function box(left,right,parts,minHeight=150){
   const lines=bodyLines(parts);let offset=0,first=true;
   do{
    const availableWidth=W-2*margin-2*inner,leftWidth=right?availableWidth*.61:availableWidth,rightWidth=availableWidth*.35;
    const heading=wrap(left+(first?'':' (continued)'),26,true,leftWidth),second=right?wrap(right,24,true,rightWidth):[];
    const headerHeight=Math.max(heading.length,second.length)*34+22;
    const remaining=lines.length-offset,desired=Math.max(minHeight,headerHeight+remaining*32+20);
    if(!imageOnly&&y+Math.min(desired,headerHeight+96)>bottom)page();
    const maxLines=imageOnly?remaining:Math.max(1,Math.floor((bottom-y-headerHeight-20)/32)),count=Math.min(remaining,maxLines),height=Math.max(minHeight,headerHeight+count*32+20);
    if(!imageOnly&&y+height>bottom){page();continue;}
    const top=y;border(margin,top,W-2*margin,height,'#72557c');
    heading.forEach((line,i)=>paint(line,margin+inner,top+35+i*34,26,true,leftWidth));
    second.forEach((line,i)=>paint(line,W-margin-inner-rightWidth,top+35+i*34,24,true,rightWidth));
    for(let i=0;i<count;i++){const line=lines[offset+i];paint(line.text,margin+inner,top+headerHeight+27+i*32,24,line.bold,availableWidth,line.color);}
    offset+=count;y+=height+18;first=false;
    if(offset<lines.length)page();
   }while(offset<lines.length||first);
  }
  page();
  if(plan.content.title&&!['Weekly teaching plan','Weekly plan','Entire-course teaching plan'].includes(plan.content.title))box('Plan title','',[[null,plan.content.title]],80);
  if(plan.content.overview)box('Overview','',[[null,plan.content.overview]],90);
  for(const [index,l] of plan.content.lessons.entries()){
   box('Subject: '+(l.subject||'Section '+(index+1)),'Class: '+(l.className||'All / not specified'),[['Date',l.date],['Learning objectives',l.objectives],[null,l.activities],['Resources / preparation',l.resources]]);
   await new Promise(resolve=>setTimeout(resolve,0));
  }
  if(plan.content.reflection)box('Reflection / follow-up','',[[null,plan.content.reflection]],90);

  if(imageOnly){
   const height=Math.ceil(y+100);
   // Extend to two A4 page heights using the PDF's exact width and font sizes.
   if(height>H*2)throw Error('This plan is longer than two pages at the PDF text size. Download the PDF to share the complete plan.');
   try{
    canvas.width=W;canvas.height=height;ctx=canvas.getContext('2d');
    ctx.fillStyle='#fff';ctx.fillRect(0,0,W,height);recording=false;
    for(const item of drawing)item.text?paint(...item.text):border(...item.border);
    border(40,40,W-80,height-80,'#72477b');paint('Umm Abbad Academy',margin,height-63,19,false,650,'#72477b');
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    if(!blob)throw Error('Image encoding failed');
    return blob;
   }catch{
    throw Error('The plan image could not be created on this device. Download the PDF instead.');
   }finally{canvas.width=canvas.height=1;}
  }
  finish();
  for(const data of pages){const png=await pdf.embedPng(data);pdf.addPage([595.28,841.89]).drawImage(png,{x:0,y:0,width:595.28,height:841.89});}
  return new Blob([await pdf.save()],{type:'application/pdf'});
 }
 function download(file){
  const url=URL.createObjectURL(file),link=document.createElement('a');link.href=url;link.download=file.name;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);return 'downloaded';
 }
 function shareFile(file){
  return new Promise(resolve=>{
   const dialog=document.createElement('dialog');dialog.className='lp-dialog lp-root lp-share-dialog';dialog.setAttribute('aria-labelledby','lp-share-title');
   const heading=document.createElement('h2');heading.id='lp-share-title';heading.textContent='Share plan image';
   const name=document.createElement('p');name.className='lp-meta';name.textContent=file.name+' · '+Math.max(1,Math.ceil(file.size/1024))+' KB';
   const message=document.createElement('p');message.setAttribute('role','status');message.textContent='Your whole plan is ready as one image.';
   const actions=document.createElement('div');actions.className='lp-actions';
   const share=document.createElement('button');share.type='button';share.textContent='Share image';
   const save=document.createElement('button');save.type='button';save.className='lp-secondary';save.textContent='Download image';
   const close=document.createElement('button');close.type='button';close.className='lp-secondary academy-close';close.textContent='Close';close.title='Close';close.setAttribute('aria-label','Close share plan');
   let result='cancelled';
   share.onclick=async()=>{share.disabled=true;try{await navigator.share({files:[file]});result='shared';dialog.close();}catch(error){if(error.name==='AbortError')dialog.close();else{message.textContent='The image could not be shared. Try again, or download it and attach the image yourself.';share.disabled=false;}}};
   save.onclick=()=>{result=download(file);dialog.close();};close.onclick=()=>dialog.close();
   dialog.addEventListener('close',()=>{dialog.remove();resolve(result);},{once:true});const header=document.createElement('div');header.className='academy-close-heading';header.append(heading,close);actions.append(share,save);dialog.append(header,name,message,actions);document.body.appendChild(dialog);dialog.showModal();
  });
 }
 async function output(plan,share=false){
  const owner=generation,blob=await create(plan,share);if(owner!==generation)return 'cancelled';
  const name=(plan.activityName+' - '+plan.teacherName+' - '+(plan.weekStart||'entire-course')).replace(/[^\p{L}\p{N} ._-]/gu,'').slice(0,150)+(share?'.png':'.pdf'),file=new File([blob],name,{type:share?'image/png':'application/pdf'});
  let canShare=false;try{canShare=Boolean(navigator.share&&navigator.canShare?.({files:[file]}));}catch{}
  // Generation is asynchronous. A fresh click shares only the single image file,
  // without a text/title payload that some share targets send on its own.
  if(share&&canShare)return shareFile(file);
  return download(file);
 }
 window.M4L_PLANNING_PDF={create:plan=>create(plan),createImage:plan=>create(plan,true),output,reset};
})();
