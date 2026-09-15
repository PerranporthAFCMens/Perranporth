from pathlib import Path

p = Path('apps-script/code.gs')
s = p.read_text()
needle = "    getPublicVotingData: function() { return getPublicVotingData(); },"
repl = needle + "\n    getPublicSpectatorData: function() { return getPublicSpectatorData(); },"
if 'getPublicSpectatorData: function()' not in s:
    if needle not in s:
        raise SystemExit('backend insertion point not found')
    s = s.replace(needle, repl, 1)
p.write_text(s)

p = Path('live.html')
s = p.read_text()
start = s.find('    function loadLive(){')
end = s.find("\n\n    $('statusPill').textContent='LOADING'", start)
if start < 0 or end < 0:
    raise SystemExit('loadLive block not found')
new = """    const spectatorChannel='spectator_'+Date.now()+'_'+Math.random().toString(36).slice(2);
    let spectatorSeq=0;
    const spectatorPending=new Map();

    function cleanupSpectator_(id){
      const p=spectatorPending.get(id);
      if(!p)return;
      clearTimeout(p.timer);
      if(p.iframe&&p.iframe.parentNode)p.iframe.parentNode.removeChild(p.iframe);
      spectatorPending.delete(id);
    }

    window.addEventListener('message',event=>{
      const msg=event&&event.data;
      if(!msg||msg.__pmd_match_bridge!==true||msg.channel!==spectatorChannel||!msg.id)return;
      const p=spectatorPending.get(msg.id);
      if(!p)return;
      cleanupSpectator_(msg.id);
      if(msg.ok===true)applyLiveData(msg.result);
      else{
        $('statusPill').textContent='CONNECTION ERROR';
        $('statusPill').className='livepill none';
        $('minute').textContent=msg.error||'Could not load live match';
      }
    });

    function loadLive(){
      const id='spectator_'+Date.now()+'_'+(++spectatorSeq);
      const payload=JSON.stringify({action:'getPublicSpectatorData',args:[]});
      const iframe=document.createElement('iframe');
      iframe.setAttribute('aria-hidden','true');
      iframe.tabIndex=-1;
      iframe.style.position='fixed';
      iframe.style.width='1px'; iframe.style.height='1px'; iframe.style.opacity='0';
      iframe.style.pointerEvents='none'; iframe.style.border='0'; iframe.style.left='-9999px'; iframe.style.top='-9999px';
      const timer=setTimeout(()=>{
        cleanupSpectator_(id);
        $('statusPill').textContent='CONNECTION ERROR';
        $('statusPill').className='livepill none';
        $('minute').textContent='Live data connection timed out';
      },20000);
      spectatorPending.set(id,{iframe,timer});
      iframe.src=APP_URL+'?page=matchrpc&rid='+encodeURIComponent(id)+'&channel='+encodeURIComponent(spectatorChannel)+'&payload='+encodeURIComponent(payload)+'&_='+Date.now();
      document.body.appendChild(iframe);
    }"""
s = s[:start] + new + s[end:]
p.write_text(s)
