// The owner's explicit cover selections override older cached catalogue art.
// Exact public presentation keys only; these labels never grant course access.
const covers=Object.freeze({
 'tawakkul':'/_assets/f08c069008dc046ddf28ed1d251fc598d35cb13cd30344c2c9e1d4b0eacb1439/shared/assets/tawakkul-mindset-approved.png',
 'tawakkul-mindset':'/_assets/f08c069008dc046ddf28ed1d251fc598d35cb13cd30344c2c9e1d4b0eacb1439/shared/assets/tawakkul-mindset-approved.png',
 'imratun-muminah':'/_assets/f08c069008dc046ddf28ed1d251fc598d35cb13cd30344c2c9e1d4b0eacb1439/shared/assets/imratun-muminah-approved.webp',
 'resilience':'/_assets/f08c069008dc046ddf28ed1d251fc598d35cb13cd30344c2c9e1d4b0eacb1439/circles/assets/resilience-quran-poster-source.png'
});
export const approvedCourseCover=key=>Object.hasOwn(covers,key)?covers[key]:null;
