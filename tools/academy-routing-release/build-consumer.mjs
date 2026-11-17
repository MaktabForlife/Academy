// SOURCE ONLY. No top-level file reads, compiler import, build, process or application execution.
import * as fs from 'node:fs/promises';
import {resolve,join,relative,isAbsolute,dirname,posix} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

export const SOURCE_EXECUTION_GATE=true;
const PRODUCT='academy-product', DEPENDENCY='academy-dependency';
const ENTRY='backend/src/academy-existing-feature-entry-v5.mjs';
const OLD_GUARD='backend/src/auth/v110/root-sensitive-request-v1.mjs';
const NEW_GUARD='backend/src/auth/v110/root-sensitive-request-portable-v1.mjs';
const HELD_DRAFT='backend/src/academy/d1/teacher-availability-root-sensitive-v1.js';
const REQUIRED_SINGLETONS=["academy-existing-feature-profile-v1.mjs", "existing-feature-env-v1.mjs", "academy-cookie-auth-portable-v2.mjs", "native-root-pin-proof.mjs", "master-capture-hold-root-only-v1.mjs", "root-sensitive-request-portable-v1.mjs", "academy-existing-feature-runtime-v1.mjs"];
const FORBIDDEN_INPUTS=["academy-development-runtime.js", "academy-existing-feature-entry-v1.mjs", "academy-existing-feature-entry-v2.mjs", "academy-existing-feature-entry-v3.mjs", "academy-existing-feature-entry-v4.mjs", "academy-root-only-entry-v1.mjs", "academy-root-only-entry-v2.mjs", "jwt-feature-storage.mjs", "master-outbox-pump-https-v1.mjs", "master-outbox-pump.mjs", "master-outbox-retry-driver-v1.mjs", "native-https-receiver-v1.mjs", "native-https-sender-v1.mjs", "native-https-sender-v2.mjs", "native-https-sender-v3.mjs", "portable-native-profile-selection-v1.mjs", "portable-native-profile-selection-v2.mjs", "portable-native-profile-selection-v3.mjs", "portable-native-profile-v1.mjs", "portable-native-profile-v2.mjs", "portable-native-profile-v3.mjs", "portable-native-profile-v4.mjs", "portable-native-profile-v5.mjs", "portable-native-root-only-profile-selection-v1.mjs", "portable-native-root-only-profile-v1.mjs", "root-only-static-routing-v1.mjs", "website-studio-bridge.js"];
const EXPECTED_EXPORTS=['AcademySplitCoordinator','JWTFeatureAcademySplitCoordinator','JWTFeatureProgramTimetableCoordinator','ProgramTimetableCoordinator','WebsiteStudioAcademy','default'];
const IMPORTERS=[
 'backend/src/academy/d1/session-root-sensitive-v1.js',
 'backend/src/academy/separation/proof-root-sensitive-v3.js',
 'backend/src/academy/d1/class-notes-root-sensitive-v1.js',
 'backend/src/academy/d1/assessment-manual-marks-root-sensitive-v1.js'
];
const MANIFEST_SHA='2961264bfbb5db7bcc41d4ca1930bbe344df36818f5929e0b2da82bf729b1cce';
const ALIAS_SHA='588be69e953666f257d8e8916bf8e4be5e2363f3cbb09457f383950d4ac777dc';
const ALIAS_FILE='config/v110-existing-feature-build-aliases.r3.json';
const MAX_ARTIFACT_BYTES=16*1024*1024, MAX_JSON_BYTES=4*1024*1024;
export const sourceBuildContract=Object.freeze({
 schema:'ACADEMY_EXISTING_FEATURE_SOURCE_BUILD_CONTRACT_V1',executionAllowed:false,
 entry:ENTRY,expectedExports:Object.freeze(EXPECTED_EXPORTS),
 aliasCount:98,externalModules:Object.freeze(['cloudflare:workers']),
 requiredBundledDependency:'jose@6.2.15',compilerVersion:'0.28.1',
 apiAndCoordinator:'ONE identical artifact, same exact source inputs',
 legacyGuardInputs:0,selectedGuardInputs:1,requiredSensitiveConsumers:4,
 sourceRewriteAllowed:false,availabilityFallbackAllowed:false,
 actualBuildOrSingletonProof:false,AI:'OFF'
});
const fail=code=>{throw Object.assign(new Error(code),{code});};
const check=(value,code)=>{if(!value)fail(code);};
const hash=b=>createHash('sha256').update(b).digest('hex');
const inside=(parent,child)=>{const r=relative(parent,child);return r===''||(!isAbsolute(r)&&r!=='..'&&!r.startsWith('../')&&!r.startsWith('..\\'));};
const overlaps=(a,b)=>inside(a,b)||inside(b,a);
const sha=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function repoRelative(value){
 check(typeof value==='string'&&value.length>0&&!isAbsolute(value)&&!value.includes('\\')&&!value.includes('\0'),'NONPORTABLE_SOURCE_PATH');
 const n=posix.normalize(value);
 check(n===value&&n!=='.'&&n!=='..'&&!n.startsWith('../')&&!n.split('/').some(p=>p==='.git'||p==='node_modules'||p==='private'||p.startsWith('.env')),'SOURCE_PATH_ESCAPE');
 return n;
}
function resolveRelative(base,specifier){
 check(specifier.startsWith('.')&&!specifier.includes('\\')&&!specifier.includes('\0'),'RELATIVE_SPECIFIER_REQUIRED');
 return repoRelative(posix.normalize(posix.join(base,specifier)));
}
async function canonical(path){
 const absolute=resolve(path);check(await fs.realpath(absolute)===absolute,'SYMLINK_OR_PATH_REBASE_REJECTED');
 return absolute;
}
async function contained(root,rel){
 rel=repoRelative(rel);const path=resolve(root,rel),back=relative(root,path);
 check(back!==''&&!back.startsWith('..')&&!isAbsolute(back),'CONTAINMENT_FAILED');
 return canonical(path);
}
async function pinned(path,pin){
 check(pin&&Number.isSafeInteger(pin.bytes)&&pin.bytes>=0&&sha(pin.sha256),'UNBOUND_PUBLIC_INPUT');
 path=await canonical(path);const st=await fs.lstat(path);check(st.isFile()&&!st.isSymbolicLink(),'NONREGULAR_PUBLIC_INPUT');
 const data=await fs.readFile(path);check(data.length===pin.bytes&&hash(data)===pin.sha256,'PUBLIC_INPUT_DRIFT');return data;
}
function loader(path){
 if(path.endsWith('.json'))return 'json';if(path.endsWith('.sql'))return 'text';
 check(/\.(?:js|mjs|cjs)$/.test(path),'UNREVIEWED_SOURCE_LOADER');return 'js';
}

