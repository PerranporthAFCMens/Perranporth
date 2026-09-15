from pathlib import Path

# --- Spectator board: goal + assist markers ---
p=Path('live.html')
s=p.read_text()

s=s.replace(
"    everReturned:[], yellowCards:[], redCards:[], dismissed:[],",
"    everReturned:[], yellowCards:[], redCards:[], dismissed:[], goalCounts:{}, assistCounts:{},"
)

s=s.replace(
"        state.allPlayers=[]; state.onPitch=[]; state.everReturned=[]; state.yellowCards=[]; state.redCards=[]; state.dismissed=[]; state.homeGoals=[]; state.awayGoals=[]; state.events=[];",
"        state.allPlayers=[]; state.onPitch=[]; state.everReturned=[]; state.yellowCards=[]; state.redCards=[]; state.dismissed=[]; state.goalCounts={}; state.assistCounts={}; state.homeGoals=[]; state.awayGoals=[]; state.events=[];"
)

old_render="""    const cardFor=p=>state.redCards.includes(p)?'<span class=\"cardMark red\" title=\"Red card\"></span>':state.yellowCards.includes(p)?'<span class=\"cardMark yellow\" title=\"Yellow card\"></span>':'';
    $('onPitch').innerHTML=state.onPitch.map(p=>`<div class=\"player onfield\">${esc(p)}${cardFor(p)}${state.everReturned.includes(p)?'<span class=\"tag return\">RETURNED</span>':''}</div>`).join('');
    const off=state.allPlayers.filter(p=>!state.onPitch.includes(p));
    $('bench').innerHTML=off.map(p=>`<div class=\"player benched${state.dismissed.includes(p)?' sentoff':''}\">${esc(p)}${cardFor(p)}</div>`).join('') || '<div class=\"small\">Everyone is currently on the pitch</div>';"""

new_render="""    const cardFor=p=>state.redCards.includes(p)?'<span class=\"cardMark red\" title=\"Red card\"></span>':state.yellowCards.includes(p)?'<span class=\"cardMark yellow\" title=\"Yellow card\"></span>':'';
    const contributionFor=p=>{
      const goals=Number(state.goalCounts[p]||0), assists=Number(state.assistCounts[p]||0);
      let out='';
      if(goals) out+='<span class=\"goalMark\" title=\"'+goals+' goal'+(goals===1?'':'s')+'\">'+('⚽'.repeat(goals))+'</span>';
      if(assists) out+='<span class=\"assistMark\" title=\"'+assists+' assist'+(assists===1?'':'s')+'\">A'+(assists>1?'×'+assists:'')+'</span>';
      return out;
    };
    $('onPitch').innerHTML=state.onPitch.map(p=>`<div class=\"player onfield\">${esc(p)}${contributionFor(p)}${cardFor(p)}${state.everReturned.includes(p)?'<span class=\"tag return\">RETURNED</span>':''}</div>`).join('');
    const off=state.allPlayers.filter(p=>!state.onPitch.includes(p));
    $('bench').innerHTML=off.map(p=>`<div class=\"player benched${state.dismissed.includes(p)?' sentoff':''}\">${esc(p)}${contributionFor(p)}${cardFor(p)}</div>`).join('') || '<div class=\"small\">Everyone is currently on the pitch</div>';"""

if old_render not in s:
    raise SystemExit('render block not found')
s=s.replace(old_render,new_render,1)

css_anchor='.cardMark.red{background:#d62828}'
css_add='.goalMark{display:inline-block;margin-left:7px;font-size:13px;vertical-align:0}.assistMark{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 5px;margin-left:6px;border-radius:999px;background:#dcecff;color:#0b5ea8;font-size:10px;font-weight:900;vertical-align:1px;border:1px solid #b8d8f2}'
if css_add not in s:
    if css_anchor not in s: raise SystemExit('CSS anchor not found')
    s=s.replace(css_anchor,css_anchor+css_add,1)

card_lines="""      state.yellowCards=[...new Set((d.events||[]).filter(e=>e.type==='Yellow Card'&&e.player).map(e=>e.player))];
      state.redCards=[...new Set((d.events||[]).filter(e=>e.type==='Red Card'&&e.player).map(e=>e.player))];"""
stat_lines="""      state.yellowCards=[...new Set((d.events||[]).filter(e=>e.type==='Yellow Card'&&e.player).map(e=>e.player))];
      state.redCards=[...new Set((d.events||[]).filter(e=>e.type==='Red Card'&&e.player).map(e=>e.player))];
      state.goalCounts={}; state.assistCounts={};
      (d.events||[]).forEach(e=>{
        const ours=e.type==='Goal' && String(e.team||'')!=='Opposition';
        if(!ours)return;
        const scorer=String(e.player||'').trim();
        const assister=String(e.secondaryPlayer||'').trim();
        if(scorer) state.goalCounts[scorer]=(state.goalCounts[scorer]||0)+1;
        if(assister && !/^no assist$/i.test(assister) && assister!==scorer) state.assistCounts[assister]=(state.assistCounts[assister]||0)+1;
      });"""
if card_lines not in s:
    raise SystemExit('card state block not found')
s=s.replace(card_lines,stat_lines,1)
p.write_text(s)

# --- Control Centre: spectator board block at bottom ---
p=Path('index.html')
s=p.read_text()
anchor='''      <div class="card">\n        <div class="icon">🔐</div>\n        <h2>Player PINs</h2>\n        <div class="desc">Reset a player's Portal PIN and issue a temporary 4-digit PIN when they are locked out or have forgotten it.</div>\n        <a class="btn" href="./pins.html" target="_top">Open Player PINs</a>\n      </div>\n    </div>'''
replacement='''      <div class="card">\n        <div class="icon">🔐</div>\n        <h2>Player PINs</h2>\n        <div class="desc">Reset a player's Portal PIN and issue a temporary 4-digit PIN when they are locked out or have forgotten it.</div>\n        <a class="btn" href="./pins.html" target="_top">Open Player PINs</a>\n      </div>\n\n      <div class="card" style="grid-column:1/-1">\n        <div class="icon">📺</div>\n        <h2>Live Spectator Board</h2>\n        <div class="desc">Public live-match view with score, clock, goalscorers, cards, interchanges, current lineup and match updates. No login required.</div>\n        <a class="btn" href="./live.html" target="_top">Open Live Spectator Board</a>\n      </div>\n    </div>'''
if anchor not in s:
    raise SystemExit('index anchor not found')
s=s.replace(anchor,replacement,1)
p.write_text(s)
