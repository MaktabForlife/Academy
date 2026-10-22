export const DEFAULT_FAVOURITES=Object.freeze(['#292336','#be273d','#235dad','#15734c']);
export const FAVOURITES_KEY='academy_pdf_compare_favourites_v1';
export function favouriteColours(value){return Array.isArray(value)&&value.length===4&&value.every(colour=>typeof colour==='string'&&/^#[\da-f]{6}$/i.test(colour))?value.map(colour=>colour.toLowerCase()):[...DEFAULT_FAVOURITES];}
export function readFavouriteColours(storage){try{return favouriteColours(JSON.parse(storage.getItem(FAVOURITES_KEY)));}catch{return [...DEFAULT_FAVOURITES];}}
export function saveFavouriteColours(storage,colours){try{storage.setItem(FAVOURITES_KEY,JSON.stringify(favouriteColours(colours)));return true;}catch{return false;}}
