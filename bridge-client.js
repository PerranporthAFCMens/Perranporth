(() => {
  'use strict';
  const APP_URL='https://script.google.com/macros/s/AKfycbyHHPOgGsImS9Kvr3SdZiKUGp3ZrbnOoJnIPUckm_Y9hH1K9b_j_Kgmw6UhzVMAyQ0q/exec?page=bridge';
  let ready=false,seq=0;
  const pending=new Map(),queue=[];

  function frame(){return document.getElementById('pmdDataBridge')}
  function ensureFrame(){
    if(frame()) return;
    const f=document.createElement('iframe');
    f.id='pmdDataBridge'; f.title='Data bridge'; f.src=APP_URL;
    f.setAttribute('aria-hidden','true');
    f.style.cssText='position:absolute;width:1px;height:1px;left:-9999px;border:0;opacity:0';
    document.body.appendChild(f);
  }
  function flush(){
    if(!ready||!frame()?.contentWindow)return;
    while(queue.length) frame().contentWindow.postMessage(queue.shift(),'*');
  }
  window.addEventListener('message',e=>{
    const m=e.data||{};
    if(m.type==='pmd-bridge-ready'){ready=true;flush();return}
    if(m.type!=='pmd-bridge-response'||!m.id)return;
    const p=pending.get(m.id); if(!p)return;
    pending.delete(m.id); clearTimeout(p.timer);
    m.ok?p.resolve(m.result):p.reject(new Error(m.error||'Request failed'));
  });
  window.pmdCall=(action,...args)=>new Promise((resolve,reject)=>{
    ensureFrame();
    const id='req_'+Date.now()+'_'+(++seq);
    const req={type:'pmd-bridge-request',id,action,args};
    const timer=setTimeout(()=>{pending.delete(id);reject(new Error('The data connection timed out. Please refresh and try again.'))},25000);
    pending.set(id,{resolve,reject,timer});
    if(ready&&frame()?.contentWindow) frame().contentWindow.postMessage(req,'*'); else queue.push(req);
  });
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ensureFrame);else ensureFrame();
})();