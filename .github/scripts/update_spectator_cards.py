from pathlib import Path

p=Path('live.html')
s=p.read_text()

# Add card marker styling and sent-off styling.
s=s.replace(
".player{padding:8px 9px;border-bottom:1px solid #e4edf2;font-size:14px;font-weight:800;border-radius:9px}.player:last-child{border-bottom:0}.player.onfield{background:#fff;margin-bottom:5px;border:1px solid #d9eedf}.player.benched{background:#fff;margin-bottom:5px;border:1px solid #dde8ef}.tag{font-size:10px;border-radius:999px;padding:4px 7px;margin-left:6px;font-weight:900;white-space:nowrap}.tag.on{background:var(--green2);color:#12652f}.tag.off{background:var(--red2);color:#9e2323}.tag.return{background:var(--purple2);color:#56329d}",
".player{padding:8px 9px;border-bottom:1px solid #e4edf2;font-size:14px;font-weight:800;border-radius:9px}.player:last-child{border-bottom:0}.player.onfield{background:#fff;margin-bottom:5px;border:1px solid #d9eedf}.player.benched{background:#fff;margin-bottom:5px;border:1px solid #dde8ef}.player.sentoff{background:#fff7f7;border-color:#efcaca}.tag{font-size:10px;border-radius:999px;padding:4px 7px;margin-left:6px;font-weight:900;white-space:nowrap}.tag.return{background:var(--purple2);color:#56329d}.cardMark{display:inline-block;width:9px;height:14px;border-radius:2px;margin-left:7px;vertical-align:-2px;box-shadow:0 0 0 1px #00000018}.cardMark.yellow{background:#f4cf14}.cardMark.red{background:#d62828}"
)

# Add state fields.
s=s.replace(
"    everReturned:[],\n    homeGoals:[{m:18,p:'Alex Taylor'},{m:54,p:'Tom Goodman'}], awayGoals:[{m:61,p:'TEST FC'}],",
"    everReturned:[], yellowCards:[], redCards:[], dismissed:[],\n    homeGoals:[{m:18,p:'Alex Taylor'},{m:54,p:'Tom Goodman'}], awayGoals:[{m:61,p:'TEST FC'}],"
)

# Replace lineup rendering: no ON/AVAILABLE labels, card markers beside names, dismissed never shown as available.
old="""    $('onPitch').innerHTML=state.onPitch.map(p=>`<div class=\"player onfield\">${esc(p)}${state.everReturned.includes(p)?'<span class=\"tag return\">RETURNED</span>':'<span class=\"tag on\">ON</span>'}</div>`).join('');
    const off=state.allPlayers.filter(p=>!state.onPitch.includes(p));
    $('bench').innerHTML=off.map(p=>`<div class=\"player benched\">${esc(p)}<span class=\"tag off\">AVAILABLE</span></div>`).join('') || '<div class=\"small\">Everyone is currently on the pitch</div>';"""
new="""    const cardFor=p=>state.redCards.includes(p)?'<span class=\"cardMark red\" title=\"Red card\"></span>':state.yellowCards.includes(p)?'<span class=\"cardMark yellow\" title=\"Yellow card\"></span>':'';
    $('onPitch').innerHTML=state.onPitch.map(p=>`<div class=\"player onfield\">${esc(p)}${cardFor(p)}${state.everReturned.includes(p)?'<span class=\"tag return\">RETURNED</span>':''}</div>`).join('');
    const off=state.allPlayers.filter(p=>!state.onPitch.includes(p));
    $('bench').innerHTML=off.map(p=>`<div class=\"player benched${state.dismissed.includes(p)?' sentoff':''}\">${esc(p)}${cardFor(p)}</div>`).join('') || '<div class=\"small\">Everyone is currently on the pitch</div>';"""
if old not in s:
    raise SystemExit('render block not found')
s=s.replace(old,new,1)

# Clear new state when no live match.
s=s.replace(
"        state.allPlayers=[]; state.onPitch=[]; state.everReturned=[]; state.homeGoals=[]; state.awayGoals=[]; state.events=[];",
"        state.allPlayers=[]; state.onPitch=[]; state.everReturned=[]; state.yellowCards=[]; state.redCards=[]; state.dismissed=[]; state.homeGoals=[]; state.awayGoals=[]; state.events=[];"
)

# Populate card and dismissed state from live payload/events.
old2="""      state.onPitch=(d.onPitch||[]).map(p=>typeof p==='string'?p:p.name).filter(Boolean);
      state.allPlayers=state.onPitch.concat((d.available||[]),(d.dismissed||[])).filter((v,i,a)=>a.indexOf(v)===i);

      const interchangeEvents=(d.events||[]).filter(e=>e.type==='Substitution');"""
new2="""      state.onPitch=(d.onPitch||[]).map(p=>typeof p==='string'?p:p.name).filter(Boolean);
      state.dismissed=(d.dismissed||[]).filter(Boolean);
      state.allPlayers=state.onPitch.concat((d.available||[]),state.dismissed).filter((v,i,a)=>a.indexOf(v)===i);
      state.yellowCards=[...new Set((d.events||[]).filter(e=>e.type==='Yellow Card'&&e.player).map(e=>e.player))];
      state.redCards=[...new Set((d.events||[]).filter(e=>e.type==='Red Card'&&e.player).map(e=>e.player))];

      const interchangeEvents=(d.events||[]).filter(e=>e.type==='Substitution');"""
if old2 not in s:
    raise SystemExit('live state block not found')
s=s.replace(old2,new2,1)

p.write_text(s)
