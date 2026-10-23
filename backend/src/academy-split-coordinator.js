import {DurableObject} from 'cloudflare:workers';
import {splitEngine} from './academy/separation/engine.js';
import {emptyCompatibilityDatabase} from './academy/separation/compatibility.js';
import {emptyShapes} from './academy/separation/empty-shapes.js';
export class AcademySplitCoordinator extends DurableObject {
 constructor(ctx,env){super(ctx,env);this.engine=splitEngine({core:emptyCompatibilityDatabase(env.ACADEMY_DB.withSession('first-primary'),emptyShapes,{currentGrants:true}),admin:env.ACADEMY_ADMIN_DB.withSession('first-primary'),alarm:()=>this.ctx.storage.setAlarm(Date.now()+30000)});}
 async reply(action){try{return {result:await action()};}catch(e){const known=e.message.match(/academy_management_stale|lesson_media_pdf_limit|split_write_busy/)?.[0];return {error:{status:e.status||(known?409:503),code:e.code||'SPLIT_SAVE_RETRY',message:e.status?e.message:known||'The save needs another attempt. Keep the same retry identifier.'}};}}
 async write(statements,proof){return this.reply(()=>this.engine.write(statements,proof));}
 async read(statements,proof,owner){return this.reply(()=>this.engine.read(statements,proof,owner));}
 async alarm(){try{await this.engine.recover();}catch{await this.ctx.storage.setAlarm(Date.now()+30000);throw Error('Split recovery will retry.');}}
}
// SQL is reachable only through the authenticated API's private DO binding.
export default {fetch:()=>new Response('Not found',{status:404})};
