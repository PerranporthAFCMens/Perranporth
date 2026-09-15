from pathlib import Path

p = Path('match2.html')
s = p.read_text()

old = '            <button class="btn secondary full" onclick="showSeasonStats()">Season Stats</button>'
new = old + '\n            <button class="btn secondary full" onclick="showPlayerMinutes()">Player Minutes / Appearances</button>'
if 'onclick="showPlayerMinutes()"' not in s:
    if old not in s:
        raise SystemExit('Home menu marker not found')
    s = s.replace(old, new, 1)

old = "['homeView','newMatchView','playersView','addPlayerView','lineupView','squadView','matchView','pastMatchesView','pastMatchView','statsView','subsTrackerView','ghostModeView','votingAdminView']"
new = "['homeView','newMatchView','playersView','addPlayerView','lineupView','squadView','matchView','pastMatchesView','pastMatchView','statsView','minutesView','subsTrackerView','ghostModeView','votingAdminView']"
if "'minutesView'" not in s:
    if old not in s:
        raise SystemExit('showView marker not found')
    s = s.replace(old, new, 1)

marker = '    <div id="subsTrackerView" class="hidden">'
if 'id="minutesView"' not in s:
    if marker not in s:
        raise SystemExit('Minutes HTML insertion marker not found')
    html = '''    <div id="minutesView" class="hidden">
      <div class="card">
        <div class="score">
          <div><h2>Player Minutes / Appearances</h2><div class="muted">Completed matches only</div></div>
          <button class="btn secondary" onclick="showView('home')">Back</button>
        </div>
        <div class="grid2" style="margin-top:12px">
          <button id="minutesSeasonTab" class="btn" onclick="setMinutesView('season')">Season</button>
          <button id="minutesMatchTab" class="btn secondary" onclick="setMinutesView('match')">By Match</button>
        </div>
      </div>

      <div id="minutesSeasonPane" class="card">
        <div class="score"><h2>Season Summary</h2><span id="minutesSeasonCount" class="pill"></span></div>
        <div id="minutesSeasonList" class="muted">Loading…</div>
      </div>

      <div id="minutesMatchPane" class="card hidden">
        <h2>Match Breakdown</h2>
        <select id="minutesMatchSelect" onchange="renderMinutesMatch()"></select>
        <div id="minutesMatchMeta" class="muted" style="margin-top:8px"></div>
        <div id="minutesMatchList" style="margin-top:10px"></div>
      </div>
    </div>

'''
    s = s.replace(marker, html + marker, 1)

js_marker = 'async function showSubsTracker(){'
if 'async function showPlayerMinutes()' not in s:
    if js_marker not in s:
        raise SystemExit('Minutes JS insertion marker not found')
    js = '''let PLAYER_MINUTES_DATA=null;
let PLAYER_MINUTES_VIEW='season';

async function showPlayerMinutes(){
  showView('minutes');
  document.getElementById('minutesSeasonList').innerHTML='<div class="muted">Loading…</div>';
  document.getElementById('minutesMatchList').innerHTML='';
  try{
    PLAYER_MINUTES_DATA=await call('getPlayerMinutesData',PIN);
    renderPlayerMinutes();
  }catch(e){
    document.getElementById('minutesSeasonList').innerHTML='<div class="muted">Could not load player minutes.</div>';
    toast(e&&e.message?e.message:'Could not load player minutes');
  }
}

function setMinutesView(view){
  PLAYER_MINUTES_VIEW=view;
  const season=view==='season';
  document.getElementById('minutesSeasonPane').classList.toggle('hidden',!season);
  document.getElementById('minutesMatchPane').classList.toggle('hidden',season);
  document.getElementById('minutesSeasonTab').className=season?'btn':'btn secondary';
  document.getElementById('minutesMatchTab').className=season?'btn secondary':'btn';
  if(!season)renderMinutesMatch();
}

function renderPlayerMinutes(){
  const d=PLAYER_MINUTES_DATA||{season:[],matches:[]};
  const season=d.season||[];
  document.getElementById('minutesSeasonCount').textContent=season.length+' players';
  document.getElementById('minutesSeasonList').innerHTML=season.length?season.map(p=>`<div class="event"><div class="score"><div><b>${esc(p.player)}</b><div class="muted">${p.starts} starts • ${p.subApps} sub apps • ${p.appearances} apps</div></div><div style="text-align:right"><b style="font-size:20px">${p.minutes}</b><div class="muted">minutes</div></div></div><div class="muted" style="margin-top:4px">Average ${p.averageMinutes} mins per appearance</div></div>`).join(''):'<div class="muted">No completed match minutes yet.</div>';

  const sel=document.getElementById('minutesMatchSelect');
  const previous=sel.value;
  sel.innerHTML=(d.matches||[]).map(m=>`<option value="${esc(m.matchId)}">${esc(m.date)} — ${esc(m.opponent)} (${esc(m.venue)})</option>`).join('');
  if(previous&&(d.matches||[]).some(m=>m.matchId===previous))sel.value=previous;
  renderMinutesMatch();
  setMinutesView(PLAYER_MINUTES_VIEW);
}

function minutesMinuteLabel_(v,isOn){
  if(v===''||v===null||v===undefined)return '—';
  const n=Number(v);
  if(isOn&&n===0)return 'KO';
  return String(n);
}

function renderMinutesMatch(){
  if(!PLAYER_MINUTES_DATA)return;
  const id=val('minutesMatchSelect');
  const m=(PLAYER_MINUTES_DATA.matches||[]).find(x=>x.matchId===id)||(PLAYER_MINUTES_DATA.matches||[])[0];
  if(!m){
    document.getElementById('minutesMatchMeta').textContent='';
    document.getElementById('minutesMatchList').innerHTML='<div class="muted">No completed matches yet.</div>';
    return;
  }
  if(document.getElementById('minutesMatchSelect').value!==m.matchId)document.getElementById('minutesMatchSelect').value=m.matchId;
  document.getElementById('minutesMatchMeta').textContent=[m.competition,m.venue].filter(Boolean).join(' • ');
  document.getElementById('minutesMatchList').innerHTML=(m.players||[]).length?m.players.map(p=>`<div class="event"><div class="score"><div><b>${esc(p.player)}</b><div class="muted">${p.starter?'Starter':esc(p.status||'Sub')} • On ${minutesMinuteLabel_(p.minuteOn,true)} • Off ${minutesMinuteLabel_(p.minuteOff,false)}</div></div><div style="text-align:right"><b style="font-size:20px">${p.minutesPlayed}</b><div class="muted">minutes</div></div></div></div>`).join(''):'<div class="muted">No player-minute data saved for this match.</div>';
}

'''
    s = s.replace(js_marker, js + js_marker, 1)

p.write_text(s)
print('Patched match2.html')
