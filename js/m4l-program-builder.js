/* M4L V105.2 - Compact Program grid; explicit row saves, retained failed edits. */
(function () {
  "use strict";
  const byId = id => document.getElementById(id);
  const v2=location.origin==='https://ummabbadacademy.app'&&document.querySelector('meta[name="uaa-auth-version"]')?.content==='2';
  let client=null,privateRoots=[],lastList=null,restoreBusy=false,lastContextStamp='';const recoveries=new Map(),prepared=new Set(),preparing=new Map();
  const ownerKey=()=>v2?(client?.ownerKey()||''):localStorage.getItem('m4l_account_token')||'';
  async function nativeClient(){if(client)return client;client=await window.M4L_ACADEMY_AUTH.ready;privateRoots=[byId('pg-list'),byId('pg-context')].filter(Boolean);for(const root of [...privateRoots,byId('program-detail')].filter(Boolean))client.registerPrivateRoot(root);return client;}
  const programVersion=value=>{if(typeof value==='string'&&/^(0|[1-9][0-9]*)$/.test(value))value=Number(value);if(!Number.isSafeInteger(value)||value<0)throw Error('The native Program revision is unavailable.');return value;};
  const recoveryResource=row=>({type:'academy-program',programId:row.saved?row.id:null,mode:row.saved?'edit':'create'});
  const snapshot=row=>Object.fromEntries(['id',...fields,'publicCard'].map(key=>[key,structuredClone(row[key]??null)]));
  async function rowRecovery(row){let controller=recoveries.get(row.id);if(!controller){const {createAcademyNativeRecovery}=await import('/js/m4l-v111-editor.mjs');controller=await createAcademyNativeRecovery({client:await nativeClient(),resource:recoveryResource(row),capture:()=>snapshot(row),baseVersion:()=>programVersion(row.saved?.revision??0),isDirty:()=>dirty(row),onUnavailable:error=>message('Protected draft unavailable. '+error.message,true)});if(!state.rows.includes(row)){controller.dispose();throw new DOMException('This Program view changed.','AbortError');}recoveries.set(row.id,controller);}return controller;}
  async function prepareRow(row){if(!v2||prepared.has(row.id))return;if(preparing.has(row.id))return preparing.get(row.id);const promise=(async()=>{const recovery=await rowRecovery(row),retained=await recovery.prepare();if(!state.rows.includes(row))throw new DOMException('This Program view changed.','AbortError');if(retained.marker||retained.draft?.pendingAcceptance||retained.draft?.dirty&&retained.draft.baseVersion!==programVersion(row.saved?.revision??0)){await reviewRetained(row,retained);return;}if(retained.draft?.dirty){Object.assign(row,retained.draft.document);row.operationId=null;}prepared.add(row.id);render();if(lastList&&client.isCurrentResult(lastList)&&state.selected===row.id)client.revealResult(lastList,{root:byId('program-detail')});})();preparing.set(row.id,promise);try{return await promise;}finally{preparing.delete(row.id);}}
  async function reviewRetained(row,retained){
   const panel=document.createElement('section'),text=document.createElement('p'),read=document.createElement('button');panel.setAttribute('role','status');text.textContent='Your retained Program change needs review. It has not been sent again.';read.type='button';read.textContent='Read current Program records';panel.append(text,read);byId('program-message').after(panel);
   await new Promise((resolve,reject)=>{read.onclick=async()=>{read.disabled=true;try{const current=await api('list');retained=await (await rowRecovery(row)).recoverNativeMutation({currentServerValue:current});const server=current.programs.find(p=>p.id===row.id);text.textContent=server?'Current Program revision '+server.revision+'. Choose what to edit; nothing will be sent automatically.':'No current row was found. Absence does not confirm whether the old change happened. Keep your retained copy for review.';if(!server&&retained.marker)return;const use=document.createElement('button'),keep=document.createElement('button');use.type=keep.type='button';use.textContent='Use current Program';keep.textContent='Continue retained Program edits';const choose=async restore=>{try{const fresh=await api('list'),actual=fresh.programs.find(p=>p.id===row.id);if(!actual)throw Error('The current Program must be checked before continuing.');if(!confirm('Discard only this local save marker and continue editing? This does not save or publish a Program.'))return;await (await rowRecovery(row)).discardRetained({confirmed:true,currentServerValue:fresh});Object.assign(row,draft(actual));if(restore&&retained.draft?.document)Object.assign(row,retained.draft.document);row.revision=actual.revision;row.operationId=null;prepared.add(row.id);await (await rowRecovery(row)).checkpoint(snapshot(row),{dirty:restore});panel.remove();render();resolve();}catch(error){text.textContent=error.message;}};use.onclick=()=>void choose(false);keep.onclick=()=>void choose(true);panel.append(use,keep);if(retained.draft?.pendingAcceptance){use.disabled=keep.disabled=true;const complete=document.createElement('button');complete.type='button';complete.textContent='Finish saved native change';complete.onclick=async()=>{complete.disabled=true;try{const fresh=await api('list');await (await rowRecovery(row)).resumeNativeAcceptance({currentServerValue:fresh});delete retained.draft.pendingAcceptance;complete.hidden=true;use.disabled=keep.disabled=false;text.textContent='The saved native change was completed. Read current records before choosing retained edits.';}catch(error){text.textContent=error.message;complete.disabled=false;}};panel.append(complete);}read.hidden=true;}catch(error){text.textContent=error.message;}finally{read.disabled=false;}};});
  }
  async function v2API(action,payload,account){const auth=await nativeClient(),path=account?'/api/account/session':'/api/admin/platform/programs/'+action,write=!account&&!['list','readiness'].includes(action);if(!write)return auth.request(path,payload,{headers:{'X-Academy-Workspace':account?'LEARN':'ADMIN'}});const row=state.rows.find(row=>row.id===payload.id),resource=action==='copy'?{type:'academy-program',programId:payload.id,mode:'copy'}:row?recoveryResource(row):null;if(!resource)throw Error('The exact Program edit scope is unavailable.');let recovery=row&&action!=='copy'?await rowRecovery(row):null;if(!recovery){const {createAcademyNativeRecovery}=await import('/js/m4l-v111-editor.mjs');recovery=await createAcademyNativeRecovery({client:auth,resource,capture:()=>payload,baseVersion:()=>programVersion(payload.revision??0)});}const retained=await recovery.prepare();if(retained.marker||retained.draft?.pendingAcceptance){if(row)void reviewRetained(row,retained);throw Object.assign(Error('Review the unknown Program save before another change.'),{code:'SAVE_OUTCOME_UNKNOWN'});}let attempt;try{attempt=await recovery.beforeMutation({action,input:payload},{sensitive:true});const result=await auth.request(path,payload,{headers:{'X-Academy-Workspace':'ADMIN'}});return await recovery.completeNativeMutation(attempt,result,{operationId:payload.operationId});}catch(error){if(attempt)await recovery.markUnknown(attempt).catch(()=>{});if(row)void recovery.prepare().then(retained=>(retained.marker||retained.draft?.pendingAcceptance)&&reviewRetained(row,retained));throw error;}finally{if(action==='copy')recovery.dispose();}}

  const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[char]));
  const unified=Boolean(byId("pg-tabs"));
  let timezone = "Africa/Johannesburg";
  const fields = ["name", "durationYears", "timezone", "status", "spreadsheetId", "accessModel", "programZoomLink"];
  const state = { owner:"", rows: [], selected: new URLSearchParams(location.search).get('program')||"", busy: false, search: "", filter: "AVAILABLE", readiness: {}, store: "SHEETS", statuses: ["DRAFT", "ARCHIVED"] };
  const dirty = row => !row.saved || fields.some(field => String(row[field] ?? "") !== String(row.saved[field] ?? "")) || JSON.stringify(row.publicCard||{})!==JSON.stringify(row.saved.publicCard||{});
  const matchesStatus=row=>!state.filter||(state.filter==="AVAILABLE"?!["ARCHIVED","CANCELLED"].includes(row.status):row.status===state.filter);
  const hasEdits = () => state.rows.some(dirty);
  const draft = program => ({ ...program, publicCard:{...program.publicCard}, saved: { ...program,publicCard:{...program.publicCard} }, error: "" });
  function message(text, error = false) {
    byId("program-message").textContent = text;
    byId("program-message").classList.toggle("is-error", error);
  }
  async function api(action, payload = {}, account = false) {
    if(v2)return v2API(action,payload,account);
    const token = localStorage.getItem("m4l_account_token");
    if (!token) throw new Error("Sign in using your personal Academy account link, then open Programs.");
    if(account&&window.M4L_ACADEMY_NAVIGATION?.session){
      const result=await window.M4L_ACADEMY_NAVIGATION.session(token);
      if(token!==localStorage.getItem("m4l_account_token"))throw new Error("Your Academy account changed. Open Programs again.");
      return result;
    }
    const response = await fetch(`${String(window.M4L_CONFIG?.API_BASE || "").replace(/\/$/, "")}${account ? "/api/account/session" : `/api/admin/platform/programs/${action}`}`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(payload)
    });
    let result;
    try { result = await response.json(); } catch { throw new Error("The service returned an unreadable response. Your edits are still here."); }
    if(token!==localStorage.getItem("m4l_account_token"))throw new Error("Your Academy account changed. Open Programs again.");
    if (!response.ok || !result.success) throw new Error(result.error || "Could not save. Your edits are still here.");
    void window.M4L_REFRESH_AFTER_SAVE?.(result,token);return result;
  }
  async function load() {
    if(v2){for(const controller of recoveries.values())controller.dispose();recoveries.clear();prepared.clear();}
    state.busy = true;
    busyControls();
    byId("program-retry").hidden = true;
    try {
      const data = await api("list");
      timezone=data.timezone||timezone;
      state.store = data.store || "SHEETS";
      state.globalAdmin=Boolean(data.globalAdmin);byId("program-add").hidden=state.store==='D1'&&!state.globalAdmin;
      byId('program-access-label').hidden=state.store!=='D1';
      byId('program-zoom-label').hidden=state.store!=='D1';
      state.learningWorkflowsReady = Boolean(data.learningWorkflowsReady);
      state.statuses = data.statuses || ["DRAFT", "ARCHIVED"];
      if (state.store === "D1") {
        byId("program-store-label").textContent = "Records";
        byId("program-access-note").textContent = "Activating a Program does not publish its timetable.";
        byId("program-setup-note").textContent = "New Programs start as drafts. Timetable editing, Library and attendance are awaiting migration.";
      }
      state.owner=ownerKey();lastList=data;
      state.rows = data.programs.map(draft);
      state.selected = state.rows.some(row => row.id === state.selected) ? state.selected : (unified?"":state.rows.find(row => row.mode === "PROGRAM")?.id || "");
      state.readiness = {};
      byId("program-workspace").hidden = false;
      message("");
    } catch (error) { message(error.message, true); byId("program-retry").hidden = false; }
    finally { state.busy = false; render();if(v2&&lastList&&client?.isCurrentResult(lastList))client.revealResult(lastList,{roots:privateRoots}); }
  }
  function busyControls() {
    for (const id of ["program-refresh", "program-add"]) byId(id).disabled = state.busy;
  }
  function render() {
    busyControls();
    const rows = state.rows.filter(row => matchesStatus(row)
      && `${row.name} ${row.id}`.toLowerCase().includes(state.search.toLowerCase()));
    byId("program-count").textContent = `${rows.length} of ${state.rows.length} Programs`;
    byId("program-rows").innerHTML = rows.length ? rows.map((row, index) => renderRow(row, index + 1)).join("")
      : unified?'<p class="pb-empty">No Programs found. Clear your filters or create a new Program.</p>':'<tr><td colspan="7" class="pb-empty">No Programs found. Clear your filters or create a new Program.</td></tr>';
    renderDetail();
  }
  function renderRow(row, index) {
    if(unified)return `<a class="pg-program-card${state.selected===row.id?' is-selected':''}" data-id="${escape(row.id)}" href="/programs/?program=${encodeURIComponent(row.id)}&tab=details"><strong>${escape(row.name||'New Program')}</strong><span class="pg-badge">${escape(row.status)}</span><small>${escape(row.accessModel==='FREE'?'Free':row.accessModel==='PAID'?'Paid':'Choose Free or Paid')}</small></a>`;
    const editable = row.mode === "PROGRAM";
    const input = (field, label, extra = "") => `<input data-field="${field}" aria-label="${escape(label)} for ${escape(row.name || "new Program")}" value="${escape(row[field])}" ${extra} ${!editable ? "readonly" : ""} ${state.busy ? "disabled" : ""} />`;
    return `<tr data-id="${escape(row.id)}" class="${state.selected === row.id ? "is-selected" : ""}">
      <td data-label="Select">${editable ? `<button type="button" class="pb-program-select" data-action="select" aria-label="Select ${escape(row.name || "new Program")}" aria-pressed="${state.selected === row.id}" ${state.busy ? "disabled" : ""}>${index}</button>` : index}</td><td data-label="Program name">${input("name", "Program name", 'class="pb-name" maxlength="160"')}</td>
      <td hidden>${editable ? input("durationYears", "Duration in years", 'type="number" min="1" max="30" step="1"') : "—"}</td>
      <td data-label="Free / Paid" ${state.store!=='D1'?'hidden':''}>${state.store==='D1'?`<select data-field="accessModel" aria-label="Free or Paid for ${escape(row.name||'new Program')}" title="Free enables public joining during the joining window. Paid has no public Join link." ${state.busy?'disabled':''}>${!['FREE','PAID'].includes(row.accessModel)?'<option value="UNKNOWN" selected disabled>Choose Free or Paid</option>':''}<option value="FREE" ${row.accessModel==='FREE'?'selected':''}>Free</option><option value="PAID" ${row.accessModel==='PAID'?'selected':''}>Paid</option></select>`:''}</td>
      <td data-label="Program Zoom link" ${state.store!=='D1'?'hidden':''}>${state.store==='D1'?input('programZoomLink','Program Zoom link','type="url" maxlength="2048" placeholder="Optional"'):''}</td>
      <td data-label="Program status">${editable ? `<select data-field="status" aria-label="Status for ${escape(row.name || "new Program")}" ${state.busy ? "disabled" : ""}>${state.statuses.map(value => `<option value="${value}" ${row.status === value ? "selected" : ""}>${value === "DRAFT" ? "Draft" : value === "ACTIVE" ? "Active" : "Archived"}</option>`).join("")}</select>` : escape(row.status === "ACTIVE" ? "Active" : "Inactive")}</td>
      <td hidden>${state.store === "D1" ? (row.saved ? "Ready" : "New Program") : row.saved ? `<a href="https://docs.google.com/spreadsheets/d/${encodeURIComponent(row.spreadsheetId)}/edit" target="_blank" rel="noopener noreferrer">Open spreadsheet ↗</a>` : input("spreadsheetId", "Spreadsheet link or ID", 'placeholder="Paste Google Sheets link"')} </td>
      <td data-label="Changes"><div class="pb-actions"><span class="pb-state">${!editable ? "Existing workspace" : row.error ? "Save failed" : dirty(row) ? "Unsaved" : "Saved"}</span>
        ${editable ? `<button type="button" data-action="save" aria-label="Save ${escape(row.name || "new Program")}" title="Save Program" ${state.busy || !dirty(row) ? "disabled" : ""}>▣ Save</button><button type="button" data-action="discard" class="pb-secondary" aria-label="Discard changes to ${escape(row.name || "new Program")}" ${state.busy || !dirty(row) ? "disabled" : ""}>Discard</button>` : ""}</div>
        ${row.error ? `<span class="pb-row-error" role="alert">${escape(row.error)}</span>` : ""}</td></tr>`;
  }
  function renderDetail() {
    const panel = byId("program-detail");
    const row = state.rows.find(item => item.id === state.selected);
    panel.hidden = !row || row.mode !== "PROGRAM" || !matchesStatus(row)
      || !`${row.name} ${row.id}`.toLowerCase().includes(state.search.toLowerCase());
    window.M4L_PROGRAM_MANAGEMENT_NAV?.setSelection(selection());
    if (panel.hidden) return;
    if(v2&&!prepared.has(row.id)){panel.inert=true;void prepareRow(row).then(()=>{panel.inert=false;}).catch(error=>message(error.message,true));}else {panel.inert=false;if(v2&&lastList&&client?.isCurrentResult(lastList))client.revealResult(lastList,{root:panel});}
    if(unified){
      const input=(field,label,extra='')=>`<label>${label}<input data-field="${field}" value="${escape(row[field])}" ${extra} ${state.busy?'disabled':''}></label>`;
      panel.innerHTML=`<div class="pg-details-form" data-id="${escape(row.id)}">${input('name','Program name','maxlength="160" required')}<label>Status<select data-field="status" ${state.busy?'disabled':''}>${state.statuses.map(value=>`<option value="${value}" ${value===row.status?'selected':''}>${value==='ACTIVE'?'Active':value==='ARCHIVED'?'Archived':'Draft'}</option>`).join('')}</select></label>${state.store==='D1'?`<label>Free / Paid<select data-field="accessModel" ${state.busy?'disabled':''}>${!['FREE','PAID'].includes(row.accessModel)?'<option value="UNKNOWN" disabled selected>Choose Free or Paid</option>':''}<option value="FREE" ${row.accessModel==='FREE'?'selected':''}>Free</option><option value="PAID" ${row.accessModel==='PAID'?'selected':''}>Paid</option></select></label>${input('programZoomLink','Program Zoom link · optional','type="url" maxlength="2048"')}`:input('spreadsheetId','Spreadsheet link or ID')}<div class="pg-detail-actions"><button type="button" data-action="save" ${state.busy||!dirty(row)?'disabled':''}>Save Program</button><button type="button" data-action="discard" class="pb-secondary" ${state.busy||!dirty(row)?'disabled':''}>Discard changes</button><small class="pb-state">${row.error?'Save failed':dirty(row)?'Unsaved changes':'Saved'}</small></div>${row.error?`<p role="alert" class="pb-row-error">${escape(row.error)}</p>`:''}</div>`;
      return;
    }
    panel.dataset.id=row.id;
    const readiness = state.readiness[row.id];
    if(state.store==='D1'){panel.hidden=true;panel.replaceChildren();return;}
    panel.innerHTML = `<div class="pb-detail-header"><div><h2>${escape(row.name || "New Program")}</h2><small>${escape(row.id)}</small></div>
      <div class="pb-actions">${row.saved && !dirty(row) ? `<a href="/programs/${state.store==='D1'&&!state.learningWorkflowsReady?'manage':'timetable'}.html?program=${encodeURIComponent(row.id)}">Open Program Admin →</a><a href="/programs/manage.html?program=${encodeURIComponent(row.id)}&tab=profiles">People →</a>${state.store === "D1" && !state.learningWorkflowsReady ? "" : `<a href="/programs/library.html?program=${encodeURIComponent(row.id)}">Manage Library →</a><a href="/programs/timetable.html?program=${encodeURIComponent(row.id)}">Open timetable →</a><a href="/programs/attendance.html?program=${encodeURIComponent(row.id)}">Attendance →</a>`}` : ""}<button type="button" data-action="check" class="pb-secondary" ${state.busy || !row.saved || dirty(row) ? "disabled" : ""}>Check readiness</button>
      <button type="button" data-action="prepare" ${state.store === "D1" ? "hidden" : ""} ${state.busy || !row.saved || dirty(row) || readiness?.prepared ? "disabled" : ""}>Prepare spreadsheet</button></div></div>
      <p>${escape(readiness?.message || (state.store === "D1" ? "Program records are ready. Timetable publication controls which lessons appear on the website." : row.saved ? "Check backend access and prepare the Program spreadsheet. Save changes before checking." : "Save this draft to register the Program. Its spreadsheet can then be prepared."))}</p>
      <div class="pb-checks">${(readiness?.checks || [{ label: state.store === "D1" ? "Program records ready" : "Spreadsheet not checked", ok: state.store === "D1" }]).filter(check => !/time\s*zone/i.test(check.label)).map(check => `<span class="pb-check ${check.ok ? "is-ready" : ""}">${check.ok ? "✓" : "○"} ${escape(check.label)}</span>`).join("")}</div>
      <div class="pb-capabilities" aria-label="Capability availability"><span>✓ Configuration</span><span>✓ Curriculum management</span>${state.store === "D1" ? "<span>✓ Classes and enrolments</span>" : ""}${state.store !== "D1" || state.learningWorkflowsReady ? "<span>✓ Library management</span><span>✓ Library viewer</span><span>✓ Timetable builder</span><span>✓ Attendance registers</span>" : ""}${(state.store === "D1" && !state.learningWorkflowsReady ? ["Library", "Timetable editing", "Attendance", "Planner"] : []).map(name => `<span>${name} · Later stage</span>`).join("")}</div>`;
  }
  let copyPending=null;
  function beginNew(){
    if(state.busy)return;
    if(!byId('program-new-dialog')||state.store!=='D1'){add();return;}
    if(hasEdits()){message('Save or discard unfinished Program changes before starting a new Program.',true);return;}
    copyPending=null;byId('program-copy-message').textContent='';byId('program-copy-source').innerHTML='<option value="">Blank Program</option>'+state.rows.filter(r=>r.saved&&r.mode==='PROGRAM').map(r=>`<option value="${escape(r.id)}">${escape(r.name)} · ${escape(r.status)}</option>`).join('');copySourceChanged();byId('program-new-dialog').showModal();
  }
  function copySourceChanged(){const source=state.rows.find(r=>r.id===byId('program-copy-source').value);copyPending=null;byId('program-copy-options').hidden=!source;byId('program-copy-name').value=source?(source.name.slice(0,153)+' (copy)'):'';byId('program-copy-confirm').textContent=source?'Copy as new draft':'Continue';}
  async function confirmNew(){
    if(state.busy)return;const source=state.rows.find(r=>r.id===byId('program-copy-source').value);
    if(!source){byId('program-new-dialog').close();add();return;}
    const name=byId('program-copy-name').value.trim();if(!name){byId('program-copy-message').textContent='Enter the new Program name.';return;}
    const body={id:source.id,revision:source.revision,name,copySchedule:byId('program-copy-schedule').checked,copyEnrollments:byId('program-copy-enrolments').checked};const key=JSON.stringify(body);if(copyPending?.key!==key)copyPending={key,body:{...body,operationId:crypto.randomUUID()}};
    state.busy=true;for(const el of byId('program-new-dialog').querySelectorAll('button,input,select'))el.disabled=true;byId('program-copy-message').textContent='Copying Program…';
    try{const result=await api('copy',copyPending.body);copyPending=null;state.busy=false;location.href='/programs/?program='+encodeURIComponent(result.program.id)+'&tab=details';}
    catch(error){byId('program-copy-message').textContent=error.message+' Retry the same copy to avoid creating a duplicate.';}
    finally{state.busy=false;for(const el of byId('program-new-dialog').querySelectorAll('button,input,select'))el.disabled=false;}
  }
  function add() {
    if (state.busy) return;
    if(unified&&window.M4L_PROGRAM_ADMIN?.hasMounted()){location.href="/programs/?new=1&tab=details";return;}
    if(v2&&state.rows.some(row=>!row.saved)){message("Finish the existing new Program draft first.",true);return;}
    const id = `PRG-${crypto.randomUUID()}`;
    state.rows.push({ id, name: "", durationYears: "", timezone, status: "DRAFT", spreadsheetId: "", mode: "PROGRAM", saved: null, error: "" });
    state.selected = id;
    state.search = state.filter = "";
    byId("program-search").value = byId("program-filter").value = "";
    render();
    document.querySelector(`#program-detail [data-id="${id}"] [data-field="name"]`)?.focus();
    message(state.store === "D1" ? "New draft. Enter its name. One editable class will be created automatically." : "New draft. Enter its name and spreadsheet.");
  }
  async function save(row) {
    if (state.busy || !dirty(row)) return;
    state.busy = true;
    row.error = "";
    message(`Saving ${row.name || "Program"}…`);
    render();
    try {
      const payload=Object.fromEntries(["id", "revision", ...fields].map(field => [field, row[field]]));
      if(state.store!=='D1'||!['FREE','PAID'].includes(row.accessModel)||row.saved&&row.accessModel===row.saved.accessModel)delete payload.accessModel;
      if(state.store!=='D1'||row.saved&&row.programZoomLink===row.saved.programZoomLink)delete payload.programZoomLink;
      payload.timezone=row.saved?row.saved.timezone:timezone;
      if (state.store === "D1") payload.operationId = row.operationId ||= crypto.randomUUID();
      const created=!row.saved,result = await api(created ? "create" : "save", payload);
      const oldRecovery=v2?await rowRecovery(row):null;Object.assign(row, draft(result.program));
      if(oldRecovery){if(created){await oldRecovery.discardRetained({confirmed:true,currentServerValue:result});oldRecovery.dispose();recoveries.delete(row.id);prepared.delete(row.id);}else await oldRecovery.checkpoint(snapshot(row),{dirty:false});}
      delete state.readiness[row.id];
      message(state.store === "D1" ? `${row.name} saved.` : `${row.name} saved. Teaching remains disabled.`);
    } catch (error) { row.error = error.message; message(`Save failed: ${error.message}`, true); }
    finally { state.busy = false; render(); document.querySelector(`[data-id="${row.id}"] [data-field="name"]`)?.focus(); }
  }
  async function readiness(action) {
    const row = state.rows.find(item => item.id === state.selected);
    if (state.busy || !row?.saved || dirty(row)) return;
    state.busy = true;
    message(state.store === "D1" ? "Checking Program records…" : action === "prepare" ? "Preparing spreadsheet…" : "Checking spreadsheet…");
    render();
    try { state.readiness[row.id] = await api(action === "prepare" ? "prepare" : "readiness", { id: row.id }); message(state.readiness[row.id].message); }
    catch (error) { message(error.message, true); }
    finally { state.busy = false; render(); }
  }
  function edit(event) {
    const control = event.target.closest("[data-field]");
    const row = state.rows.find(item => item.id === control?.closest("[data-id]")?.dataset.id);
    if (!row || row.mode !== "PROGRAM" || state.busy) return;
    row[control.dataset.field] = control.value;
    row.operationId = null;
    row.error = "";if(v2)void rowRecovery(row).then(recovery=>recovery.checkpoint(snapshot(row))).catch(error=>message(error.message,true));
    const tr = control.closest(unified?"[data-id]":"tr");
    if(unified){window.M4L_PROGRAM_MANAGEMENT_NAV?.setSelection(selection());const actions=tr.querySelector(".pg-detail-actions");actions.querySelector(".pb-state").textContent=dirty(row)?"Unsaved changes":"Saved";actions.querySelectorAll("button").forEach(button=>button.disabled=!dirty(row));return;}
    tr.querySelector(".pb-state").textContent = dirty(row) ? "Unsaved" : "Saved";
    tr.querySelector('[data-action="save"]').disabled = !dirty(row);
    tr.querySelector('[data-action="discard"]').disabled = !dirty(row);
    tr.querySelector(".pb-row-error")?.remove();
    state.selected = row.id;
    byId("program-rows").querySelectorAll("tr[data-id]").forEach(item => {
      const selected = item.dataset.id === row.id;
      item.classList.toggle("is-selected", selected);
      item.querySelector('[data-action="select"]')?.setAttribute("aria-pressed", String(selected));
    });
    renderDetail();
  }
  async function init() {
    if(v2){await nativeClient();const protect=event=>{const control=event.target.closest?.('[data-field]'),row=state.rows.find(row=>row.id===control?.closest('[data-id]')?.dataset.id);if(row&&!prepared.has(row.id)){event.preventDefault();void prepareRow(row).catch(error=>message(error.message,true));}};byId('program-builder').addEventListener('beforeinput',protect,true);byId('program-builder').addEventListener('pointerdown',protect,true);byId('program-builder').addEventListener('focusin',protect,true);window.addEventListener('academy-v2-revalidate',()=>{prepared.clear();if(lastList)lastList=null;void api('list').then(data=>{if(!client.isCurrentResult(data))return;if(!hasEdits()){state.rows=data.programs.map(draft);render();}else renderDetail();client.revealResult(data,{roots:privateRoots});}).catch(error=>message(error.message,true));});}
    if(v2){window.addEventListener('academy-v2-mask',event=>{if(event.detail.masked)prepared.clear();});window.addEventListener('academy-v2-context',()=>{const current=window.M4L_ACADEMY_AUTH.getState(),stamp=JSON.stringify([current?.context,current?.viewVersion,current?.state,current?.authorityReady,current?.replacementRequired]);if(stamp===lastContextStamp)return;lastContextStamp=stamp;if(!state.rows.length||state.busy||current?.state!=='UNLOCKED'||current?.authorityReady===false||current?.replacementRequired)return;void api('list').then(data=>{if(!client.isCurrentResult(data))return;lastList=data;renderDetail();client.revealResult(data,{roots:privateRoots});}).catch(error=>message(error.message,true));});}
    byId("program-add").addEventListener("click", beginNew);
    if(byId("program-new-dialog")){byId("program-copy-source").onchange=copySourceChanged;byId("program-copy-cancel").onclick=()=>{if(!state.busy)byId("program-new-dialog").close();};byId("program-copy-confirm").onclick=()=>void confirmNew();byId("program-new-dialog").addEventListener("cancel",event=>{if(state.busy)event.preventDefault();});}
    byId("program-refresh").addEventListener("click", () => {
      if (state.busy) return;
      if (hasEdits()) { byId("program-refresh-warning").hidden = false; byId("program-keep-editing").focus(); }
      else void load();
    });
    byId("program-keep-editing").addEventListener("click", () => { byId("program-refresh-warning").hidden = true; });
    byId("program-discard-refresh").addEventListener("click", () => { byId("program-refresh-warning").hidden = true; if (!state.busy) void load(); });
    byId("program-retry").addEventListener("click", () => { if (!state.busy) void load(); });
    byId("program-search").addEventListener("input", event => { state.search = event.target.value; render(); });
    byId("program-filter").addEventListener("change", event => { state.filter = event.target.value; render(); });
    byId("program-builder").addEventListener("input", edit);
    byId("program-builder").addEventListener("change", edit);
    byId("program-builder").addEventListener("click", event => {
      const button = event.target.closest("[data-action]");
      if (!button || state.busy) return;
      const row = state.rows.find(item => item.id === button.closest("[data-id]")?.dataset.id);
      const action = button.dataset.action;
      if (action === "save" && row) void save(row);
      else if (action === "discard" && row) {
        if (row.saved) Object.assign(row, draft(row.saved));
        else state.rows = state.rows.filter(item => item !== row);
        render(); message("Unsaved row changes discarded.");
      } else if (action === "select" && row?.mode === "PROGRAM") { state.selected = row.id; render(); if(!byId("program-detail").hidden)byId("program-detail").scrollIntoView({ block: "nearest", behavior: "smooth" }); }
      else if (["check", "prepare"].includes(action)) void readiness(action);
    });
    byId("program-builder").addEventListener("keydown", event => {
      if (event.key !== "Enter" || !(event.ctrlKey || event.metaKey)) return;
      const row = state.rows.find(item => item.id === event.target.closest("[data-id]")?.dataset.id);
      if (row) { event.preventDefault(); void save(row); }
    });
    window.addEventListener("beforeunload", event => { if (hasEdits() || state.busy) { event.preventDefault(); event.returnValue = ""; } });
    try {
      const session = await api("", {}, true);
      if (session.account?.uniqueid) byId("academy-link").href = `/account/${encodeURIComponent(session.account.uniqueid)}?switch=1`;
      await load();
      if(unified&&new URLSearchParams(location.search).get("new")==="1")add();
    } catch (error) { message(error.message, true); }
  }
  function selection(){
    const row=state.rows.find(item=>item.id===state.selected&&item.mode==='PROGRAM'&&matchesStatus(item)&&`${item.name} ${item.id}`.toLowerCase().includes(state.search.toLowerCase()));
    return {ready:state.store==='D1'&&Boolean(state.owner)&&state.owner===ownerKey(),program:row?{...row,saved:undefined,error:undefined}:null,available:Boolean(row?.saved&&!dirty(row)&&!state.busy)};
  }
  window.M4L_PROGRAM_BUILDER_NAV={selection,hasEdits,showDetails:renderDetail,update(program){const row=state.rows.find(row=>row.id===program.id);if(!row||dirty(row)||row.revision===program.revision)return;Object.assign(row,draft(program));render();}};
  document.addEventListener("DOMContentLoaded", () => void init());
})();
