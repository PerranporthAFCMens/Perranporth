(() => {
  'use strict';

  const APP_URL='https://script.google.com/macros/s/AKfycbyHHPOgGsImS9Kvr3SdZiKUGp3ZrbnOoJnIPUckm_Y9hH1K9b_j_Kgmw6UhzVMAyQ0q/exec';
  const SB_URL='https://hennzggqaquevqgiucqn.supabase.co/functions/v1/perranporth-matchday';
  const SB_KEY='sb_publishable_3ibkYwM0fFdHgKdGFIN5cQ_BT_WudUW';
  const FORCE_APPS=new URLSearchParams(location.search).get('backend')==='apps';
  let seq=0;

  function packAdmin_(appsToken,sbToken){
    try{return 'PMD2.'+btoa(JSON.stringify({a:appsToken||'',s:sbToken||''}))}
    catch(e){return sbToken||appsToken||''}
  }
  function unpackAdmin_(token){
    token=String(token||'');
    if(!token.startsWith('PMD2.'))return {a:'',s:token,packed:false};
    try{
      const x=JSON.parse(atob(token.slice(5)));
      return {a:x.a||'',s:x.s||'',packed:true};
    }catch(e){return {a:'',s:token,packed:false}}
  }

  async function sbCall_(action,args,timeoutMs){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs||20000);
    try{
      const res=await fetch(SB_URL,{
        method:'POST',
        headers:{'Content-Type':'application/json','apikey':SB_KEY},
        body:JSON.stringify({action,args}),
        signal:controller.signal,
        cache:'no-store'
      });
      let body={};
      try{body=await res.json()}catch(e){}
      if(!res.ok||body.ok!==true)throw new Error(body.error||('Supabase request failed ('+res.status+')'));
      return body.result;
    }finally{clearTimeout(timer)}
  }

  function appsCall_(action,args){
    return new Promise((resolve,reject)=>{
      const callback='__pmd_jsonp_'+Date.now()+'_'+(++seq);
      const payload=JSON.stringify({action,args});
      const script=document.createElement('script');
      const slowActions=new Set(['getPlayerPortalData','getGhostPlayerPortalData','getGhostPlayerPortalDataDirect']);
      const timer=setTimeout(()=>finish(new Error('The data connection timed out. Please try again.')),slowActions.has(action)?60000:30000);

      function cleanup(){
        clearTimeout(timer);
        try{delete window[callback]}catch(e){window[callback]=undefined}
        if(script.parentNode)script.parentNode.removeChild(script);
      }
      function finish(err,result){cleanup();if(err)reject(err);else resolve(result)}
      window[callback]=response=>{
        if(!response||response.ok!==true){finish(new Error(response&&response.error?response.error:'Request failed'));return}
        finish(null,response.result);
      };
      script.async=true;
      script.onerror=()=>finish(new Error('Could not reach the Perranporth data service.'));
      script.src=APP_URL+'?api=rpc&callback='+encodeURIComponent(callback)+'&payload='+encodeURIComponent(payload)+'&_='+Date.now();
      document.head.appendChild(script);
    });
  }

  function adminArgs_(args){
    if(!args.length)return args;
    const t=unpackAdmin_(args[0]);
    const copy=args.slice();
    copy[0]=t.s||args[0];
    return copy;
  }

  window.pmdCall=async (action,...args)=>{
    if(FORCE_APPS)return appsCall_(action,args);

    if(action==='createAdminSession'){
      const sb=await sbCall_('createAdminSession',[args[0]],12000);
      return {token:packAdmin_('',sb&&sb.token),expiresAt:Number(sb&&sb.expiresAt||Date.now()+86400000)};
    }

    if(action==='verifyPin'){
      const t=unpackAdmin_(args[0]);
      if(t.packed){
        try{return !!(await sbCall_('verifyPin',[t.s],10000))}catch(e){return false}
      }
      return !!(await sbCall_('verifyPin',[t.s||args[0]],10000));
    }

    if(action==='logoutAdminSession'){
      const t=unpackAdmin_(args[0]);
      const token=t.s||(t.packed?'':String(args[0]||''));
      if(token)await sbCall_('logoutAdminSession',[token],8000).catch(()=>true);
      return true;
    }

    if(action==='getGhostPlayerPortalDataDirect'||action==='submitGhostTestVote'){
      return sbCall_(action,adminArgs_(args),30000);
    }

    return sbCall_(action,args,action==='getPlayerPortalData'?30000:20000);
  };

  window.pmdClientBackendMode=()=>FORCE_APPS?'apps-script':'supabase';
})();