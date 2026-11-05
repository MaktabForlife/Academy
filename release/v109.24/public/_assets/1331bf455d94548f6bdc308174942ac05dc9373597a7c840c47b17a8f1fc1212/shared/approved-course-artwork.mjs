// The owner's explicit cover selections override older cached catalogue art.
// Exact public presentation keys only; these labels never grant course access.
const covers=Object.freeze({
 'tawakkul':'/_assets/1331bf455d94548f6bdc308174942ac05dc9373597a7c840c47b17a8f1fc1212/shared/assets/tawakkul-mindset-approved.png',
 'tawakkul-mindset':'/_assets/1331bf455d94548f6bdc308174942ac05dc9373597a7c840c47b17a8f1fc1212/shared/assets/tawakkul-mindset-approved.png',
 'imratun-muminah':'/_assets/1331bf455d94548f6bdc308174942ac05dc9373597a7c840c47b17a8f1fc1212/shared/assets/imratun-muminah-approved.webp',
 'resilience':'/_assets/1331bf455d94548f6bdc308174942ac05dc9373597a7c840c47b17a8f1fc1212/circles/assets/resilience-quran-poster-source.png'
});
export const approvedCourseCover=key=>Object.hasOwn(covers,key)?covers[key]:null;
