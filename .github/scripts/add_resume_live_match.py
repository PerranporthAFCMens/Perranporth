from pathlib import Path
p=Path('match.html')
s=p.read_text()

s=s.replace('>Open MC2</button>','>Open Match Centre</button>',1)

old='''        <button class="btn full" onclick="openSelectedMatch()">Open Match</button>\n\n        <div class="grid2 homeActions" style="margin-top:10px">'''
new='''        <button class="btn full" onclick="openSelectedMatch()">Open Match</button>\n        <button class="btn green full" style="margin-top:8px" onclick="resumeLiveMatch()">▶ Resume Live Match</button>\n\n        <div class="grid2 homeActions" style="margin-top:10px">'''
if 'onclick="resumeLiveMatch()"' not in s:
    if old not in s: raise SystemExit('home button anchor not found')
    s=s.replace(old,new,1)

anchor='''async function openSelectedMatch(){\n  currentMatchId=val('matchSelect');'''
helper='''async function resumeLiveMatch(){\n  try{\n    const live=await call('getPublicSpectatorData');\n    const liveId=live&&live.live&&live.match?String(live.match.matchId||''):'';\n    if(!liveId)return toast('No live match found');\n    const summary=await call('getMatchSummary',PIN,liveId);\n    if(!summary||!summary.match||summary.match.status!=='Live')return toast('No live match found');\n    currentMatchId=liveId;\n    currentSummary=summary;\n    showView('match');\n    renderSummary(currentSummary);\n    applyClockState_(summary.clock);\n    saveSession();\n    ensureSummarySync_();\n    toast(/^TRIAL-/i.test(liveId)?'Resumed live trial match':'Resumed live match');\n  }catch(e){\n    toast(e&&e.message?e.message:'Could not resume live match');\n  }\n}\n\n'''
if 'async function resumeLiveMatch()' not in s:
    idx=s.find(anchor)
    if idx<0: raise SystemExit('openSelectedMatch anchor not found')
    s=s[:idx]+helper+s[idx:]

p.write_text(s)
