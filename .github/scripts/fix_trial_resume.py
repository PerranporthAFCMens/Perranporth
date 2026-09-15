from pathlib import Path

p = Path('match.html')
s = p.read_text()

old = '''async function restoreSession(){
  let raw;try{raw=localStorage.getItem('pmd_session')}catch(e){return}
  if(!raw)return;
  let sess;try{sess=JSON.parse(raw)}catch(e){clearSession();return}
  if(!sess||!sess.matchId)return;
  try{
    const squad=await call('getSquad',PIN,sess.matchId);
    const summary=await call('getMatchSummary',PIN,sess.matchId);
    if(!squad.length||!summary.match||!summary.match.matchId||summary.match.status==='Completed'){clearSession();return}
    currentMatchId=sess.matchId;
    currentSummary=summary;
    showView('match');
    renderSummary(currentSummary);
    applyClockState_(summary.clock);
    toast('Resumed your match in progress');
  }catch(e){clearSession()}
}'''

new = '''async function restoreSession(){
  let savedId='';
  try{
    const raw=localStorage.getItem('pmd_session');
    if(raw){
      const sess=JSON.parse(raw);
      if(sess&&sess.matchId)savedId=String(sess.matchId);
    }
  }catch(e){clearSession()}

  if(savedId){
    try{
      const summary=await call('getMatchSummary',PIN,savedId);
      if(summary&&summary.match&&summary.match.matchId&&summary.match.status!=='Completed'){
        currentMatchId=savedId;
        currentSummary=summary;
        showView('match');
        renderSummary(currentSummary);
        applyClockState_(summary.clock);
        saveSession();
        toast('Resumed your match in progress');
        return;
      }
      clearSession();
    }catch(e){clearSession()}
  }

  try{
    const live=await call('getPublicSpectatorData');
    const liveId=live&&live.live&&live.match?String(live.match.matchId||''):'';
    if(/^TRIAL-/i.test(liveId)){
      const summary=await call('getMatchSummary',PIN,liveId);
      if(summary&&summary.match&&summary.match.status==='Live'){
        currentMatchId=liveId;
        currentSummary=summary;
        showView('match');
        renderSummary(currentSummary);
        applyClockState_(summary.clock);
        saveSession();
        toast('Resumed live trial match');
      }
    }
  }catch(e){}
}'''

if old not in s:
    raise SystemExit('restoreSession block not found')
s = s.replace(old, new, 1)

old2 = '''    showView('match');
    renderSummary(currentSummary);
    applyClockState_(currentSummary.clock);
    toast('Trial match ready');'''
new2 = '''    showView('match');
    renderSummary(currentSummary);
    applyClockState_(currentSummary.clock);
    saveSession();
    toast('Trial match ready');'''
if old2 not in s:
    raise SystemExit('trial start block not found')
s = s.replace(old2, new2, 1)

p.write_text(s)
