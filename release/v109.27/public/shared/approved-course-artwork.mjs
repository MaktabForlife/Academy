// The owner's explicit cover selections override older cached catalogue art.
// Exact public presentation keys only; these labels never grant course access.
const covers=Object.freeze({
 'tawakkul':'/_assets/1b868c5997d1cb861528bfd1e4f3b71afa0804340f634ef9eccb85e80de1e074/shared/assets/tawakkul-mindset-approved.png',
 'tawakkul-mindset':'/_assets/1b868c5997d1cb861528bfd1e4f3b71afa0804340f634ef9eccb85e80de1e074/shared/assets/tawakkul-mindset-approved.png',
 'imratun-muminah':'/_assets/1b868c5997d1cb861528bfd1e4f3b71afa0804340f634ef9eccb85e80de1e074/shared/assets/imratun-muminah-approved.webp',
 'resilience':'/_assets/1b868c5997d1cb861528bfd1e4f3b71afa0804340f634ef9eccb85e80de1e074/circles/assets/resilience-quran-poster-source.png'
});
export const approvedCourseCover=key=>Object.hasOwn(covers,key)?covers[key]:null;
