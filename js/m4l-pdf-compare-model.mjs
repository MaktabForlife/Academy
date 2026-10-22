// Coordinates belong to the page's scale-1 PDF.js viewport, independent of zoom.
export const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
export function shapeMark(type,start,end,style={}){
 if(['line','arrow'].includes(type))return {...style,type,points:[start,end]};
 return {...style,type,x:Math.min(start.x,end.x),y:Math.min(start.y,end.y),w:Math.abs(end.x-start.x),h:Math.abs(end.y-start.y)};
}
export function markBounds(mark){
 if(mark.points){const xs=mark.points.map(p=>p.x),ys=mark.points.map(p=>p.y);return {x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};}
 return {x:mark.x,y:mark.y,w:mark.w,h:mark.h};
}
export function moveMark(mark,dx,dy,width,height){
 const b=markBounds(mark);dx=clamp(dx,-b.x,Math.max(-b.x,width-b.x-b.w));dy=clamp(dy,-b.y,Math.max(-b.y,height-b.y-b.h));
 return mark.points?{...mark,points:mark.points.map(p=>({x:p.x+dx,y:p.y+dy}))}:{...mark,x:mark.x+dx,y:mark.y+dy};
}
function distance(point,a,b){const dx=b.x-a.x,dy=b.y-a.y,t=dx||dy?clamp(((point.x-a.x)*dx+(point.y-a.y)*dy)/(dx*dx+dy*dy),0,1):0;return Math.hypot(point.x-a.x-t*dx,point.y-a.y-t*dy);}
export function hitMark(mark,point,tolerance=7){
 const b=markBounds(mark),pad=tolerance+(mark.width||1)/2;
 if(point.x<b.x-pad||point.x>b.x+b.w+pad||point.y<b.y-pad||point.y>b.y+b.h+pad)return false;
 if(mark.type==='text'||mark.fill)return true;
 if(mark.points)return mark.points.length===1?distance(point,mark.points[0],mark.points[0])<=pad:mark.points.some((p,i)=>i&&distance(point,mark.points[i-1],p)<=pad);
 if(mark.type==='ellipse'){const rx=Math.max(b.w/2,.1),ry=Math.max(b.h/2,.1),r=Math.hypot((point.x-b.x-rx)/rx,(point.y-b.y-ry)/ry);return Math.abs(r-1)*Math.min(rx,ry)<=pad;}
 return Math.min(Math.abs(point.x-b.x),Math.abs(point.x-b.x-b.w),Math.abs(point.y-b.y),Math.abs(point.y-b.y-b.h))<=pad;
}
export function wrapLines(text,width,measure){
 const result=[];
 for(const paragraph of text.split('\n')){
  let line='';
  for(const word of paragraph.split(/\s+/)){
   if(line&&measure(line+' '+word)>width){result.push(line);line='';}
   if(measure(word)>width){for(const char of word){if(line&&measure(line+char)>width){result.push(line);line='';}line+=char;}}
   else line+=(line?' ':'')+word;
  }
  result.push(line);
 }
 return result;
}
export function textLayout(ctx,mark){
 ctx.font=`${mark.size}px Arial, sans-serif`;
 const lines=wrapLines(mark.text,Math.max(20,mark.w-8),t=>ctx.measureText(t).width);
 return {lines,height:Math.max(mark.size*1.4,lines.length*mark.size*1.4)+8};
}
export function paintMark(ctx,mark){
 ctx.save();ctx.strokeStyle=mark.colour;ctx.fillStyle=mark.colour;ctx.lineWidth=mark.width||2.5;ctx.lineCap='round';ctx.lineJoin='round';ctx.globalAlpha=mark.type==='highlight'?.3:1;
 if(mark.type==='text'){
  const {lines}=textLayout(ctx,mark),rtl=mark.direction==='rtl'||mark.direction==='auto'&&/[\u0590-\u08ff]/.test(mark.text);
  ctx.direction=rtl?'rtl':'ltr';ctx.textAlign=rtl?'right':'left';ctx.textBaseline='top';
  lines.forEach((line,i)=>ctx.fillText(line,rtl?mark.x+mark.w-4:mark.x+4,mark.y+4+i*mark.size*1.4));
 }else if(mark.points){
  ctx.lineWidth=mark.type==='highlight'?Math.max(12,mark.width*6):mark.width;
  ctx.beginPath();const [first,...rest]=mark.points;ctx.moveTo(first.x,first.y);for(const point of rest)ctx.lineTo(point.x,point.y);
  if(!rest.length){ctx.lineTo(first.x+.01,first.y+.01);}ctx.stroke();
  if(mark.type==='arrow'){
   const end=mark.points.at(-1),previous=mark.points.at(-2),angle=Math.atan2(end.y-previous.y,end.x-previous.x),length=Math.max(12,mark.width*5);
   ctx.beginPath();ctx.moveTo(end.x-length*Math.cos(angle-.5),end.y-length*Math.sin(angle-.5));ctx.lineTo(end.x,end.y);ctx.lineTo(end.x-length*Math.cos(angle+.5),end.y-length*Math.sin(angle+.5));ctx.stroke();
  }
 }else{
  ctx.beginPath();if(mark.type==='ellipse')ctx.ellipse(mark.x+mark.w/2,mark.y+mark.h/2,Math.max(.1,mark.w/2),Math.max(.1,mark.h/2),0,0,Math.PI*2);else ctx.rect(mark.x,mark.y,mark.w,mark.h);
  if(mark.fill){ctx.globalAlpha=.18;ctx.fill();ctx.globalAlpha=1;}ctx.stroke();
 }
 ctx.restore();
}
// Map the transparent overlay back into PDF space, including cropped/rotated pages.
export function overlayPlacement(viewport){
 const [a,b,c,d,e,f]=viewport.transform,det=a*d-b*c;
 if(!det)throw Error('Invalid page transform.');
 const point=(x,y)=>({x:(d*(x-e)-c*(y-f))/det,y:(-b*(x-e)+a*(y-f))/det});
 const origin=point(0,viewport.height),right=point(viewport.width,viewport.height),top=point(0,0);
 return {x:origin.x,y:origin.y,width:Math.hypot(right.x-origin.x,right.y-origin.y),height:Math.hypot(top.x-origin.x,top.y-origin.y),rotation:Math.atan2(right.y-origin.y,right.x-origin.x)*180/Math.PI};
}
