// The owner's explicit cover selections override older cached catalogue art.
// Exact public presentation keys only; these labels never grant course access.
const covers=Object.freeze({
 'tawakkul':'/_assets/caa3d51451deeb3c63878a9425dae68e642a0db2b5579439e9ba26219ca3c91e/shared/assets/tawakkul-mindset-approved.png',
 'tawakkul-mindset':'/_assets/caa3d51451deeb3c63878a9425dae68e642a0db2b5579439e9ba26219ca3c91e/shared/assets/tawakkul-mindset-approved.png',
 'imratun-muminah':'/_assets/caa3d51451deeb3c63878a9425dae68e642a0db2b5579439e9ba26219ca3c91e/shared/assets/imratun-muminah-approved.webp',
 'resilience':'/_assets/caa3d51451deeb3c63878a9425dae68e642a0db2b5579439e9ba26219ca3c91e/circles/assets/resilience-quran-poster-source.png'
});
export const approvedCourseCover=key=>Object.hasOwn(covers,key)?covers[key]:null;
