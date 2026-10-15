import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const context=vm.createContext({URL});
vm.runInContext(readFileSync(new URL('../../js/m4l-announcement-links.js',import.meta.url),'utf8'),context);
const {render,href}=context.M4L_ANNOUNCEMENT_LINKS;
const options={origin:'https://academy.example',apiBase:'https://api.example'};
test('announcement links support plain addresses, named links, Unicode and separate site/API origins',()=>{
 const html=render('Read [2026 Prospectus](/academy/prospectus.pdf).\nPDF: /api is plain text.\n[Read PDF](/api/academy/announcements/pdf?id=abc)\nVisit https://example.com/book.pdf. السلام عليكم',options);
 assert(html.includes('href="https://academy.example/academy/prospectus.pdf"'));assert(html.includes('>2026 Prospectus</a>.\n'));
 assert(html.includes('href="https://api.example/api/academy/announcements/pdf?id=abc"'));assert(html.includes('href="https://example.com/book.pdf"'));assert(html.includes('</a>. السلام عليكم'));
 assert.equal((html.match(/rel="noopener noreferrer"/g)||[]).length,3);
});
test('announcement link rendering never treats message HTML or unsafe protocols as executable content',()=>{
 const html=render('<img src=x onerror="alert(1)"> [<script>](https://example.com/x?a=1&b=2) [bad](javascript:alert(1)) [bad](data:text/html,test)',options);
 assert(!html.includes('<img'));assert(!html.includes('<script>'));assert(html.includes('&lt;script&gt;</a>'));assert(html.includes('a=1&amp;b=2'));
 assert.equal((html.match(/<a /g)||[]).length,1);
 for(const value of ['javascript:alert(1)','data:text/html,test','//other.example/file.pdf','/\\other.example/file.pdf','https://user:secret@example.com/file.pdf','http://example.com/file.pdf','https://example.com/\nfile.pdf'])assert.equal(href(value,options),'',value);
 assert.equal(href('http://127.0.0.1:3030/file.pdf',{origin:'http://127.0.0.1:3030'}),'http://127.0.0.1:3030/file.pdf');
 assert.equal(href('http://127.0.0.1:3031/file.pdf',{origin:'http://127.0.0.1:3030'}),'');
});
