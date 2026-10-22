import academy from './academy-runtime.js';

// This Worker serves the feature branch and its immutable Pages deployments.
// The Development Worker retains its own code, origins and scheduled work.
export const featurePreviewOrigin=origin=>/^https:\/\/(?:feature-admin|[a-f0-9]{8})\.academy-maktab4life\.pages\.dev$/.test(origin||'');
export default {
  fetch(request,env,ctx){
    const origin=request.headers.get('Origin');
    return academy.fetch(request,{...env,ALLOWED_ORIGINS:featurePreviewOrigin(origin)?origin:''},ctx);
  }
};
