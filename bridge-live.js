(() => {
  'use strict';

  // Live Match Centre / management bridge.
  // Apps Script remains available as the rollback backend.
  const APP_URL='https://script.google.com/macros/s/AKfycbyHHPOgGsImS9Kvr3SdZiKUGp3ZrbnOoJnIPUckm_Y9hH1K9b_j_Kgmw6UhzVMAyQ0q/exec';
  const SB_URL='https://hennzggqaquevqgiucqn.supabase.co/functions/v1/perranporth-matchday';
  const SB_KEY='sb_publishable_3ibkYwM0fFdHgKdGFIN5cQ_BT_WudUW';
  const backendParam=new URLSearchParams(location.search).get('backend');
  const FORCE_APPS=backendParam==='apps';
  const CHANNEL='match_'+Date.now()+'_'+Math.random().toString(36).slice(2);
  let seq=0;
  const pending=new Map();

  const SB_MATCH_ACTIONS=new Set([
    'getInitData','getMatches','getPublicSpectatorData','createMatch','createTrialMatch','deleteTrialMatch',
    'getSquad','saveSquad','addPlayerToLiveSquad',
    'getLineup','saveLineup','setStartingLineup',
    'getMatchSummary','getFullMatchSummary',
    'startMatch','finishMatch','reopenMatch',
    'getMatchClock','toggleMatchClock','resetMatchClock','enterHalfTime','startSecondHalf',
    'logEvent','updateEvent','deleteEvent','deleteLastEvent',
    'getSeasonStats','getPlayerMinutesData',
    'getAllPlayersForAdmin','addPlayer','updatePlayer',
    'getVotingAdminData','getVotingSnapshot','openVoting','closeVoting',
    'getSubsTrackerData','setSubsStatus',
    'getPlayerPinAdminData','resetPlayerPin',
    'getGhostPlayerPortalDataDirect',
    'createAdminSession','verifyPin','logoutAdminSession',
    'getManagementAdminData','saveManagementUser','setManagementPin',
    'revokeManagementUser','revokeManagementSessions','getManagementAuditLog',
    'recordManagementPageOpen'
  ]);
  const SB_WRITE_ACTIONS=new Set([
    'createMatch','createTrialMatch','deleteTrialMatch',
    'saveSquad','addPlayerToLiveSquad','saveLineup','setStartingLineup',
    'startMatch','finishMatch','reopenMatch',
    'toggleMatchClock','resetMatchClock','enterHalfTime','startSecondHalf',
    'logEvent','updateEvent','deleteEvent','deleteLastEvent',
    'addPlayer','updatePlayer',
    'openVoting','closeVoting','setSubsStatus','resetPlayerPin',
    'saveManagementUser','setManagementPin','revokeManagementUser','revokeManagementSessions',
    'recordManagementPageOpen'
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
    if(!token.startsWith('PMD2.'))return {a:token,s:'',packed:false};
    try{
      const x=JSON.parse(atob(token.slice(5)));
      return {a:x.a||'',s:x.s||'',packed:true};
    }catch(e){
      return {a:token,s:'',packed:false};
    }
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
    else if(t.packed)copy[0]='';
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
    if(FORCE_APPS)return rawCall_('createAdminSession',[pin]);
    const sb=await sbCall_('createAdminSession',[pin],12000);
    return {token:packToken_('',sb.token),expiresAt:Number(sb.expiresAt||Date.now()+86400000)};
  }

  async function callProtected_(action,args){
    if(FORCE_APPS)return rawCall_(action,appsArgs_(args));
    if(!SB_MATCH_ACTIONS.has(action))throw new Error('Unsupported Supabase action: '+action);
    const isWrite=SB_WRITE_ACTIONS.has(action);
    return sbCall_(action,sbArgs_(args),isWrite?20000:15000);
  }

  window.pmdCall=async (action,...args)=>{
    if(action==='createAdminSession'){
      return createDualSession_(args[0]);
    }

    if(action==='verifyPin'){
      const supplied=String(args[0]||'').trim();
      if(FORCE_APPS)return !!(await rawCall_('verifyPin',[supplied]));
      const t=unpackToken_(supplied);
      const token=t.s||(t.packed?'':supplied);
      if(!token)return false;
      try{return !!(await sbCall_('verifyPin',[token],10000))}catch(e){return false}
    }

    if(action==='logoutAdminSession'){
      if(FORCE_APPS){
        const t=unpackToken_(args[0]);
        return rawCall_('logoutAdminSession',[t.a||args[0]]);
      }
      const t=unpackToken_(args[0]);
      const token=t.s||(t.packed?'':String(args[0]||''));
      if(token)await sbCall_('logoutAdminSession',[token],8000).catch(()=>true);
      return true;
    }

    if(action==='validateManagementResetToken'||action==='completeManagementPinReset'){
      return FORCE_APPS?rawCall_(action,args):sbCall_(action,args,12000);
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

  window.pmdBackendMode=()=>FORCE_APPS?'apps-script':'supabase';
})();