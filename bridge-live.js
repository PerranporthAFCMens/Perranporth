(() => {
  'use strict';

  // Live Match Centre / management bridge.
  // Apps Script remains available as the rollback backend.
  const APP_URL='https://script.google.com/macros/s/AKfycbyHHPOgGsImS9Kvr3SdZiKUGp3ZrbnOoJnIPUckm_Y9hH1K9b_j_Kgmw6UhzVMAyQ0q/exec';
  const SB_URL='https://hennzggqaquevqgiucqn.supabase.co/functions/v1/perranporth-matchday';
  const SB_KEY='sb_publishable_3ibkYwM0fFdHgKdGFIN5cQ_BT_WudUW';
  const FORCE_APPS=new URLSearchParams(location.search).get('backend')==='apps';
  const CHANNEL='match_'+Date.now()+'_'+Math.random().toString(36).slice(2);
  let seq=0;
  const pending=new Map();

  const SB_MATCH_ACTIONS=new Set([
    'getInitData','getMatches','createMatch','createTrialMatch','deleteTrialMatch',
    'getSquad','saveSquad','addPlayerToLiveSquad',
    'getLineup','saveLineup','setStartingLineup',
    'getMatchSummary','getFullMatchSummary',
    'startMatch','finishMatch','reopenMatch',
    'getMatchClock','toggleMatchClock','resetMatchClock','enterHalfTime','startSecondHalf',
    'logEvent','updateEvent','deleteEvent','deleteLastEvent',
    'getSeasonStats','getPlayerMinutesData',
    'getAllPlayersForAdmin','addPlayer','updatePlayer'
  ]);

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

  function rawCall_(action,args){
    return new Promise((resolve,reject)=>{
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
        'getSeasonStats','getPlayerMinutesData','getSubsTrackerData',
        'getVotingAdminData','getVotingSnapshot'
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
  }

  function packToken_(appsToken,sbToken){
    try{return 'PMD2.'+btoa(JSON.stringify({a:appsToken||'',s:sbToken||''}))}catch(e){return appsToken||''}
  }
  function unpackToken_(token){
    token=String(token||'');
    if(!token.startsWith('PMD2.'))return {a:token,s:''};
    try{return JSON.parse(atob(token.slice(5)))}catch(e){return {a:token,s:''}}
  }
  function appsArgs_(args){
    if(!args.length)return args;
    const copy=args.slice();
    const t=unpackToken_(copy[0]);
    if(t.a)copy[0]=t.a;
    return copy;
  }
  function sbArgs_(args){
    if(!args.length)return args;
    const copy=args.slice();
    const t=unpackToken_(copy[0]);
    if(t.s)copy[0]=t.s;
    return copy;
  }

  async function sbCall_(action,args,timeoutMs=15000){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      const res=await fetch(SB_URL,{
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'apikey':SB_KEY
        },
        body:JSON.stringify({action,args}),
        signal:controller.signal,
        cache:'no-store'
      });
      let body={};
      try{body=await res.json()}catch(e){}
      if(!res.ok||body.ok!==true)throw new Error(body.error||('Supabase request failed ('+res.status+')'));
      return body.result;
    }finally{
      clearTimeout(timer);
    }
  }

  async function createDualSession_(pin){
    const apps=await rawCall_('createAdminSession',[pin]);
    if(FORCE_APPS)return apps;
    try{
      const sb=await sbCall_('createAdminSession',[pin],12000);
      return {
        token:packToken_(apps.token,sb.token),
        expiresAt:Math.min(Number(apps.expiresAt||Infinity),Number(sb.expiresAt||Infinity))
      };
    }catch(err){
      console.warn('Supabase matchday login unavailable; staying on Apps Script.',err);
      return apps;
    }
  }

  async function callProtected_(action,args){
    if(FORCE_APPS)return rawCall_(action,appsArgs_(args));

    const tokens=args.length?unpackToken_(args[0]):{a:'',s:''};
    if(SB_MATCH_ACTIONS.has(action)&&tokens.s){
      // Once a dual session is established, matchday writes are never blindly
      // replayed to Apps Script. That prevents duplicate events after a lost response.
      return sbCall_(action,sbArgs_(args),action.startsWith('get')?15000:20000);
    }
    return rawCall_(action,appsArgs_(args));
  }

  window.pmdCall=async (action,...args)=>{
    if(action==='createAdminSession'){
      return createDualSession_(args[0]);
    }

    if(action==='verifyPin'){
      const t=unpackToken_(args[0]);
      // Apps Script remains the authority for restoring an old/non-dual session.
      // Dual sessions also verify the Supabase half so matchday writes stay safe.
      const appsValid=await rawCall_('verifyPin',[t.a||args[0]]);
      if(!appsValid)return false;
      if(t.s&&!FORCE_APPS){
        try{return !!(await sbCall_('verifyPin',[t.s],10000))}catch(e){return false}
      }
      return true;
    }

    if(action==='logoutAdminSession'){
      const t=unpackToken_(args[0]);
      const jobs=[];
      if(t.a)jobs.push(rawCall_('logoutAdminSession',[t.a]).catch(()=>true));
      if(t.s&&!FORCE_APPS)jobs.push(sbCall_('logoutAdminSession',[t.s],8000).catch(()=>true));
      await Promise.all(jobs);
      return true;
    }

    // Subs Tracker originally used two helper RPC actions that are not part of
    // the live Match Centre whitelist. Compose the same result from approved actions.
    if(action==='openSubsWithPin'){
      const session=await createDualSession_(args[0]);
      const init=await callProtected_('getInitData',[session.token]);
      const subs=await callProtected_('getSubsTrackerData',[session.token]);
      return {session,init,subs};
    }

    if(action==='resumeSubs'){
      const token=args[0];
      const valid=await window.pmdCall('verifyPin',token);
      if(!valid)throw new Error('Your management session has expired.');
      const init=await callProtected_('getInitData',[token]);
      const subs=await callProtected_('getSubsTrackerData',[token]);
      return {init,subs};
    }

    return callProtected_(action,args);
  };

  window.pmdBackendMode=()=>FORCE_APPS?'apps-script':'hybrid-supabase';
})();