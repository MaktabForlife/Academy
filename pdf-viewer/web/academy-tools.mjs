import {PDFViewerApplication as app} from './viewer.mjs?v=106.49';
import {AnnotationEditorParamsType as types} from '../build/pdf.mjs?v=106.49';
import {PDF_TOOL_DEFAULTS,normalizePdfTools} from '../../js/m4l-pdf-tools-model.mjs?v=106.49';
if(new URLSearchParams(location.search).get('academy')==='1'){
 document.body.classList.add('academy-pdf');
 const pane=Number(new URLSearchParams(location.search).get('pane')||0);let parentReader=null;try{if(parent!==window&&parent.location.origin===location.origin)parentReader=parent.M4L_PDF_READER;}catch{}
 const settings=normalizePdfTools(parentReader?.settings(pane)||PDF_TOOL_DEFAULTS,{session:true}),mapping={textSize:types.FREETEXT_SIZE,textColor:types.FREETEXT_COLOR,inkColor:types.INK_COLOR,inkThickness:types.INK_THICKNESS,inkOpacity:types.INK_OPACITY,highlightColor:types.HIGHLIGHT_COLOR,highlightThickness:types.HIGHLIGHT_THICKNESS};
 await app.initializedPromise;
 const initialised=new WeakSet();let manager=null,applying=false;
 app.eventBus.on('annotationeditoruimanager',event=>{manager=event.uiManager;manager.academyStickyDefaults=true;});
 app.eventBus.on('annotationeditorlayerrendered',()=>{if(!manager||initialised.has(manager))return;initialised.add(manager);applying=true;for(const [key,type] of Object.entries(mapping))manager.updateParams(type,settings[key]);app.eventBus.dispatch('annotationeditorparamschanged',{source:manager,details:Object.entries(mapping).map(([key,type])=>[type,settings[key]])});applying=false;});
 app.eventBus.on('switchannotationeditorparams',event=>{if(applying)return;const entry=Object.entries(mapping).find(([,type])=>type===event.type);if(entry){settings[entry[0]]=event.value;parentReader?.remember(pane,{[entry[0]]:event.value});}else if(event.type===types.INK_COLOR_AND_OPACITY){settings.inkColor=event.value.color;settings.inkOpacity=event.value.opacity;parentReader?.remember(pane,{inkColor:settings.inkColor,inkOpacity:settings.inkOpacity});}});
}
