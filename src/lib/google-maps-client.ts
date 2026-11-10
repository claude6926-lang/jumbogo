'use client';
let loading:Promise<void>|undefined;
export function loadGoogleMaps(){
 if(loading)return loading;
 loading=(async()=>{
 const response=await fetch('/api/maps/config',{cache:'no-store'});if(!response.ok)throw new Error('MAP_LOAD_FAILED');
 const config=await response.json();if(!config.configured||!config.browserKey)throw new Error('MAP_PROVIDER_NOT_CONFIGURED');
 if(window.google?.maps?.Map){if(!window.google.maps.places?.AutocompleteSuggestion)await window.google.maps.importLibrary('places');return;}
 await new Promise<void>((resolve,reject)=>{
 const script=document.createElement('script');const callback='jumboMapsReady',globals=window as unknown as Record<string,unknown>;
 const timer=setTimeout(()=>{script.remove();reject(new Error('MAP_LOAD_FAILED'));},15000);
 globals[callback]=()=>{clearTimeout(timer);resolve();};
 globals.gm_authFailure=()=>{clearTimeout(timer);reject(new Error('MAP_LOAD_FAILED'));window.dispatchEvent(new Event('jumbo-map-auth-error'));};
 script.src='https://maps.googleapis.com/maps/api/js?'+new URLSearchParams({key:config.browserKey,v:'weekly',loading:'async',libraries:'marker,places',language:'th',region:'TH',callback});
 script.async=true;script.onerror=()=>{clearTimeout(timer);script.remove();reject(new Error('MAP_LOAD_FAILED'));};document.head.appendChild(script);
 });
 })().catch(e=>{loading=undefined;throw e;});return loading;
}
