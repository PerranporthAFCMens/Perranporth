(() => {
  'use strict';

  // Load the shared mobile button-feedback layer on every GitHub app page
  // that already uses this bridge.
  try {
    if (!window.__PMD_BUTTON_FEEDBACK_LOADING__) {
      window.__PMD_BUTTON_FEEDBACK_LOADING__ = true;
      const feedbackScript = document.createElement('script');
      const base = document.currentScript && document.currentScript.src
        ? document.currentScript.src
        : window.location.href;
      feedbackScript.src = new URL('button-feedback.js', base).href;
      feedbackScript.defer = true;
      feedbackScript.dataset.pmdButtonFeedback = '1';
      document.head.appendChild(feedbackScript);
    }
  } catch (e) {}

  // Apps Script ContentService + JSONP. This avoids CORS and avoids embedding
  // the Google web-app UI in an iframe, which Safari can block/interfere with.
  const APP_URL='https://script.google.com/macros/s/AKfycbyHHPOgGsImS9Kvr3SdZiKUGp3ZrbnOoJnIPUckm_Y9hH1K9b_j_Kgmw6UhzVMAyQ0q/exec';
  let seq=0;

  window.pmdCall=(action,...args)=>new Promise((resolve,reject)=>{
    const callback='__pmd_jsonp_'+Date.now()+'_'+(++seq);
    const payload=JSON.stringify({action,args});
    const script=document.createElement('script');
    const timer=setTimeout(()=>finish(new Error('The data connection timed out. Please try again.')),25000);

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
        finish(new Error(response&&response.error?response.error:'Request failed'));
        return;
      }
      finish(null,response.result);
    };

    script.async=true;
    script.onerror=()=>finish(new Error('Could not reach the Perranporth data service.'));
    script.src=APP_URL+'?api=rpc&callback='+encodeURIComponent(callback)+'&payload='+encodeURIComponent(payload)+'&_='+Date.now();
    document.head.appendChild(script);
  });
})();
