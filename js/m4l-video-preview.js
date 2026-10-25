(() => {
 'use strict';
 const form=document.getElementById('video-form'),address=document.getElementById('video-address'),area=document.getElementById('player-area'),status=document.getElementById('status');
 let current=0;
 function message(text,error=false){status.textContent=text;status.setAttribute('role',error?'alert':'status');}
 form.addEventListener('submit',event=>{
  event.preventDefault();let url;
  try{url=new URL(address.value.trim());if(url.protocol!=='https:'||url.username||url.password)throw Error();}catch{message('Enter a secure video address.',true);return;}
  const host=url.hostname.toLowerCase().replace(/^www\./,''),youtube=host==='youtu.be'?url.pathname.slice(1):['youtube.com','m.youtube.com'].includes(host)?url.searchParams.get('v')||url.pathname.match(/^\/(?:embed|shorts)\/([^/]+)$/)?.[1]:null;
  if(youtube&&!/^[A-Za-z0-9_-]{11}$/.test(youtube)){message('Enter a valid YouTube video address.',true);return;}
  if(!youtube&&!(host==='zoom.us'||host.endsWith('.zoom.us'))){message('Use a Zoom recording or YouTube video address.',true);return;}
  if(!youtube&&!/\.mp4$/i.test(url.pathname)){message('This is a Zoom page address. Use the recording’s direct MP4 address for this playback trial.',true);return;}
  current++;const epoch=current;area.querySelector('video')?.pause();area.replaceChildren();area.hidden=false;
  if(youtube){const frame=document.createElement('iframe');frame.className='lm-player';frame.src='https://www.youtube-nocookie.com/embed/'+youtube+'?rel=0';frame.title='YouTube recording';frame.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';frame.allowFullscreen=true;frame.referrerPolicy='strict-origin-when-cross-origin';area.append(frame);message('YouTube player opened.');return;}
  const video=document.createElement('video');video.className='lm-player';video.controls=true;video.playsInline=true;video.preload='metadata';video.setAttribute('aria-label','Zoom recording');
  const tools=document.createElement('div');tools.className='lm-player-tools';const label=document.createElement('label');label.textContent='Playback speed ';const speed=document.createElement('select');speed.setAttribute('aria-label','Playback speed');
  for(const value of [.5,.75,1,1.25,1.5,1.75,2]){const option=document.createElement('option');option.value=value;option.textContent=value+'×';option.selected=value===1;speed.append(option);}speed.addEventListener('change',()=>{video.playbackRate=Number(speed.value);});label.append(speed);tools.append(label);
  video.addEventListener('loadedmetadata',()=>{if(epoch===current)message('Zoom recording ready · '+Math.floor(video.duration/60)+':'+String(Math.floor(video.duration%60)).padStart(2,'0')+' · '+video.videoWidth+' × '+video.videoHeight);});
  video.addEventListener('playing',()=>{if(epoch===current)message('Playing directly from Zoom.');});
  video.addEventListener('seeked',()=>{if(epoch===current)message('Jumped to '+Math.floor(video.currentTime/60)+':'+String(Math.floor(video.currentTime%60)).padStart(2,'0')+' · loaded directly from Zoom.');});
  video.addEventListener('error',()=>{if(epoch===current){status.dataset.mediaError=String(video.error?.code||'unknown');status.dataset.mediaMessage=video.error?.message||'';message('Zoom could not load this recording here. Its address may have expired or require Zoom access.',true);}});
  area.append(video,tools);message('Loading recording from Zoom…');video.src=url.href;
 });
 window.addEventListener('pagehide',()=>area.querySelector('video')?.pause());
})();
