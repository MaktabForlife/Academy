import {test} from 'node:test';
import assert from 'node:assert/strict';
import {shapeMark,moveMark,hitMark,wrapLines,overlayPlacement} from '../../js/m4l-pdf-compare-model.mjs';

test('marks follow a reverse drag and remain selectable after moving at any zoom',()=>{
 const box=shapeMark('rectangle',{x:160,y:150},{x:40,y:30},{colour:'#000000',x:0,y:0,w:0,h:0});
 assert.deepEqual([box.x,box.y,box.w,box.h],[40,30,120,120]);
 assert.equal(hitMark(box,{x:40,y:80}),true);assert.equal(hitMark(box,{x:100,y:80}),false);
 const moved=moveMark(box,1000,1000,600,800);assert.equal(moved.x+moved.w,600);assert.equal(moved.y+moved.h,800);
 const arrow=shapeMark('arrow',{x:10,y:10},{x:80,y:80},{points:[{x:0,y:0}]});assert.equal(hitMark(arrow,{x:40,y:40}),true);assert.equal(hitMark(arrow,{x:30,y:70}),false);
 const oval=shapeMark('ellipse',{x:100,y:100},{x:200,y:200});assert.equal(hitMark(oval,{x:150,y:100}),true);assert.equal(hitMark(oval,{x:150,y:150}),false);
});
test('text wrapping keeps explicit paragraphs and long Arabic words inside the box',()=>{
 const measure=text=>[...text].length*10;
 for(const text of ['a long English sentence\n\nnext paragraph','السلامعليكمورحمةالله']){
  const lines=wrapLines(text,70,measure);assert(lines.every(line=>measure(line)<=70));assert(lines.length>1);
 }
 assert.deepEqual(wrapLines('first\n\nlast',100,measure),['first','','last']);
});
test('export places every overlay corner correctly on cropped pages at all four rotations',()=>{
 const views=[
  {width:400,height:600,transform:[1,0,0,-1,-30,650]},
  {width:600,height:400,transform:[0,1,1,0,-50,-30]},
  {width:400,height:600,transform:[-1,0,0,1,430,-50]},
  {width:600,height:400,transform:[0,-1,-1,0,650,430]},
 ];
 for(const view of views){
  const p=overlayPlacement(view),angle=p.rotation*Math.PI/180,[a,b,c,d,e,f]=view.transform;
  for(const [u,v] of [[0,0],[1,0],[0,1],[1,1]]){
   const x=p.x+u*p.width*Math.cos(angle)-v*p.height*Math.sin(angle),y=p.y+u*p.width*Math.sin(angle)+v*p.height*Math.cos(angle);
   assert(Math.abs(a*x+c*y+e-u*view.width)<1e-6);assert(Math.abs(b*x+d*y+f-(1-v)*view.height)<1e-6);
  }
 }
});
