const current = location.pathname.includes('/Astra/') ? 'Astra' : 'Sol';
const brand = document.querySelector('.brand');
brand.innerHTML = `<span class="brand-mark">✿</span><nav aria-label="마을 버전"><a href="../Sol/" ${current==='Sol'?'aria-current="page"':''}>Sol</a><span> / </span><a href="../Astra/" ${current==='Astra'?'aria-current="page"':''}>Astra</a><small>작은 마을의 오후</small></nav>`;
document.title = `${current} · 작은 마을의 오후`;
export function restore(camera, controls) {
  try { const state=JSON.parse(sessionStorage.getItem('village-view')); if(!state)return null;
    if(state.position?.length===3 && state.position.every(Number.isFinite)) camera.position.fromArray(state.position);
    if(state.target?.length===3 && state.target.every(Number.isFinite)) controls.target.fromArray(state.target);
    if(Number.isFinite(state.zoom)) camera.zoom=Math.max(.72,Math.min(2.25,state.zoom));
    controls.autoRotate=!!state.rotate; camera.updateProjectionMatrix(); controls.update(); return state.mode;
  } catch { return null; }
}
export function persist(camera,controls,mode) {
  for(const link of brand.querySelectorAll('a')) link.addEventListener('click',()=>{
    try {sessionStorage.setItem('village-view',JSON.stringify({position:camera.position.toArray(),target:controls.target.toArray(),zoom:camera.zoom,rotate:controls.autoRotate,mode:mode()}));}catch{}
  });
}
