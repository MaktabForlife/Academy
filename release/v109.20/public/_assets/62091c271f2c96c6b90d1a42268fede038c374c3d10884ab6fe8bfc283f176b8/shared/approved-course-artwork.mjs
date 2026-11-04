// The owner's explicit cover selections override older cached catalogue art.
// Exact public presentation keys only; these labels never grant course access.
const covers=Object.freeze({
 'tawakkul':'/_assets/62091c271f2c96c6b90d1a42268fede038c374c3d10884ab6fe8bfc283f176b8/shared/assets/tawakkul-mindset-approved.png',
 'tawakkul-mindset':'/_assets/62091c271f2c96c6b90d1a42268fede038c374c3d10884ab6fe8bfc283f176b8/shared/assets/tawakkul-mindset-approved.png',
 'imratun-muminah':'/_assets/62091c271f2c96c6b90d1a42268fede038c374c3d10884ab6fe8bfc283f176b8/shared/assets/imratun-muminah-approved.webp',
 'resilience':'/_assets/62091c271f2c96c6b90d1a42268fede038c374c3d10884ab6fe8bfc283f176b8/circles/assets/resilience-quran-poster-source.png'
});
export const approvedCourseCover=key=>Object.hasOwn(covers,key)?covers[key]:null;
