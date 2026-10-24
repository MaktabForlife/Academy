import {test} from 'node:test';
import assert from 'node:assert/strict';
import {publicPdfSource} from '../../js/m4l-pdf-source.mjs';
import {publicPdfFile,pdfBookmark} from '../../js/m4l-pdf-bookmarks-model.mjs';

test('reader public sources use only the existing announcement and Academy file routes',()=>{
 assert.equal(publicPdfSource(new URLSearchParams()),null);
 assert.deepEqual(publicPdfSource(new URLSearchParams({announcement:'pdf-123'})),{api:true,path:'/api/academy/announcements/pdf?id=pdf-123'});
 assert.deepEqual(publicPdfSource(new URLSearchParams({document:'/academy/2026-umm-abbad-academy-prospectus.pdf'})),{api:false,path:'/academy/2026-umm-abbad-academy-prospectus.pdf'});
});
test('reader source selection rejects private routes, traversal, external URLs and ambiguous requests',()=>{
 for(const document of ['/api/academy/assessments/download','https://example.com/file.pdf','//example.com/file.pdf','/academy/../../private.pdf','/academy/../private.pdf','/academy/%2e%2e/private.pdf','/academy/.hidden/../private.pdf','/academy/a.pdf?token=secret','/academy/a.pdf#page=2','/academy/a.pdf\n'])assert.throws(()=>publicPdfSource(new URLSearchParams({document})),undefined,document);
 for(const query of [{announcement:''},{announcement:'../private'},{announcement:'a'.repeat(101)},{announcement:'id',document:'/academy/a.pdf'},{announcement:'id',file:'/pdf-file/abc'},{document:'/academy/a.pdf',book:'other'}])assert.throws(()=>publicPdfSource(new URLSearchParams(query)));
});
test('new public sources and private blob URLs never become persistent Library bookmarks',()=>{
 for(const file of ['/academy/prospectus.pdf','/api/academy/announcements/pdf?id=pdf-123','blob:https://academy.invalid/private','/api/academy/lesson-media/download']){
  assert.equal(publicPdfFile(file),'');assert.throws(()=>pdfBookmark({file,title:'PDF',page:1}));
 }
});
