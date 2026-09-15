from pathlib import Path

p = Path('apps-script/code.gs')
s = p.read_text()
anchor = "function addPlayerToLiveSquad(pin, matchId, playerName) {"
if 'function setStartingLineup(pin, matchId, lineup)' not in s:
    block = '''function setStartingLineup(pin, matchId, lineup) {
  assertPin_(pin);
  return withLock_(() => setStartingLineup_(matchId, lineup));
}

function setStartingLineup_(matchId, lineup) {
  const mr = getMatchRow_(matchId);
  const status = String(mr.values[6] || 'Scheduled');
  if (status === 'Completed') throw new Error('The match is already finished.');

  const positions = Array.isArray(lineup && lineup.positions) ? lineup.positions : [];
  const pitch = positions.filter(p => p && p.area === 'Pitch' && p.player).map(p => String(p.player).trim()).filter(Boolean);
  const bench = positions.filter(p => p && p.area === 'Bench' && p.player).map(p => String(p.player).trim()).filter(Boolean);

  const uniquePitch = [...new Set(pitch)];
  const uniqueBench = [...new Set(bench.filter(name => !uniquePitch.includes(name)))];
  if (!uniquePitch.length) throw new Error('Put the starting players on the pitch first.');
  if (uniquePitch.length > 11) throw new Error('A starting lineup cannot have more than 11 players.');

  const activeByName = {};
  getPlayers_().forEach(p => { activeByName[p.name] = p; });
  const existing = getSquad_(matchId);
  const existingByName = {};
  existing.forEach(p => { existingByName[p.player] = p; });

  const sh = getSS_().getSheetByName(SHEETS.PLAYER_MATCH);
  const all = sh.getDataRange().getValues();
  for (let r = all.length; r >= 2; r--) {
    if (String(all[r - 1][0]) === String(matchId)) sh.deleteRow(r);
  }

  const writePlayer = (name, playerStatus) => {
    const old = existingByName[name] || {};
    const meta = activeByName[name] || {};
    const starter = playerStatus === 'Starter';
    sh.appendRow([
      matchId,
      name,
      playerStatus,
      starter,
      old.position || meta.position || '',
      old.shirtNo || meta.shirtNo || '',
      starter ? 0 : '',
      old.minuteOff || '',
      Number(old.minutesPlayed || 0),
      Number(old.goals || 0),
      Number(old.assists || 0),
      Number(old.yellows || 0),
      Number(old.reds || 0),
      old.notes || ''
    ]);
  };

  uniquePitch.forEach(name => writePlayer(name, 'Starter'));
  uniqueBench.forEach(name => writePlayer(name, 'Sub'));

  if (lineup) saveLineup_(matchId, lineup);
  return getMatchSummary_(matchId);
}

'''
    if anchor not in s:
        raise SystemExit('backend anchor not found')
    s = s.replace(anchor, block + anchor, 1)

whitelist = "    saveLineup: function(a) { return saveLineup(a[0], a[1], a[2]); },"
if 'setStartingLineup: function(a)' not in s:
    if whitelist not in s:
        raise SystemExit('whitelist anchor not found')
    s = s.replace(whitelist, whitelist + "\n    setStartingLineup: function(a) { return setStartingLineup(a[0], a[1], a[2]); },", 1)
p.write_text(s)

p = Path('match.html')
s = p.read_text()
old = '''        <button class="btn green full" style="margin-top:10px" onclick="saveLineupBuilder()">Save Lineup</button>
        <button class="btn secondary full" style="margin-top:7px" onclick="editSelectedSquad()">List Squad View</button>'''
new = '''        <button class="btn green full" style="margin-top:10px" onclick="saveLineupBuilder()">Save Lineup</button>
        <button class="btn full" style="margin-top:7px" onclick="setAsStartingLineup()">✅ Set as Starting Lineup</button>
        <div class="muted" style="margin-top:6px;text-align:center">Can be used before or after kick-off. This sets the players currently on the pitch as the starting XI.</div>
        <button class="btn secondary full" style="margin-top:7px" onclick="editSelectedSquad()">List Squad View</button>'''
if 'onclick="setAsStartingLineup()"' not in s:
    if old not in s:
        raise SystemExit('button anchor not found')
    s = s.replace(old, new, 1)

func_anchor = 'async function saveLineupBuilder(){'
if 'async function setAsStartingLineup()' not in s:
    idx = s.find(func_anchor)
    if idx < 0:
        raise SystemExit('save lineup function anchor not found')
    helper = '''async function setAsStartingLineup(){
  if(!currentMatchId)return toast('Select a match');
  const pitchPlayers=lineupState.filter(p=>p.area==='Pitch'&&p.player);
  if(!pitchPlayers.length)return toast('Put the starting players on the pitch first');
  if(pitchPlayers.length>11)return toast('Starting lineup cannot have more than 11 players');

  const payload={
    formation:val('lineupFormation')||'Custom',
    positions:lineupState.map((p,i)=>({
      player:p.player,area:p.area,x:p.x||0,y:p.y||0,
      order:p.area==='Pitch'&&Number.isInteger(p.slot)?p.slot+1:(p.order||i+1)
    }))
  };

  if(!confirm(`Set ${pitchPlayers.length} player${pitchPlayers.length===1?'':'s'} on the pitch as the starting lineup?`))return;

  try{
    await call('setStartingLineup',PIN,currentMatchId,payload);
    DATA.matches=await call('getMatches',PIN,true);
    populateMatches();
    document.getElementById('matchSelect').value=currentMatchId;
    updateSelectedMatchInfo();
    await loadLineupBuilder();
    toast('Starting lineup set');
  }catch(err){
    toast(err&&err.message?err.message:String(err||'Could not set starting lineup'));
  }
}

'''
    s = s[:idx] + helper + s[idx:]
p.write_text(s)
