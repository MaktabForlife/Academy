// The owner's explicit cover selections override older cached catalogue art.
// Exact public presentation keys only; these labels never grant course access.
const covers=Object.freeze({
 'tawakkul':'/_assets/eabce9dc15bf85beca561d6ca22afa6bb756b619845246fd3284af64d7805c38/shared/assets/tawakkul-mindset-approved.png',
 'tawakkul-mindset':'/_assets/eabce9dc15bf85beca561d6ca22afa6bb756b619845246fd3284af64d7805c38/shared/assets/tawakkul-mindset-approved.png',
 'imratun-muminah':'/_assets/eabce9dc15bf85beca561d6ca22afa6bb756b619845246fd3284af64d7805c38/shared/assets/imratun-muminah-approved.webp',
 'resilience':'/_assets/eabce9dc15bf85beca561d6ca22afa6bb756b619845246fd3284af64d7805c38/circles/assets/resilience-quran-poster-source.png'
});
export const approvedCourseCover=key=>Object.hasOwn(covers,key)?covers[key]:null;
