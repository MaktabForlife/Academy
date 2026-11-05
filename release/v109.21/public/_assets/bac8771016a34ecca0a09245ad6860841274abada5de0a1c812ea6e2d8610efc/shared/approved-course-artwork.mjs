// The owner's explicit cover selections override older cached catalogue art.
// Exact public presentation keys only; these labels never grant course access.
const covers=Object.freeze({
 'tawakkul':'/_assets/bac8771016a34ecca0a09245ad6860841274abada5de0a1c812ea6e2d8610efc/shared/assets/tawakkul-mindset-approved.png',
 'tawakkul-mindset':'/_assets/bac8771016a34ecca0a09245ad6860841274abada5de0a1c812ea6e2d8610efc/shared/assets/tawakkul-mindset-approved.png',
 'imratun-muminah':'/_assets/bac8771016a34ecca0a09245ad6860841274abada5de0a1c812ea6e2d8610efc/shared/assets/imratun-muminah-approved.webp',
 'resilience':'/_assets/bac8771016a34ecca0a09245ad6860841274abada5de0a1c812ea6e2d8610efc/circles/assets/resilience-quran-poster-source.png'
});
export const approvedCourseCover=key=>Object.hasOwn(covers,key)?covers[key]:null;
