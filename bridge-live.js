(() => {
  'use strict';

  // Live Match Centre / management bridge.
  // Uses an Apps Script HtmlService iframe + postMessage instead of ContentService JSONP.
  const APP_URL='https://script.google.com/macros/s/AKfycbyHHPOgGsImS9Kvr3SdZiKUGp3ZrbnOoJnIPUckm_Y9hH1K9b_j_Kgmw6UhzVMAyQ0q/exec';
  const CHANNEL='match_'+Date.now()+'_'+Math.random().toString(36).slice(2);
  let seq=0;
  const pending=new Map();

  function cleanup_(id){
    const p=pending.get(id);
    if(!p)return;
    clearTimeout(p.timer);
    if(p.iframe&&p.iframe.parentNode)p.iframe.parentNode.removeChild(p.iframe);
    pending.delete(id);
  }

  window.addEventListener('message',event=>{
    const msg=event&&event.data;
    if(!msg||msg.__pmd_match_bridge!==true||msg.channel!==CHANNEL||!msg.id)return;
    const p=pending.get(msg.id);
    if(!p)return;
    cleanup_(msg.id);
    if(msg.ok===true)p.resolve(msg.result);
    else p.reject(new Error(msg.error||'Request failed'));
  });

  window.pmdCall=(action,...args)=>new Promise((resolve,reject)=>{
    const id='match_'+Date.now()+'_'+(++seq);
    const payload=JSON.stringify({action,args});
    const iframe=document.createElement('iframe');
    iframe.setAttribute('aria-hidden','true');
    iframe.tabIndex=-1;
    iframe.style.position='fixed';
    iframe.style.width='1px';
    iframe.style.height='1px';
    iframe.style.opacity='0';
    iframe.style.pointerEvents='none';
    iframe.style.border='0';
    iframe.style.left='-9999px';
    iframe.style.top='-9999px';

    const slowActions=new Set([
      'getMatchSummary','getFullMatchSummary','getInitData',
      'getSeasonStats','getPlayerMinutesData','getSubsTrackerData'
    ]);
    const timeoutMs=slowActions.has(action)?60000:30000;
    const timer=setTimeout(()=>{
      cleanup_(id);
      reject(new Error('Data connection timed out. Please try again.'));
    },timeoutMs);

    pending.set(id,{resolve,reject,timer,iframe});
    iframe.src=APP_URL+'?page=matchrpc&rid='+encodeURIComponent(id)+'&channel='+encodeURIComponent(CHANNEL)+'&payload='+encodeURIComponent(payload)+'&_='+Date.now();
    document.body.appendChild(iframe);
  });
})();
