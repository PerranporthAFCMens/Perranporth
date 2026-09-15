(() => {
  'use strict';

  // MATCH CENTRE 2 TEST backend only.
  // Paste the MC2 Apps Script /exec URL below after deploying Code_MC2_TEST.gs.
  const APP_URL='https://script.google.com/macros/s/AKfycbzL_wSJz55TecCVdiEuG6ABQn3z5PIdqkA5Osoi-FHIct_AuECTGFJzUDx3nJWYcbaK/exec';
  let seq=0;

  window.pmdCall=(action,...args)=>new Promise((resolve,reject)=>{
    if(!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(APP_URL)){
      reject(new Error('MC2 test backend is not connected yet.'));
      return;
    }

    const callback='__pmd_mc2_jsonp_'+Date.now()+'_'+(++seq);
    const payload=JSON.stringify({action,args});
    const script=document.createElement('script');

    const slowActions=new Set([
      'getMatchSummary','getFullMatchSummary','getInitData',
      'getSeasonStats','getSubsTrackerData'
    ]);
    const timeoutMs=slowActions.has(action)?60000:30000;
    const timer=setTimeout(()=>finish(new Error('MC2 data connection timed out. Please try again.')),timeoutMs);

    function cleanup(){
      clearTimeout(timer);
      try{delete window[callback]}catch(e){window[callback]=undefined}
      if(script.parentNode)script.parentNode.removeChild(script);
    }
    function finish(err,result){
      cleanup();
      if(err)reject(err);else resolve(result);
    }

    window[callback]=response=>{
      if(!response||response.ok!==true){
        finish(new Error(response&&response.error?response.error:'MC2 request failed'));
        return;
      }
      finish(null,response.result);
    };

    script.async=true;
    script.onerror=()=>finish(new Error('Could not reach the MC2 test backend.'));
    script.src=APP_URL+'?api=rpc&callback='+encodeURIComponent(callback)+'&payload='+encodeURIComponent(payload)+'&_='+Date.now();
    document.head.appendChild(script);
  });
})();
