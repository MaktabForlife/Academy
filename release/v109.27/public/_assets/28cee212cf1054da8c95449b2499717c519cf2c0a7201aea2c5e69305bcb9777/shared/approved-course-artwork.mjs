// The owner's explicit cover selections override older cached catalogue art.
// Exact public presentation keys only; these labels never grant course access.
const covers=Object.freeze({
 'tawakkul':'/_assets/28cee212cf1054da8c95449b2499717c519cf2c0a7201aea2c5e69305bcb9777/shared/assets/tawakkul-mindset-approved.png',
 'tawakkul-mindset':'/_assets/28cee212cf1054da8c95449b2499717c519cf2c0a7201aea2c5e69305bcb9777/shared/assets/tawakkul-mindset-approved.png',
 'imratun-muminah':'/_assets/28cee212cf1054da8c95449b2499717c519cf2c0a7201aea2c5e69305bcb9777/shared/assets/imratun-muminah-approved.webp',
 'resilience':'/_assets/28cee212cf1054da8c95449b2499717c519cf2c0a7201aea2c5e69305bcb9777/circles/assets/resilience-quran-poster-source.png'
});
export const approvedCourseCover=key=>Object.hasOwn(covers,key)?covers[key]:null;
