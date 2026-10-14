export const PDF_TOOL_DEFAULTS=Object.freeze({textColor:'#000000',textSize:10,inkColor:'#000000',inkThickness:1,inkOpacity:1,highlightColor:'#fff066',highlightThickness:12});
export const PDF_TOOL_LIMITS=Object.freeze({textSize:[5,100,1],inkThickness:[1,20,1],inkOpacity:[0.05,1,0.05],highlightThickness:[8,24,1]});
export function normalizePdfTools(input,{session=false}={}){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!Object.hasOwn(PDF_TOOL_DEFAULTS,key)))throw Error('Invalid PDF tool settings.');
 const result={};
 for(const key of Object.keys(PDF_TOOL_DEFAULTS)){
  const value=input[key];
  if(key.endsWith('Color')){if(typeof value!=='string'||!/^#[0-9a-f]{6}$/i.test(value))throw Error('Choose a valid '+key.replace('Color','')+' colour.');result[key]=value.toLowerCase();}
  else{const [min,max,step]=PDF_TOOL_LIMITS[key];if(typeof value!=='number'||!Number.isFinite(value)||value<(session&&key==='inkOpacity'?0:min)||value>max||(!session&&Math.abs(value/step-Math.round(value/step))>1e-7))throw Error('Choose '+key+' between '+min+' and '+max+'.');result[key]=value;}
 }
 return result;
}