// A later Root-reviewed append-only bound source and separately selected finite caller are required.
// This source's literal false gate rejects BEFORE reading bindings or any filesystem input.
export async function buildAcademyPortableCandidate(binding){
 check(SOURCE_EXECUTION_GATE===true,'SOURCE_ONLY_EXECUTION_GATE_CLOSED');
 check(binding?.schema==='ROOT_REVIEWED_ONE_ACADEMY_EXISTING_FEATURE_BUILD_V1'&&binding.executionAllowed===true&&binding.invocations===1&&binding.retries===0&&binding.automaticNextStage===false,'FINITE_SOURCE_BUILD_NOT_SELECTED');
 check(binding.noApplicationImport===true&&binding.noSDKNativeHTTPPrivateFixtureAccess===true&&binding.freshDedicatedCompilerProcess===true,'SOURCE_SCOPE_NOT_SELECTED');
 const root=await canonical(binding.repoRoot);
 const manifestPin=binding.manifest;
 check(manifestPin?.sha256===MANIFEST_SHA&&manifestPin.bytes===319817,'MANIFEST_SELECTION_CHANGED');
 const manifestBytes=await pinned(manifestPin.path,manifestPin),manifest=JSON.parse(manifestBytes);
 check(manifest.schema==='V110_ACADEMY_PUBLIC_SOURCE_MANIFEST_V3'&&manifest.fileCount===1729,'MANIFEST_SCHEMA_COUNT');
 const projectPins=new Map();
 for(const row of manifest.files){
  check(typeof row.path==='string'&&row.path.startsWith('Academy/'),'MANIFEST_REPO_PREFIX');
  const rel=repoRelative(row.path.slice('Academy/'.length));check(!projectPins.has(rel),'DUPLICATE_PROJECT_INPUT');
  check(Number.isSafeInteger(row.bytes)&&row.bytes>=0&&sha(row.sha256),'INVALID_PROJECT_PIN');projectPins.set(rel,row);
 }
 check(projectPins.size===1729&&!projectPins.has(HELD_DRAFT),'HELD_DRAFT_OR_FILE_COUNT');
 const aliasPin=projectPins.get(ALIAS_FILE);check(aliasPin?.sha256===ALIAS_SHA&&aliasPin.bytes===30574,'ALIAS_SELECTION_CHANGED');
 const aliasBytes=await pinned(await contained(root,ALIAS_FILE),aliasPin),map=JSON.parse(aliasBytes);
 check(map.schema==='V110_EXISTING_FEATURE_RELATIVE_ALIAS_CANDIDATE_V1'&&map.compileAllowed===false&&map.runtimeAllowed===false&&map.activationAllowed===false&&map.unboundRequiredSourceConnections.length===0,'ALIAS_METADATA_NOT_SOURCE_ONLY');
 const aliases=new Map(),physicalContexts=new Map();
 for(const [key,value]of Object.entries(map.aliasesRelativeToAcademyRoot)){
  const canonicalName=repoRelative(key),selected=repoRelative(value.sourcePath),context=repoRelative(value.resolveDir);
  check(selected!==OLD_GUARD&&selected!==HELD_DRAFT,'FORBIDDEN_SELECTED_MODULE');
  const pin=projectPins.get(selected);check(pin&&pin.sha256===value.sha256&&pin.bytes===value.bytes,'ALIAS_TARGET_NOT_IN_EXACT_MANIFEST');
  check(!physicalContexts.has(selected)||physicalContexts.get(selected)===context,'ONE_PHYSICAL_INPUT_MULTIPLE_RESOLVE_DIRS');
  aliases.set(canonicalName,{selected,context});physicalContexts.set(selected,context);
 }
 check(aliases.size===98&&aliases.get(OLD_GUARD)?.selected===NEW_GUARD,'ROOT_GUARD_ALIAS_NOT_EXACT');
 for(const value of aliases.values())check(!aliases.has(value.selected)||aliases.get(value.selected).selected===value.selected,'ALIAS_CHAIN_REJECTED');
 const tool=binding.compiler;
 check(tool?.version==='0.28.1'&&Array.isArray(tool.publicInputPins)&&tool.publicInputPins.length>0&&tool.apiModule,'COMPILER_UNBOUND');
 const toolPins=new Map(),toolRoles=new Map();
 const expectedToolRoles=['apiModule','binWrapper','nativeCompiler','nodeExecutable','package','platformPackage'];
 for(const item of tool.publicInputPins){
  check(!/(?:^|\/)(?:miniflare|workerd)(?:\/|$)/i.test(item.path),'SDK_TOOL_INPUT_FORBIDDEN');
  const path=await canonical(item.path);check(!toolPins.has(path)&&expectedToolRoles.includes(item.role)&&!toolRoles.has(item.role),'DUPLICATE_OR_UNREVIEWED_TOOL_INPUT');await pinned(path,item);toolPins.set(path,item);toolRoles.set(item.role,{path,pin:item});
 }
 const apiPath=await canonical(tool.apiModule);check(toolRoles.size===6&&equal([...toolRoles.keys()].sort(),expectedToolRoles),'INCOMPLETE_COMPILER_TOOLCHAIN');
 check(toolRoles.get('apiModule').path===apiPath&&apiPath.endsWith('/esbuild/lib/main.js'),'UNPINNED_COMPILER_API');
 const esbuildRoot=dirname(dirname(apiPath)),platformRoot=dirname(toolRoles.get('platformPackage').path);
 check(toolRoles.get('package').path===join(esbuildRoot,'package.json')&&toolRoles.get('binWrapper').path===join(esbuildRoot,'bin/esbuild')&&toolRoles.get('nativeCompiler').path===join(platformRoot,'bin/esbuild'),'COMPILER_TOOL_LAYOUT');
 const toolPackage=JSON.parse(await pinned(toolRoles.get('package').path,toolRoles.get('package').pin));
 const platformPackage=JSON.parse(await pinned(toolRoles.get('platformPackage').path,toolRoles.get('platformPackage').pin));
 check(toolPackage.name==='esbuild'&&toolPackage.version==='0.28.1'&&platformPackage.name==='@esbuild/linux-x64'&&platformPackage.version==='0.28.1','COMPILER_OWNING_PACKAGE_VERSION');
 check(tool.nodeVersion==='24.22.1'&&process.version==='v24.22.1'&&await canonical(process.execPath)===toolRoles.get('nodeExecutable').path,'PINNED_NODE_EXECUTABLE_VERSION');
 const deps=binding.dependencies;
 check(deps&&equal(Object.keys(deps).sort(),['jose']),'ONLY_REVIEWED_BUNDLED_JOSE_DEPENDENCY');
 const jose=deps.jose;check(jose.version==='6.2.15'&&jose.root&&jose.entry&&Array.isArray(jose.publicInputPins)&&jose.publicInputPins.length>0,'JOSE_BINDING_UNBOUND');
 const depRoot=await canonical(jose.root),depPins=new Map();
 for(const item of jose.publicInputPins){const rel=repoRelative(item.path);check(!depPins.has(rel),'DUPLICATE_DEPENDENCY_INPUT');depPins.set(rel,item);}
 const depEntry=repoRelative(jose.entry);check(depPins.has(depEntry)&&depPins.has('package.json'),'DEPENDENCY_ENTRY_OR_OWNING_PACKAGE_UNPINNED');
 const pkg=JSON.parse(await pinned(await contained(depRoot,'package.json'),depPins.get('package.json')));
 check(pkg.name==='jose'&&pkg.version==='6.2.15','DEPENDENCY_PACKAGE_VERSION');
 const outputRoot=resolve(binding.outputDirectory);
 for(const protectedRoot of [root,depRoot,esbuildRoot,platformRoot,dirname(toolRoles.get('nodeExecutable').path),dirname(resolve(manifestPin.path))])check(!overlaps(protectedRoot,outputRoot),'OUTPUT_OVERLAPS_PROTECTED_INPUT_ROOT');
 check(await fs.realpath(dirname(outputRoot))===dirname(outputRoot),'OUTPUT_PARENT_NONCANONICAL');
 try{await fs.lstat(outputRoot);fail('OUTPUT_DIRECTORY_ALREADY_EXISTS');}catch(error){if(error.code!=='ENOENT')throw error;}
 const consumed=new Map(),loads=new Map(),sensitiveEdges=new Map(),projectIdentity=new Map();
 function remember(key,path,pin,context,kind){
  check(!consumed.has(key)||consumed.get(key).path===path,'CANONICAL_IDENTITY_COLLISION');
  consumed.set(key,{path,pin,context,kind});loads.set(key,(loads.get(key)||0)+1);
 }
 function projectResolution(canonicalName,importer){
  canonicalName=repoRelative(canonicalName);const selected=aliases.get(canonicalName)?.selected||canonicalName;
  check(selected!==OLD_GUARD&&selected!==HELD_DRAFT&&projectPins.has(selected),'UNDECLARED_PROJECT_INPUT_OR_LEGACY_FALLBACK');
  const context=physicalContexts.get(selected)||posix.dirname(selected);
  check(!projectIdentity.has(selected)||projectIdentity.get(selected)===context,'SPLIT_PROJECT_IDENTITY');projectIdentity.set(selected,context);
  if(IMPORTERS.includes(importer)&&[OLD_GUARD,NEW_GUARD].includes(canonicalName)){
   check(selected===NEW_GUARD,'SENSITIVE_IMPORTER_GUARD_SPLIT');sensitiveEdges.set(importer,selected);
  }
  return {path:selected,namespace:PRODUCT,pluginData:{context}};
 }
 const plugin={name:'exact-portable-academy-source',setup(build){
  build.onResolve({filter:/.*/},args=>{
   if(args.kind==='entry-point'){
    check(resolve(args.path)===resolve(root,ENTRY),'UNSELECTED_ENTRY_POINT');return projectResolution(ENTRY,null);
   }
   if(args.path==='cloudflare:workers')return {path:args.path,external:true};
   if(args.namespace===PRODUCT){
    check(projectIdentity.has(args.importer),'UNKNOWN_PROJECT_IMPORTER');
    if(args.path.startsWith('.'))return projectResolution(resolveRelative(projectIdentity.get(args.importer),args.path),args.importer);
    check(args.path==='jose','UNREVIEWED_BARE_IMPORT_OR_EXTERNAL');return {path:depEntry,namespace:DEPENDENCY};
   }
   if(args.namespace===DEPENDENCY){
    check(args.path.startsWith('.'),'UNREVIEWED_DEPENDENCY_BARE_IMPORT');
    const rel=resolveRelative(posix.dirname(args.importer),args.path);check(depPins.has(rel),'DEPENDENCY_INPUT_NOT_EXPLICITLY_PINNED');return {path:rel,namespace:DEPENDENCY};
   }
   fail('UNEXPECTED_RESOLUTION_NAMESPACE');
  });
  build.onLoad({filter:/.*/,namespace:PRODUCT},async args=>{
   const rel=repoRelative(args.path),pin=projectPins.get(rel);check(pin,'UNPINNED_PROJECT_LOAD');
   const path=await contained(root,rel),data=await pinned(path,pin),context=projectIdentity.get(rel);check(context,'MISSING_ORIGINAL_RESOLVE_DIR');
   remember(PRODUCT+':'+rel,path,pin,context,PRODUCT);
   return {contents:data,loader:loader(rel),resolveDir:resolve(root,context),pluginData:{context}};
  });
  build.onLoad({filter:/.*/,namespace:DEPENDENCY},async args=>{
   const rel=repoRelative(args.path),pin=depPins.get(rel);check(pin,'UNPINNED_DEPENDENCY_LOAD');
   const path=await contained(depRoot,rel),data=await pinned(path,pin);remember(DEPENDENCY+':'+rel,path,pin,posix.dirname(rel),DEPENDENCY);
   return {contents:data,loader:loader(rel),resolveDir:resolve(depRoot,posix.dirname(rel))};
  });
 }};
 // Only the pinned compiler implementation is imported. Product and dependency source are text inputs.
 const imported=await import(pathToFileURL(apiPath).href),esbuild=imported.default||imported;
 check(esbuild.version==='0.28.1'&&typeof esbuild.build==='function'&&typeof esbuild.stop==='function','COMPILER_API_VERSION');
 let result;
 try{result=await esbuild.build({absWorkingDir:root,entryPoints:[resolve(root,ENTRY)],outfile:join(outputRoot,'academy-existing-feature-common.mjs'),bundle:true,write:false,metafile:true,sourcemap:false,platform:'browser',format:'esm',target:'es2022',logLevel:'silent',plugins:[plugin]});}
 finally{await esbuild.stop();}
 check(result.outputFiles?.length===1&&result.metafile,'ONE_ARTIFACT_AND_METAFILE_REQUIRED');
 const output=result.outputFiles[0];check(output.contents.length<=MAX_ARTIFACT_BYTES,'ARTIFACT_CAP');
 const inputKeys=Object.keys(result.metafile.inputs),newKey=PRODUCT+':'+NEW_GUARD,oldKey=PRODUCT+':'+OLD_GUARD;
 check(equal([...inputKeys].sort(),[...consumed.keys()].sort()),'METAFILE_INPUTS_MUST_EQUAL_OBSERVED_PINNED_LOADS');
 check(inputKeys.filter(k=>k===newKey).length===1&&!inputKeys.includes(oldKey),'METAFILE_GUARD_SINGLETON');
 check(loads.get(newKey)===1&&IMPORTERS.every(p=>loads.get(PRODUCT+':'+p)===1&&sensitiveEdges.get(p)===NEW_GUARD),'FOUR_IMPORTER_SINGLETON_PROOF');
 check(!inputKeys.some(k=>k.includes(HELD_DRAFT)),'HELD_AVAILABILITY_LOADED');
 check(REQUIRED_SINGLETONS.every(name=>inputKeys.filter(k=>k.endsWith('/'+name)).length===1),'EXISTING_FEATURE_REQUIRED_SINGLETONS');
 check(!inputKeys.some(k=>FORBIDDEN_INPUTS.some(name=>k.endsWith('/'+name))),'EXISTING_FEATURE_FORBIDDEN_INPUT');
 check([...consumed.values()].some(v=>v.kind===DEPENDENCY),'JOSE_NOT_BUNDLED');
 const externals=[...new Set(Object.values(result.metafile.inputs).flatMap(v=>v.imports||[]).filter(v=>v.external).map(v=>v.path))].sort();
 check(equal(externals,['cloudflare:workers']),'UNREVIEWED_ACTUAL_EXTERNAL');
 const outputs=Object.values(result.metafile.outputs);check(outputs.length===1&&equal([...outputs[0].exports].sort(),EXPECTED_EXPORTS),'NATIVE_ENTRY_EXPORTS_CHANGED');
 for(const item of consumed.values())await pinned(item.path,item.pin);
 for(const [path,pin]of toolPins)await pinned(path,pin);
 await pinned(manifestPin.path,manifestPin);await pinned(await contained(root,ALIAS_FILE),aliasPin);
 await pinned(await contained(depRoot,'package.json'),depPins.get('package.json'));
 const identities=[...consumed].sort(([a],[b])=>a.localeCompare(b)).map(([identity,v])=>({identity,bytes:v.pin.bytes,sha256:v.pin.sha256,resolveDir:v.context,kind:v.kind,loadCount:loads.get(identity)}));
 const artifactSHA=hash(output.contents);
 const proof={schema:'ACTUAL_ACADEMY_EXISTING_FEATURE_SOURCE_BUILD_V1',status:'PASS',buildInvocations:1,sourceManifestSHA256:MANIFEST_SHA,aliasMapSHA256:ALIAS_SHA,artifact:{file:'academy-existing-feature-common.mjs',bytes:output.contents.length,sha256:artifactSHA},apiArtifactSHA256:artifactSHA,coordinatorArtifactSHA256:artifactSHA,expectedExports:EXPECTED_EXPORTS,actualExports:[...outputs[0].exports].sort(),actualExternals:externals,selectedGuardInputs:1,legacyGuardInputs:0,sensitiveConsumerInputs:4,sensitiveImporterEdges:Object.fromEntries(sensitiveEdges),allObservedSourceInputsStable:true,declaredCompilerInputsStable:true,compilerStopRequested:true,compilerOwnedGroupClosure:'FUTURE_CALLER_MUST_PROVE',applicationOrDependencyOutputExecuted:false,SDKNativeHTTPPrivateFixtureAccess:false,availabilityDraftLoaded:false,AI:'OFF'};
 const encoded=value=>{const bytes=Buffer.from(JSON.stringify(value,null,2)+'\n');check(bytes.length<=MAX_JSON_BYTES,'JSON_OUTPUT_CAP');return bytes;};
 const files=[['academy-existing-feature-common.mjs',output.contents],['academy-existing-feature-common.metafile.json',encoded(result.metafile)],['academy-existing-feature-common.source-identities.json',encoded({schema:'ACTUAL_ACADEMY_PORTABLE_INPUT_IDENTITIES_V1',inputs:identities})],['ACTUAL-BUILD-RESULT.json',encoded(proof)]];
 // Exclusive directory and files; preserve partial outputs on any failure. Never remove or overwrite.
 await fs.mkdir(outputRoot,{mode:0o700});
 for(const [name,bytes]of files)await fs.writeFile(join(outputRoot,name),bytes,{flag:'wx',mode:0o600});
 return proof;
}
