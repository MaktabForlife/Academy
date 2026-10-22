/* M4L V105.2 - Compact Program grid; explicit row saves, retained failed edits. */
(function () {
  "use strict";
  const byId = id => document.getElementById(id);
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
      state.owner=localStorage.getItem("m4l_account_token");
      state.rows = data.programs.map(draft);
      state.selected = state.rows.some(row => row.id === state.selected) ? state.selected : (unified?"":state.rows.find(row => row.mode === "PROGRAM")?.id || "");
      state.readiness = {};
      byId("program-workspace").hidden = false;
      message("");
    } catch (error) { message(error.message, true); byId("program-retry").hidden = false; }
    finally { state.busy = false; render(); }
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
      const result = await api(row.saved ? "save" : "create", payload);
      Object.assign(row, draft(result.program));
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
    row.error = "";
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
    return {ready:state.store==='D1'&&Boolean(state.owner)&&state.owner===localStorage.getItem('m4l_account_token'),program:row?{...row,saved:undefined,error:undefined}:null,available:Boolean(row?.saved&&!dirty(row)&&!state.busy)};
  }
  window.M4L_PROGRAM_BUILDER_NAV={selection,hasEdits,showDetails:renderDetail,update(program){const row=state.rows.find(row=>row.id===program.id);if(!row||dirty(row)||row.revision===program.revision)return;Object.assign(row,draft(program));render();}};
  document.addEventListener("DOMContentLoaded", () => void init());
})();
