// Store this command once in Pages. Its fallback works on the older Development branch.
export const pagesBuildBootstrap=`
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
if(fs.existsSync('backend/tools/academy-pages-build.mjs')){
  cp.execFileSync(process.execPath,['backend/tools/academy-pages-build.mjs'],{stdio:'inherit'});
}else{
  const output='.academy-pages';fs.mkdirSync(output);
  const files=cp.execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\\0').filter(Boolean);
  for(const file of files){
    if(file.split('/').some(part=>part.startsWith('.')))continue;
    if(!/^(academy|account|programs|users|pdf-viewer|recorder|activities|icons|images|js|css|functions|admin|student)\\//.test(file)&&
       !/^[^/]+\\.(html|js|css|png|ico|json)$/.test(file)&&!['_headers','_redirects','_routes.json'].includes(file))continue;
    if(!fs.lstatSync(file).isFile())throw Error('PUBLIC_ASSET_FILE_REQUIRED');
    const target=path.join(output,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(file,target);
  }
}`;
const quote=value=>"'"+value.replaceAll("'","'\\''")+"'";
export const developmentPagesBuildCommand='npm --prefix backend ci && node -e '+quote(pagesBuildBootstrap);
