// The owner's explicit cover selections override older cached catalogue art.
// Exact public presentation keys only; these labels never grant course access.
const covers=Object.freeze({
 'tawakkul':'/_assets/624ab2482fc5563cdd66fbd36d11fe0e1d618c71aff0f938819737da925d3caa/shared/assets/tawakkul-mindset-approved.png',
 'tawakkul-mindset':'/_assets/624ab2482fc5563cdd66fbd36d11fe0e1d618c71aff0f938819737da925d3caa/shared/assets/tawakkul-mindset-approved.png',
 'imratun-muminah':'/_assets/624ab2482fc5563cdd66fbd36d11fe0e1d618c71aff0f938819737da925d3caa/shared/assets/imratun-muminah-approved.webp',
 'resilience':'/_assets/624ab2482fc5563cdd66fbd36d11fe0e1d618c71aff0f938819737da925d3caa/circles/assets/resilience-quran-poster-source.png'
});
export const approvedCourseCover=key=>Object.hasOwn(covers,key)?covers[key]:null;
