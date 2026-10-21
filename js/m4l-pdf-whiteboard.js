/* Academy PDF whiteboard, adapted from Reboot's v99.1 Teaching Panel.
   Drawing, erasing, history, image sharing and notes remain local to this reader tab. */
(function () {
  "use strict";

  const state = {
    open: false,
    activeTab: "drawing",
    tool: "pen",
    drawing: false,
    canvas: null,
    context: null,
    history: [],
    redo: [],
    maxHistory: 30,
    panelWidth: 420,
    revision: 0,
    savedRevision: 0,
    savedNotes: "",
    restoreVersion: 0,
    restoring: false,
    resizeObserver: null
  };

  const byId = id => document.getElementById(id);
  const isCompact = () => window.matchMedia("(max-width: 767px)").matches;
  const isTablet = () => window.matchMedia("(min-width: 768px) and (max-width: 1179px)").matches;

  function init() {
    const panel = byId("m4l-teaching-panel");
    const canvas = byId("m4l-teaching-canvas");
    if (!panel || !canvas || panel.dataset.m4lTeachingReady === "true") return false;

    panel.dataset.m4lTeachingReady = "true";
    state.canvas = canvas;
    state.context = canvas.getContext("2d", { willReadFrequently: true });

    bindTabs();
    bindTools();
    bindCanvas();
    bindDivider();
    bindKeyboard();
    bindResize();
    resizeCanvas(true);
    pushHistory(true);
    bindActions();
    return true;
  }

  function ensureInit() {
    return init() || !!state.canvas;
  }

  function notify(message) { byId('m4l-whiteboard-status').textContent = message; }

  function bindActions() {
    const actions = {close, clearActive, undo, redo, saveDrawing, shareDrawing, saveNotes};
    byId('m4l-teaching-panel-toggle').addEventListener('click', toggle);
    document.querySelectorAll('[data-m4l-whiteboard-action]').forEach(button => {
      button.addEventListener('click', () => actions[button.dataset.m4lWhiteboardAction]?.());
    });
    const size = byId('m4l-teaching-width'); let accepted = Number(size.value);
    size.addEventListener('input', () => { if (size.validity.valid && size.value !== '') accepted = Number(size.value); });
    size.addEventListener('blur', () => { if (!size.validity.valid || size.value === '') size.value = accepted; });
  }

  function hasUnsaved() {
    const current = state.history.at(-1), notes = byId('m4l-teaching-notes')?.value || '';
    return Boolean(current && !current.blank && current.revision !== state.savedRevision || notes.trim() && notes !== state.savedNotes);
  }

  function updateHistoryButtons() {
    document.querySelector('[data-m4l-whiteboard-action="undo"]').disabled = state.history.length <= 1;
    document.querySelector('[data-m4l-whiteboard-action="redo"]').disabled = !state.redo.length;
  }

  function toggle() {
    if (!ensureInit()) return false;
    return state.open ? close() : open();
  }

  function open() {
    if (!ensureInit()) return false;

    const panel = byId("m4l-teaching-panel");
    const divider = byId("m4l-teaching-panel-divider");
    const workspace = byId("m4l-pdf-teaching-workspace");
    const toggleButton = byId("m4l-teaching-panel-toggle");

    window.dispatchEvent(new CustomEvent('m4l-whiteboard-layout-start'));
    panel.hidden = false;
    panel.setAttribute("aria-hidden", "false");
    workspace?.classList.add("is-teaching-open");
    document.body.classList.add("m4l-teaching-panel-open");

    if (!isCompact()) {
      divider.hidden = false;
      applyPanelWidth(state.panelWidth);
    }

    toggleButton?.setAttribute("aria-expanded", "true");
    toggleButton?.setAttribute("aria-label", "Close whiteboard");
    state.open = true;
    window.dispatchEvent(new CustomEvent("m4l-whiteboard-change"));

    requestAnimationFrame(() => {
      resizeCanvas(false);
      if (state.activeTab === "drawing") state.canvas?.focus?.({preventScroll:true});
    });
    return true;
  }

  function close() {
    const panel = byId("m4l-teaching-panel");
    const divider = byId("m4l-teaching-panel-divider");
    const workspace = byId("m4l-pdf-teaching-workspace");
    const toggleButton = byId("m4l-teaching-panel-toggle");

    window.dispatchEvent(new CustomEvent('m4l-whiteboard-layout-start'));
    if (panel) {
      panel.hidden = true;
      panel.setAttribute("aria-hidden", "true");
    }
    if (divider) divider.hidden = true;
    workspace?.classList.remove("is-teaching-open");
    document.body.classList.remove("m4l-teaching-panel-open");
    toggleButton?.setAttribute("aria-expanded", "false");
    toggleButton?.setAttribute("aria-label", "Open whiteboard");
    state.open = false;

    byId("m4l-teaching-panel-toggle")?.focus();
    window.dispatchEvent(new CustomEvent("m4l-whiteboard-change"));
    return true;
  }

  function bindTabs() {
    document.querySelectorAll("[data-m4l-teaching-tab]").forEach(button => {
      button.addEventListener("click", () => setTab(button.dataset.m4lTeachingTab));
      button.addEventListener('keydown', event => {
        if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
        event.preventDefault();
        setTab(event.key === 'Home' ? 'drawing' : event.key === 'End' ? 'notes' : state.activeTab === 'drawing' ? 'notes' : 'drawing');
        byId('m4l-teaching-'+state.activeTab+'-tab').focus();
      });
    });
  }

  function setTab(tab) {
    const next = tab === "notes" ? "notes" : "drawing";
    state.activeTab = next;

    document.querySelectorAll("[data-m4l-teaching-tab]").forEach(button => {
      const active = button.dataset.m4lTeachingTab === next;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
      button.tabIndex = active ? 0 : -1;
    });

    const drawing = byId("m4l-teaching-drawing-view");
    const notes = byId("m4l-teaching-notes-view");
    if (drawing) {
      drawing.hidden = next !== "drawing";
      drawing.classList.toggle("is-active", next === "drawing");
    }
    if (notes) {
      notes.hidden = next !== "notes";
      notes.classList.toggle("is-active", next === "notes");
    }
    if (next === "drawing") requestAnimationFrame(() => resizeCanvas(false));
    else byId("m4l-teaching-notes")?.focus();
  }

  function bindTools() {
    document.querySelectorAll("[data-m4l-draw-tool]").forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.m4lDrawTool === state.tool));
      button.addEventListener("click", () => {
        state.tool = button.dataset.m4lDrawTool === "eraser" ? "eraser" : "pen";
        document.querySelectorAll("[data-m4l-draw-tool]").forEach(item => {
          item.classList.toggle("is-active", item === button);
          item.setAttribute('aria-pressed', String(item === button));
        });
      });
    });
  }

  function bindCanvas() {
    const canvas = state.canvas;
    canvas.tabIndex = 0;
    canvas.addEventListener("pointerdown", startStroke);
    canvas.addEventListener("pointermove", moveStroke);
    canvas.addEventListener("pointerup", endStroke);
    canvas.addEventListener("pointercancel", endStroke);
    canvas.addEventListener("pointerleave", event => {
      if (state.drawing && event.buttons === 0) endStroke(event);
    });
  }

  function canvasPoint(event) {
    const rect = state.canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }

  function configureStroke() {
    const colour = byId("m4l-teaching-colour")?.value || "#234569";
    const size = byId("m4l-teaching-width"), width = size.validity.valid && size.value !== '' ? Number(size.value) : 4;
    const ctx = state.context;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = width;
    ctx.globalCompositeOperation = state.tool === "eraser" ? "destination-out" : "source-over";
    ctx.strokeStyle = colour;
  }

  function startStroke(event) {
    if (event.isPrimary === false || state.drawing || state.restoring || event.button !== undefined && event.button !== 0) return;
    event.preventDefault();
    state.canvas.setPointerCapture?.(event.pointerId);
    state.drawing = true;
    configureStroke();
    const point = canvasPoint(event);
    state.context.beginPath();
    state.context.moveTo(point.x, point.y);
    state.context.lineTo(point.x + .01, point.y);
    state.context.stroke();
  }

  function moveStroke(event) {
    if (!state.drawing) return;
    event.preventDefault();
    const point = canvasPoint(event);
    state.context.lineTo(point.x, point.y);
    state.context.stroke();
  }

  function endStroke(event) {
    if (!state.drawing) return;
    event?.preventDefault?.();
    state.drawing = false;
    state.context.closePath();
    state.context.globalCompositeOperation = "source-over";
    pushHistory();
  }

  function resizeCanvas(initial) {
    if (!state.canvas || !state.context) return;
    const wrap = state.canvas.parentElement;
    if (!wrap) return;

    const rect = wrap.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const width = Math.max(1, wrap.clientWidth);
    const height = Math.max(1, wrap.clientHeight);

    if (state.canvas.width === Math.floor(width * dpr) &&
        state.canvas.height === Math.floor(height * dpr)) return;

    // Copy pixels synchronously so repeated resize events cannot restore an older image.
    const oldImage = document.createElement('canvas');
    oldImage.width = state.canvas.width; oldImage.height = state.canvas.height;
    if (oldImage.width && oldImage.height) oldImage.getContext('2d').drawImage(state.canvas, 0, 0);

    state.canvas.width = Math.floor(width * dpr);
    state.canvas.height = Math.floor(height * dpr);
    state.canvas.style.width = `${width}px`;
    state.canvas.style.height = `${height}px`;
    state.context.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (!initial && oldImage.width && oldImage.height) state.context.drawImage(oldImage, 0, 0, width, height);
  }

  function snapshot() {
    return state.canvas?.toDataURL("image/png") || "";
  }

  function pushHistory(blank = false) {
    const image = snapshot();
    if (!image) return;
    if (state.history.at(-1)?.image === image) return;
    state.history.push({image, blank, revision: ++state.revision});
    if (state.history.length > state.maxHistory) state.history.shift();
    state.redo.length = 0;
    updateHistoryButtons();
  }

  function restoreImage(dataUrl) {
    if (!state.context || !state.canvas) return;
    if (!dataUrl) return;
    const version = ++state.restoreVersion;
    state.restoring = true;
    const image = new Image();
    image.onload = () => {
      if (version !== state.restoreVersion) return;
      const rect = state.canvas.getBoundingClientRect();
      state.context.clearRect(0, 0, rect.width, rect.height);
      state.context.drawImage(image, 0, 0, rect.width, rect.height);
      state.restoring = false;
    };
    image.onerror = () => { if (version === state.restoreVersion) state.restoring = false; };
    image.src = dataUrl;
  }

  function undo() {
    if (state.history.length <= 1) return false;
    state.redo.push(state.history.pop());
    restoreImage(state.history.at(-1).image);
    updateHistoryButtons();
    return true;
  }

  function redo() {
    if (!state.redo.length) return false;
    const next = state.redo.pop();
    state.history.push(next);
    restoreImage(next.image);
    updateHistoryButtons();
    return true;
  }

  function clearDrawing(record = true) {
    if (!state.context || !state.canvas) return;
    const rect = state.canvas.getBoundingClientRect();
    state.context.clearRect(0, 0, rect.width, rect.height);
    ++state.restoreVersion;state.restoring = false;
    if (record) pushHistory(true);
    else {
      state.history.length = 0;
      state.redo.length = 0;
      pushHistory(true);
    }
  }

  function clearActive() {
    if (state.activeTab === "notes") {
      const notes = byId("m4l-teaching-notes");
      if (notes && (notes.value === "" || window.confirm("Clear all teaching notes?"))) notes.value = "";
      return;
    }
    if (window.confirm("Clear the whiteboard?")) clearDrawing(true);
  }

  function exportCanvasWithBackground() {
    const canvas = document.createElement("canvas");
    canvas.width = state.canvas.width;
    canvas.height = state.canvas.height;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(state.canvas, 0, 0);
    return canvas;
  }

  function saveDrawing() {
    if (!ensureInit()) return;
    const canvas = exportCanvasWithBackground();
    const link = document.createElement("a");
    link.download = `academy-whiteboard-${Date.now()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    state.savedRevision = state.history.at(-1)?.revision || 0;
    notify('Whiteboard saved as a PNG image.');
  }

  async function shareDrawing() {
    if (!ensureInit()) return;
    const revision = state.history.at(-1)?.revision || 0;
    const canvas = exportCanvasWithBackground();
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
    if (!blob) return;

    const file = new File([blob], `academy-whiteboard-${Date.now()}.png`, { type: "image/png" });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "Academy whiteboard" });
        state.savedRevision = revision;
        notify('Whiteboard shared.'); return;
      }
    } catch (error) { if (error.name === 'AbortError') return; }
    saveDrawing();
  }

  function saveNotes() {
    const notes = byId('m4l-teaching-notes').value, url = URL.createObjectURL(new Blob([notes], {type:'text/plain;charset=utf-8'}));
    const link = document.createElement('a');link.href = url;link.download = `academy-notes-${Date.now()}.txt`;link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);state.savedNotes = notes;notify('Notes saved as a text file.');
  }

  function bindDivider() {
    const divider = byId("m4l-teaching-panel-divider");
    if (!divider) return;

    const startResize = event => {
      if (isCompact()) return;
      event.preventDefault();
      window.dispatchEvent(new CustomEvent('m4l-whiteboard-layout-start'));
      divider.setPointerCapture?.(event.pointerId);

      const move = moveEvent => {
        const viewport = window.innerWidth;
        const minWidth = isTablet() ? 300 : 340;
        const maxWidth = Math.min(720, Math.floor(viewport * 0.58));
        const width = Math.max(minWidth, Math.min(maxWidth, viewport - moveEvent.clientX));
        state.panelWidth = width;
        applyPanelWidth(width);
        resizeCanvas(false);
        window.dispatchEvent(new CustomEvent('m4l-whiteboard-layout-end'));
      };

      const stop = stopEvent => {
        if (divider.hasPointerCapture?.(stopEvent.pointerId)) divider.releasePointerCapture(stopEvent.pointerId);
        document.body.classList.remove('is-dragging');
        window.dispatchEvent(new CustomEvent('m4l-whiteboard-layout-end'));
        divider.removeEventListener("pointermove", move);
        divider.removeEventListener("pointerup", stop);
        divider.removeEventListener("pointercancel", stop);
      };

      divider.addEventListener("pointermove", move);
      divider.addEventListener("pointerup", stop);
      divider.addEventListener("pointercancel", stop);
      document.body.classList.add('is-dragging');
      divider.addEventListener('lostpointercapture', stop, {once:true});
    };

    divider.addEventListener("pointerdown", startResize);
    divider.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      window.dispatchEvent(new CustomEvent('m4l-whiteboard-layout-start'));
      const change = event.key === "ArrowLeft" ? 20 : -20;
      state.panelWidth = Math.max(300, Math.min(720, state.panelWidth + change));
      applyPanelWidth(state.panelWidth);
      resizeCanvas(false);
      window.dispatchEvent(new CustomEvent('m4l-whiteboard-layout-end'));
    });
  }

  function applyPanelWidth(width) {
    const workspace = byId("m4l-pdf-teaching-workspace");
    workspace?.style.setProperty("--m4l-teaching-panel-width", `${Math.round(width)}px`);
  }

  function bindKeyboard() {
    document.addEventListener("keydown", event => {
      if (!state.open) return;
      if (event.key === "Escape") {
        if (event.defaultPrevented || document.querySelector('dialog[open]')) return;
        event.preventDefault();
        close();
        return;
      }
      const meta = event.ctrlKey || event.metaKey;
      if (!meta || state.activeTab !== "drawing" || !byId('m4l-teaching-panel').contains(event.target) || event.target.closest('input,textarea,select,[contenteditable]')) return;
      if (event.key.toLowerCase() === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if ((event.key.toLowerCase() === "z" && event.shiftKey) || event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
      }
    });
  }

  function bindResize() {
    window.addEventListener("resize", () => {
      if (!state.open) return;
      if (isCompact()) {
        byId("m4l-teaching-panel-divider").hidden = true;
      } else {
        byId("m4l-teaching-panel-divider").hidden = false;
        applyPanelWidth(state.panelWidth);
      }
      requestAnimationFrame(() => resizeCanvas(false));
    });

    if ("ResizeObserver" in window) {
      state.resizeObserver = new ResizeObserver(() => {
        if (state.open && state.activeTab === "drawing") resizeCanvas(false);
      });
      const wrap = byId("m4l-teaching-canvas")?.parentElement;
      if (wrap) state.resizeObserver.observe(wrap);
    }
  }

  window.M4L_PDF_WHITEBOARD = {
    init,
    toggle,
    open,
    close,
    clearActive,
    undo,
    redo,
    saveDrawing,
    shareDrawing,
    saveNotes,
    hasUnsaved,
    isOpen: () => state.open,
    setTab
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
