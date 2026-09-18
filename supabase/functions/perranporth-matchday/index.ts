
import postgres from "npm:postgres@3.4.7";

const db = postgres(Deno.env.get("SUPABASE_DB_URL")!, { max: 1, prepare: false });
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8"
};
const ROLE_PERMS = {
  FULL_ADMIN:["*"], MATCHDAY:["match","read"], VOTING:["voting","read"],
  SUBS:["subs","read"], READ_ONLY:["read"], CUSTOM:[]
};
const norm=(v)=>String(v??"").trim();
const low=(v)=>norm(v).toLowerCase();
const bool=(v)=>v===true||low(v)==="true";
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const int=(v,d=0)=>Number.isFinite(Number(v))?Math.trunc(Number(v)):d;
const q=(text,params=[])=>db.unsafe(text,params);
function out(result){return new Response(JSON.stringify({ok:true,result}),{headers:CORS});}
function fail(message,status=400){return new Response(JSON.stringify({ok:false,error:message}),{status,headers:CORS});}
function dateText(v){if(!v)return"";const d=new Date(v);if(Number.isNaN(d.getTime()))return String(v);return new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/London",day:"2-digit",month:"2-digit",year:"numeric"}).format(d);}
function timeText(v){if(!v)return"";if(typeof v==="string"&&/^\d{2}:\d{2}/.test(v))return v.slice(0,5);const d=new Date(v);if(Number.isNaN(d.getTime()))return String(v);return new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/London",hour:"2-digit",minute:"2-digit",hour12:false}).format(d);}
async function setting(name){const r=await q("select value from perranporth.settings where setting=$1 limit 1",[name]);return r.length?r[0].value:"";}
async function hash(s){const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));return Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,"0")).join("");}
function custom(v){if(Array.isArray(v))return v.map(String);const s=norm(v);if(!s)return[];try{const j=JSON.parse(s);if(Array.isArray(j))return j.map(String);}catch{}return s.split(",").map(x=>x.trim()).filter(Boolean);}
async function createSession(pin){
  const p=norm(pin); if(!p)throw new Error("Incorrect PIN.");
  let source="",uid=null,pv=1;
  const app=norm(await setting("App PIN")),tmp=norm(await setting("Temporary Management PIN"));
  if(app&&p===app)source="MAIN"; else if(tmp&&p===tmp)source="TEMP";
  else{
    const users=await q("select id,pin_hash,pin_version from perranporth.management_access where active=true and coalesce(pin_hash,'')<>''");
    for(const u of users){if(await hash(String(u.id)+"|"+p)===String(u.pin_hash)){source="USER";uid=String(u.id);pv=int(u.pin_version,1);break;}}
  }
  if(!source)throw new Error("Incorrect PIN.");
  const token=crypto.randomUUID()+"-"+crypto.randomUUID(),exp=new Date(Date.now()+86400000);
  await q("insert into perranporth.admin_sessions(token,user_id,source,pin_version,expires_at) values($1,$2,$3,$4,$5)",[token,uid,source,pv,exp]);
  return {token,expiresAt:exp.getTime()};
}
async function ctx(token){
  const t=norm(token); if(!t)return null;
  await q("delete from perranporth.admin_sessions where expires_at<=now()");
  const r=await q("select user_id,source,pin_version from perranporth.admin_sessions where token=$1 and expires_at>now() limit 1",[t]);
  if(!r.length)return null; const s=r[0];
  if(s.source==="MAIN"||s.source==="TEMP")return{id:s.source,name:s.source==="MAIN"?"Main Admin":"Temporary Admin",role:"FULL_ADMIN",permissions:["*"]};
  const u=await q("select id,name,role,custom_access,pin_version,active from perranporth.management_access where id=$1 limit 1",[s.user_id]);
  if(!u.length||!u[0].active||int(u[0].pin_version,1)!==int(s.pin_version,1)){await q("delete from perranporth.admin_sessions where token=$1",[t]);return null;}
  const role=norm(u[0].role)||"READ_ONLY";return{id:String(u[0].id),name:norm(u[0].name),role,permissions:role==="CUSTOM"?custom(u[0].custom_access):(ROLE_PERMS[role]||[])};
}
async function auth(token,perm="match"){const c=await ctx(token);if(!c)throw new Error("Admin session expired. Please enter the PIN again.");if(!(c.permissions.includes("*")||c.permissions.includes(perm)))throw new Error("You do not have access to this area.");return c;}
function matchObj(r){return{matchId:String(r.match_id||""),date:dateText(r.match_date),opponent:norm(r.opponent),venue:norm(r.venue),competition:norm(r.competition),kickoff:timeText(r.kickoff),status:norm(r.status),ourScore:r.our_score==null?"":Number(r.our_score),oppScore:r.opp_score==null?"":Number(r.opp_score),formation:norm(r.formation),captain:norm(r.captain),notes:norm(r.notes),include:r.include!==false,source:norm(r.source),calendarKey:norm(r.calendar_key),ground:norm(r.ground)};}
async function matchRow(id){const r=await q("select * from perranporth.matches where match_id=$1 limit 1",[id]);if(!r.length)throw new Error("Match not found.");return r[0];}
async function matches(includeCompleted=true){const r=await q("select * from perranporth.matches order by match_date asc nulls last,kickoff asc nulls last,source_row asc");return r.map(matchObj).filter(m=>m.matchId&&m.include&&(includeCompleted||m.status!=="Completed")&&low(m.source)!=="trial"&&!/pre[- ]?season/i.test(m.calendarKey+" "+m.notes)&&!(low(m.source)==="manual"&&/^(test|testing|trial)\b/i.test(m.opponent)));}
async function players(activeOnly=true){const r=await q("select * from perranporth.players order by player");return r.filter(x=>!activeOnly||x.active).map(x=>({name:norm(x.player),active:!!x.active,position:norm(x.default_position),shirtNo:x.shirt_no??"",goalkeeper:!!x.goalkeeper,notes:norm(x.notes),alias:norm(x.voting_alias),dateOfBirth:x.date_of_birth?String(x.date_of_birth):""})).filter(x=>x.name);}
async function events(id){const r=await q("select * from perranporth.events where match_id=$1 order by minute asc,event_timestamp asc nulls last,event_id asc",[id]);return r.map(x=>({eventId:String(x.event_id),matchId:String(x.match_id),minute:Number(x.minute||0),type:norm(x.event_type),team:norm(x.team),player:norm(x.player),secondaryPlayer:norm(x.secondary_player),goalType:norm(x.goal_type),touches:x.touches??"",zone:norm(x.goal_zone),originZone:norm(x.assist_zone),cardReason:norm(x.card_reason),notes:norm(x.notes),timestamp:x.event_timestamp?new Date(x.event_timestamp).toLocaleString("en-GB",{timeZone:"Europe/London"}):""}));}
function score(ev){let ours=0,opp=0;for(const e of ev){if(e.type==="Goal"&&e.team!=="Opposition")ours++;if(e.type==="Conceded Goal"||(e.type==="Goal"&&e.team==="Opposition"))opp++;}return{ours,opp};}
async function squad(id){const r=await q("select * from perranporth.player_match_data where match_id=$1 order by id",[id]);return r.map(x=>({player:norm(x.player),status:norm(x.squad_status),starter:!!x.starter,position:norm(x.starting_position),shirtNo:x.shirt_no??"",minuteOn:x.minute_on??"",minuteOff:x.minute_off??"",minutesPlayed:Number(x.minutes_played||0),goals:int(x.goals),assists:int(x.assists),yellows:int(x.yellow_cards),reds:int(x.red_cards),notes:norm(x.notes)}));}
async function lineup(id){const m=await matchRow(id),r=await q("select * from perranporth.lineup_positions where match_id=$1 order by sort_order,id",[id]);return{matchId:id,formation:(r.length?norm(r[0].formation):"")||norm(m.formation)||"Custom",positions:r.filter(x=>x.player&&(x.area==="Pitch"||x.area==="Bench")).map(x=>({player:norm(x.player),area:norm(x.area),x:Number(x.x||0),y:Number(x.y||0),order:int(x.sort_order)}))};}
function defClock(id){return{matchId:id,startedAt:null,baseSeconds:0,runningSince:null,onBreak:false,half:1,firstHalfAddedMinutes:0,finishedAt:null,updatedAt:Date.now()};}
async function rawClock(id){const r=await q("select * from perranporth.match_clocks where match_id=$1 limit 1",[id]);if(!r.length)return defClock(id);const x=r[0];return{matchId:id,startedAt:x.started_at?Number(x.started_at):null,baseSeconds:int(x.base_seconds),runningSince:x.running_since?Number(x.running_since):null,onBreak:!!x.on_break,half:int(x.half,1),firstHalfAddedMinutes:int(x.first_half_added_minutes),finishedAt:x.finished_at?Number(x.finished_at):null,updatedAt:Number(x.updated_at||0)};}
function elapsed(c,n=Date.now()){return Math.max(0,int(c.baseSeconds)+(c.runningSince?Math.floor((n-Number(c.runningSince))/1000):0));}
function pubClock(c){const n=Date.now();return{matchId:c.matchId,started:!!c.startedAt,startedAt:c.startedAt||null,startedAtText:c.startedAt?timeText(new Date(Number(c.startedAt))):"",elapsedSeconds:elapsed(c,n),running:!!c.runningSince,onBreak:!!c.onBreak,half:int(c.half,1),firstHalfAddedMinutes:int(c.firstHalfAddedMinutes),finishedAt:c.finishedAt||null,finishedAtText:c.finishedAt?timeText(new Date(Number(c.finishedAt))):"",serverNow:n};}
async function writeClock(c){c.updatedAt=Date.now();await q("insert into perranporth.match_clocks(match_id,started_at,base_seconds,running_since,on_break,half,first_half_added_minutes,finished_at,updated_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict(match_id) do update set started_at=excluded.started_at,base_seconds=excluded.base_seconds,running_since=excluded.running_since,on_break=excluded.on_break,half=excluded.half,first_half_added_minutes=excluded.first_half_added_minutes,finished_at=excluded.finished_at,updated_at=excluded.updated_at",[c.matchId,c.startedAt,int(c.baseSeconds),c.runningSince,!!c.onBreak,int(c.half,1),int(c.firstHalfAddedMinutes),c.finishedAt,c.updatedAt]);return c;}
async function clock(id){return pubClock(await rawClock(id));}
async function summary(id){const m=await matchRow(id),ev=await events(id),sc=score(ev);if(Number(m.our_score??0)!==sc.ours||Number(m.opp_score??0)!==sc.opp){await q("update perranporth.matches set our_score=$1,opp_score=$2 where match_id=$3",[sc.ours,sc.opp,id]);m.our_score=sc.ours;m.opp_score=sc.opp;}return{match:matchObj(m),events:ev,squad:await squad(id),clock:await clock(id)};}
async function notDone(id){const m=await matchRow(id);if(m.status==="Completed")throw new Error("This match is already finished.");return m;}
async function validEvent(e){if(!e||!e.matchId||!e.eventType)throw new Error("Incomplete event.");if(!Number.isFinite(Number(e.minute))||Number(e.minute)<=0)throw new Error("Enter a valid match minute.");const names=new Set((await players(true)).map(x=>x.name));if(e.eventType==="Goal"){if(!e.player||!names.has(e.player))throw new Error("Select an active player.");if(e.secondaryPlayer){if(!names.has(e.secondaryPlayer))throw new Error("Select an active assist player.");if(e.secondaryPlayer===e.player)throw new Error("The scorer and assist player cannot be the same.");}}if(e.eventType==="Yellow Card"||e.eventType==="Red Card"){if(!e.player||!names.has(e.player))throw new Error("Select the player who received the card.");}if(e.eventType==="Substitution"){if(!e.player||!e.secondaryPlayer)throw new Error("Select both the player off and the player on.");if(e.player===e.secondaryPlayer)throw new Error("The player off and player on cannot be the same.");if(!names.has(e.player)||!names.has(e.secondaryPlayer))throw new Error("Select active players for the substitution.");}}
async function refreshStats(id){const ev=await events(id),rows=await q("select id,player from perranporth.player_match_data where match_id=$1",[id]);for(const r of rows){const p=String(r.player),g=ev.filter(e=>e.type==="Goal"&&e.player===p&&e.team!=="Opposition").length,a=ev.filter(e=>e.type==="Goal"&&e.secondaryPlayer===p&&e.team!=="Opposition").length,y=ev.filter(e=>e.type==="Yellow Card"&&e.player===p).length,rd=ev.filter(e=>e.type==="Red Card"&&e.player===p).length;await q("update perranporth.player_match_data set goals=$1,assists=$2,yellow_cards=$3,red_cards=$4 where id=$5",[g,a,y,rd,r.id]);}}
function minute(v){const n=Number(v||0);if(!Number.isFinite(n))return 0;const b=Math.floor(n),a=Math.round((n-b)*100);if(a>0&&(b===45||b===90))return b;return Math.max(0,Math.min(90,b));}
async function recalc(id,snap){const rows=await q("select * from perranporth.player_match_data where match_id=$1 order by id",[id]);if(!rows.length)return;const ev=await events(id),end=snap&&snap.started?(int(snap.half,1)===1?Math.max(0,Math.min(45,Math.ceil(num(snap.elapsedSeconds)/60))):90):90,ord=[...ev].sort((a,b)=>minute(a.minute)-minute(b.minute));for(const r of rows){const p=String(r.player),starter=!!r.starter;let active=starter,on=starter?0:null,first=starter?0:null,off=null,mins=0;for(const e of ord){const m=minute(e.minute);if(e.type==="Substitution"){if(e.player===p&&active){mins+=Math.max(0,m-on);active=false;on=null;off=m;}if(e.secondaryPlayer===p&&!active){active=true;on=m;if(first===null)first=m;}}if(e.type==="Red Card"&&e.player===p&&active){mins+=Math.max(0,m-on);active=false;on=null;off=m;}}if(active&&on!==null)mins+=Math.max(0,end-on);const g=ev.filter(e=>e.type==="Goal"&&e.player===p&&e.team!=="Opposition").length,a=ev.filter(e=>e.type==="Goal"&&e.secondaryPlayer===p&&e.team!=="Opposition").length,y=ev.filter(e=>e.type==="Yellow Card"&&e.player===p).length,rd=ev.filter(e=>e.type==="Red Card"&&e.player===p).length;await q("update perranporth.player_match_data set minute_on=$1,minute_off=$2,minutes_played=$3,goals=$4,assists=$5,yellow_cards=$6,red_cards=$7 where id=$8",[first,off,mins,g,a,y,rd,r.id]);}}
async function saveSquad(id,list){const m=await matchRow(id);if(m.status==="Live")throw new Error("The match is live. Edit the squad before kickoff or after full time.");await db.begin(async tx=>{await tx.unsafe("delete from perranporth.player_match_data where match_id=$1",[id]);for(const p of list||[]){const st=p.status==="Starter";await tx.unsafe("insert into perranporth.player_match_data(match_id,player,squad_status,starter,starting_position,shirt_no,minute_on,minutes_played,goals,assists,yellow_cards,red_cards,notes,raw_data) values($1,$2,$3,$4,$5,$6,$7,0,0,0,0,0,'','{}'::jsonb)",[id,norm(p.player),norm(p.status),st,norm(p.position),norm(p.shirtNo),st?0:null]);}});if(m.status==="Completed")await recalc(id,await clock(id));return summary(id);}
async function saveLineup(id,payload){const m=await matchRow(id),active=new Set((await players(true)).map(x=>x.name)),seen=new Set(),formation=norm(payload?.formation)||"Custom";const ps=(payload?.positions||[]).map((p,i)=>({player:norm(p.player),area:norm(p.area),x:num(p.x),y:num(p.y),order:int(p.order,i+1)})).filter(p=>{if(!p.player||seen.has(p.player)||!active.has(p.player)||(p.area!=="Pitch"&&p.area!=="Bench"))return false;seen.add(p.player);return true;});await db.begin(async tx=>{await tx.unsafe("delete from perranporth.lineup_positions where match_id=$1",[id]);for(const p of ps)await tx.unsafe("insert into perranporth.lineup_positions(match_id,player,area,x,y,sort_order,formation,updated_at,raw_data) values($1,$2,$3,$4,$5,$6,$7,now(),'{}'::jsonb)",[id,p.player,p.area,p.area==="Pitch"?Math.max(0,Math.min(100,p.x)):null,p.area==="Pitch"?Math.max(0,Math.min(100,p.y)):null,p.order,formation]);});if(m.status!=="Live")await saveSquad(id,ps.map(p=>({player:p.player,status:p.area==="Pitch"?"Starter":"Sub",position:"",shirtNo:""})));if(formation!=="Custom")await q("update perranporth.matches set formation=$1 where match_id=$2",[formation,id]);return lineup(id);}
async function starting(id,payload){const m=await matchRow(id);if(m.status==="Completed")throw new Error("The match is already finished.");const ps=Array.isArray(payload?.positions)?payload.positions:[],pitch=ps.filter(p=>p?.area==="Pitch"&&p.player).map(p=>norm(p.player)),bench=ps.filter(p=>p?.area==="Bench"&&p.player).map(p=>norm(p.player)),up=[...new Set(pitch)],ub=[...new Set(bench.filter(n=>!up.includes(n)))];if(!up.length)throw new Error("Put the starting players on the pitch first.");if(up.length>11)throw new Error("A starting lineup cannot have more than 11 players.");const old=await squad(id),oldMap=new Map(old.map(p=>[p.player,p])),pl=await players(true),meta=new Map(pl.map(p=>[p.name,p]));await db.begin(async tx=>{await tx.unsafe("delete from perranporth.player_match_data where match_id=$1",[id]);for(const pair of [...up.map(n=>[n,"Starter"]),...ub.map(n=>[n,"Sub"])]){const name=pair[0],status=pair[1],o=oldMap.get(name)||{},mt=meta.get(name)||{},st=status==="Starter";await tx.unsafe("insert into perranporth.player_match_data(match_id,player,squad_status,starter,starting_position,shirt_no,minute_on,minute_off,minutes_played,goals,assists,yellow_cards,red_cards,notes,raw_data) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'{}'::jsonb)",[id,name,status,st,o.position||mt.position||"",o.shirtNo||mt.shirtNo||"",st?0:null,o.minuteOff===""?null:o.minuteOff??null,num(o.minutesPlayed),int(o.goals),int(o.assists),int(o.yellows),int(o.reds),norm(o.notes)]);}});if(payload)await saveLineup(id,payload);return summary(id);}
async function spectator(){const live=await q("select * from perranporth.matches where lower(status)='live' and not (lower(coalesce(source,''))='manual' and coalesce(opponent,'') ~* '^(test|testing|trial)\\b') order by match_date desc nulls last,source_row desc nulls last limit 1");if(!live.length)return{live:false,generatedAt:new Date().toLocaleString("en-GB",{timeZone:"Europe/London"})};const m=live[0],id=String(m.match_id),ev=await events(id),sc=score(ev),cl=await clock(id),sq=await squad(id),li=await lineup(id),on=new Set(sq.filter(p=>p.status==="Starter"||p.starter).map(p=>p.player));for(const e of ev){if(e.type==="Substitution"){if(e.player)on.delete(e.player);if(e.secondaryPlayer)on.add(e.secondaryPlayer);}if(e.type==="Red Card"&&e.player)on.delete(e.player);}const red=new Set(ev.filter(e=>e.type==="Red Card"&&e.player).map(e=>e.player)),all=sq.filter(p=>p.status==="Starter"||p.status==="Sub").map(p=>p.player),pm=new Map(li.positions.map(p=>[p.player,p])),home=low(m.venue)!=="away";return{live:true,match:{matchId:id,date:dateText(m.match_date),kickoff:timeText(m.kickoff),opponent:norm(m.opponent),venue:norm(m.venue),competition:norm(m.competition),formation:li.formation||norm(m.formation)},homeTeam:home?"Perranporth":norm(m.opponent),awayTeam:home?norm(m.opponent):"Perranporth",homeScore:home?sc.ours:sc.opp,awayScore:home?sc.opp:sc.ours,clock:cl,onPitch:[...on].map(name=>{const p=pm.get(name);return{name,x:p?num(p.x):0,y:p?num(p.y):0,order:p?int(p.order):0};}),available:all.filter(p=>!on.has(p)&&!red.has(p)),dismissed:all.filter(p=>red.has(p)),events:ev.map(e=>({minute:e.minute,type:e.type,team:e.team,player:e.player,secondaryPlayer:e.secondaryPlayer,goalType:e.goalType,cardReason:e.cardReason})),generatedAt:new Date().toLocaleString("en-GB",{timeZone:"Europe/London"})};}

async function initData(){
  return {teamName:norm(await setting("Team Name"))||"Perranporth AFC",season:norm(await setting("Season"))||"2026/27",badgeUrl:norm(await setting("Voting Badge URL")),players:await players(true),allPlayers:await allPlayers(),matches:await matches(true)};
}
async function allPlayers(){
  const r=await q("select * from perranporth.players order by active desc,player asc");
  return r.map(x=>({name:norm(x.player),active:!!x.active,position:norm(x.default_position),shirtNo:x.shirt_no??"",goalkeeper:!!x.goalkeeper,notes:norm(x.notes),alias:norm(x.voting_alias),dateOfBirth:x.date_of_birth?String(x.date_of_birth):""})).filter(x=>x.name);
}
async function addPlayer(data){
  const name=norm(data?.name);if(!name)throw new Error("Enter a player name.");
  if((await q("select 1 from perranporth.players where lower(player)=lower($1) limit 1",[name])).length)throw new Error("That player already exists.");
  await q("insert into perranporth.players(player,active,default_position,shirt_no,goalkeeper,notes,voting_alias,portal_pin,pin_chosen,date_of_birth,raw_data) values($1,true,$2,$3,$4,$5,$6,'',false,$7,'{}'::jsonb)",[name,norm(data.position),norm(data.shirtNo),!!data.goalkeeper,norm(data.notes),norm(data.alias),data.dateOfBirth||null]);
  return{name,active:true,position:norm(data.position),shirtNo:norm(data.shirtNo),goalkeeper:!!data.goalkeeper,notes:norm(data.notes),alias:norm(data.alias)};
}
async function updatePlayer(originalName,data){
  const original=norm(originalName),name=norm(data?.name);if(!original)throw new Error("Player not found.");if(!name)throw new Error("Player name cannot be blank.");
  if((await q("select player from perranporth.players where lower(player)=lower($1) and lower(player)<>lower($2) limit 1",[name,original])).length)throw new Error("Another player already has that name.");
  const r=await q("update perranporth.players set player=$1,active=$2,default_position=$3,shirt_no=$4,goalkeeper=$5,notes=$6,voting_alias=$7,date_of_birth=$8 where lower(player)=lower($9) returning player",[name,data.active!==false,norm(data.position),norm(data.shirtNo),!!data.goalkeeper,norm(data.notes),norm(data.alias),data.dateOfBirth||null,original]);
  if(!r.length)throw new Error("Player not found.");
  if(low(original)!==low(name)){await q("update perranporth.player_match_data set player=$1 where lower(player)=lower($2)",[name,original]);await q("update perranporth.lineup_positions set player=$1 where lower(player)=lower($2)",[name,original]);await q("update perranporth.events set player=$1 where lower(player)=lower($2)",[name,original]);await q("update perranporth.events set secondary_player=$1 where lower(secondary_player)=lower($2)",[name,original]);}
  return{name,active:data.active!==false,position:norm(data.position),shirtNo:norm(data.shirtNo),goalkeeper:!!data.goalkeeper,notes:norm(data.notes),alias:norm(data.alias)};
}
async function seasonStats(){
  const r=await q("select p.player,p.squad_status,p.minutes_played,p.goals,p.assists,p.yellow_cards,p.red_cards from perranporth.player_match_data p join perranporth.matches m on m.match_id=p.match_id where m.status='Completed' and lower(coalesce(m.source,''))<>'trial' and coalesce(m.opponent,'') not ilike 'test%' and coalesce(m.opponent,'') not ilike 'testing%' and coalesce(m.opponent,'') not ilike 'trial%'");
  const map=new Map();for(const x of r){const name=norm(x.player);if(!name)continue;if(!map.has(name))map.set(name,{player:name,appearances:0,goals:0,assists:0,minutes:0,yellows:0,reds:0});const z=map.get(name);if(norm(x.squad_status)!=="Unused")z.appearances++;z.minutes+=num(x.minutes_played);z.goals+=int(x.goals);z.assists+=int(x.assists);z.yellows+=int(x.yellow_cards);z.reds+=int(x.red_cards);}return[...map.values()].sort((a,b)=>b.goals-a.goals||b.assists-a.assists||b.minutes-a.minutes||a.player.localeCompare(b.player));
}
function historicVenue_(label){
  const s=norm(label);
  if(/\(A\)\s*$/i.test(s))return "Away";
  if(/\(H\)\s*$/i.test(s))return "Home";
  if(/\(N\)\s*$/i.test(s))return "Neutral";
  return "";
}
function historicOpponent_(label){
  return norm(label).replace(/\s*\((H|A|N)\)\s*$/i,"").trim();
}
async function historicMinutesData(){
  const stats=await q("select * from perranporth.historic_player_season_stats where season='2025/26' order by total_minutes desc,appearances desc,player");
  const mins=await q("select h.*,m.match_date,m.competition from perranporth.historic_player_match_minutes h left join perranporth.historic_matches m on m.season=h.season and m.match_label=h.match_label where h.season='2025/26' order by m.match_date desc nulls last,h.match_label,h.player");
  const mm=new Map();
  for(const x of mins){
    const id="HIST-2025-26-"+norm(x.match_label).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
    if(!mm.has(id))mm.set(id,{matchId:id,date:dateText(x.match_date),opponent:historicOpponent_(x.match_label),venue:historicVenue_(x.match_label),competition:norm(x.competition),historical:true,players:[]});
    mm.get(id).players.push({player:norm(x.player),status:"Played",starter:false,minuteOn:"",minuteOff:"",minutesPlayed:num(x.minutes)});
  }
  const season=stats.map(x=>({player:norm(x.player),starts:null,subApps:null,appearances:int(x.appearances),minutes:num(x.total_minutes),averageMinutes:x.average_minutes==null?0:Math.round(num(x.average_minutes)*10)/10,goals:int(x.goals),assists:int(x.assists),full90s:int(x.full_90s)}));
  return{seasonLabel:"2025/26",historical:true,season,matches:[...mm.values()]};
}
async function minutesData(requestedSeason){
  const wanted=norm(requestedSeason)||"2026/27";
  if(wanted==="2025/26")return historicMinutesData();
  const r=await q("select p.*,m.match_date,m.opponent,m.venue,m.competition from perranporth.player_match_data p join perranporth.matches m on m.match_id=p.match_id where m.status='Completed' and lower(coalesce(m.source,''))<>'trial' and coalesce(m.opponent,'') not ilike 'test%' and coalesce(m.opponent,'') not ilike 'testing%' and coalesce(m.opponent,'') not ilike 'trial%' order by m.match_date desc,p.player");
  const sm=new Map(),mm=new Map();
  for(const x of r){const player=norm(x.player),status=norm(x.squad_status),appeared=status!=="Unused"&&status!=="Not in Squad",starter=!!x.starter;if(!sm.has(player))sm.set(player,{player,starts:0,subApps:0,appearances:0,minutes:0});const s=sm.get(player);if(appeared){s.appearances++;if(starter)s.starts++;else s.subApps++;}s.minutes+=num(x.minutes_played);const id=String(x.match_id);if(!mm.has(id))mm.set(id,{matchId:id,date:dateText(x.match_date),opponent:norm(x.opponent),venue:norm(x.venue),competition:norm(x.competition),historical:false,players:[]});mm.get(id).players.push({player,status,starter,minuteOn:x.minute_on??"",minuteOff:x.minute_off??"",minutesPlayed:num(x.minutes_played)});}
  const season=[...sm.values()].map(x=>({...x,averageMinutes:x.appearances?Math.round((x.minutes/x.appearances)*10)/10:0})).sort((a,b)=>b.minutes-a.minutes||b.appearances-a.appearances||a.player.localeCompare(b.player));
  return{seasonLabel:"2026/27",historical:false,season,matches:[...mm.values()]};
}

function dashboardEvent_(e){
  const t=norm(e.event_type);
  const conceded=t==="Conceded"||t==="Conceded Goal"||(t==="Goal"&&norm(e.team)==="Opposition");
  const type=conceded?"Conceded Goal":t;
  return {
    minute:num(e.minute),displayMinute:num(e.minute),type,
    team:conceded?"Opposition":(norm(e.team)||"Perranporth"),
    player:conceded?"":norm(e.player),
    secondaryPlayer:conceded?"":norm(e.secondary_player),
    goalType:conceded?"":norm(e.goal_type),
    touches:e.touches==null?null:int(e.touches),
    goalZone:norm(e.goal_zone),
    assistZone:conceded?"":norm(e.assist_zone)
  };
}
async function currentDashboardData(){
  const ms=await q("select * from perranporth.matches where status='Completed' and include is not false and lower(coalesce(source,''))<>'trial' and coalesce(opponent,'') not ilike 'test%' and coalesce(opponent,'') not ilike 'testing%' and coalesce(opponent,'') not ilike 'trial%' and coalesce(opponent,'') not ilike 'demo%' order by match_date asc,source_row asc");
  const ev=await q("select * from perranporth.events order by minute,event_timestamp nulls last,event_id");
  const by=new Map();
  for(const x of ev){const id=String(x.match_id);if(!by.has(id))by.set(id,[]);by.get(id).push(dashboardEvent_(x));}
  const matches=[];
  for(const m of ms){
    const events=by.get(String(m.match_id))||[];
    if(!events.length)continue;
    const sc=score(events);
    matches.push({matchId:String(m.match_id),date:dateText(m.match_date),opponent:norm(m.opponent),venue:norm(m.venue),competition:norm(m.competition)||"Other",ourScore:sc.ours,oppScore:sc.opp,events});
  }
  const zones=(await q("select zone,description from perranporth.zones order by source_row")).map(z=>({zone:norm(z.zone),description:norm(z.description)}));
  return{teamName:norm(await setting("Team Name"))||"Perranporth AFC",season:norm(await setting("Season"))||"2026/27",badgeUrl:norm(await setting("Voting Badge URL")),matches,zones,generatedAt:new Date().toLocaleString("en-GB",{timeZone:"Europe/London",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"})};
}
async function historicDashboardData(){
  const ms=await q("select * from perranporth.historic_matches where season='2025/26' order by match_date asc,id asc");
  const ev=await q("select * from perranporth.historic_events where season='2025/26' order by match_date,minute,source_row");
  const by=new Map();
  for(const x of ev){
    if(x.event_type!=="Goal"&&x.event_type!=="Conceded")continue;
    const k=norm(x.match_label);if(!by.has(k))by.set(k,[]);
    by.get(k).push(dashboardEvent_({minute:x.minute,event_type:x.event_type==="Conceded"?"Conceded Goal":x.event_type,team:x.event_type==="Conceded"?"Opposition":"Perranporth",player:x.player,secondary_player:x.secondary_player,goal_type:x.goal_type,touches:x.touches,goal_zone:x.goal_zone,assist_zone:x.assist_zone}));
  }
  const matches=ms.map(m=>{const events=by.get(norm(m.match_label))||[],sc=score(events);return{matchId:"HIST-"+String(m.id),date:dateText(m.match_date),opponent:norm(m.match_label),venue:historicVenue_(m.match_label),competition:norm(m.competition)||"Other",ourScore:sc.ours,oppScore:sc.opp,events};});
  return{teamName:norm(await setting("Team Name"))||"Perranporth AFC",season:"2025/26",badgeUrl:norm(await setting("Voting Badge URL")),matches,zones:[],generatedAt:new Date().toLocaleString("en-GB",{timeZone:"Europe/London",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"})};
}

const normName=v=>low(v).replace(/\s+/g," ").trim();
function matchLabelDb(m){
  const v=low(m.venue);
  const code=v==="away"?"A":v==="neutral"?"N":"H";
  return norm(m.opponent)+" ("+code+")";
}
async function setSettingDb(name,value){
  await q("insert into perranporth.settings(setting,value,raw_data) values($1,$2::jsonb,'{}'::jsonb) on conflict(setting) do update set value=excluded.value",[name,JSON.stringify(value)]);
}
async function paymentForMatch(matchId){
  let r=await q("select payment_identifier,payment_link from perranporth.subs_payments where match_id=$1 limit 1",[matchId]);
  if(r.length)return{identifier:norm(r[0].payment_identifier),link:norm(r[0].payment_link)};
  const m=await matchRow(matchId);
  const venue=low(m.venue)==="away"?"A":low(m.venue)==="neutral"?"N":"H";
  const identifier=(norm(m.opponent).replace(/[^A-Za-z0-9]/g,"")+venue).slice(0,48);
  const link="https://monzo.me/adamturner4/3.00?h=CmJ3lb&d="+encodeURIComponent(identifier)+"&account_type=personal";
  await q("insert into perranporth.subs_payments(match_id,payment_identifier,payment_link) values($1,$2,$3) on conflict(match_id) do update set payment_identifier=excluded.payment_identifier,payment_link=excluded.payment_link,updated_at=now()",[matchId,identifier,link]);
  return{identifier,link};
}
async function publicVotingData(){
  let open=bool(await setting("Voting Open"));
  let matchId=norm(await setting("Voting Open Match ID"));
  let matchName=norm(await setting("Voting Match Name"));
  let validMatch=null;

  if(matchId){
    const rows=await q("select * from perranporth.matches where match_id=$1 limit 1",[matchId]);
    if(rows.length){
      validMatch=rows[0];
      matchName=matchLabelDb(validMatch);
    }else{
      // Never let a stale/deleted voting match break the Player Portal.
      open=false;
      matchId="";
      matchName="";
      await setSettingDb("Voting Open",false);
      await setSettingDb("Voting Open Match ID","");
      await setSettingDb("Voting Match Name","");
    }
  }

  const ps=(await players(true)).map(x=>x.name);
  const payment=(matchId&&validMatch)?await paymentForMatch(matchId):{identifier:"",link:""};
  return{open,matchId,matchName,badgeUrl:norm(await setting("Voting Badge URL")),players:[...new Set(ps)],paymentIdentifier:payment.identifier||"",paymentLink:payment.link||""};
}
async function recordSubsResponseDb(matchId,playerName,value){
  const v=low(value);
  let raw="";
  if(v==="yes"||v==="paid")raw="Paid";
  else if(v==="no"||v==="not paid")raw="Not Paid";
  else if(v==="n/a")raw="N/A";
  if(!raw)return;
  await q("insert into perranporth.subs_status(match_id,player,raw_status,confirmed) values($1,$2,$3,false) on conflict(match_id,player) do update set raw_status=excluded.raw_status,confirmed=false,updated_at=now()",[matchId,playerName,raw]);
}
async function submitVoteDb(vote,forcedName=""){
  vote=vote||{};
  if(!bool(await setting("Voting Open")))throw new Error("Voting is currently closed.");
  const matchId=norm(await setting("Voting Open Match ID"));if(!matchId)throw new Error("No voting match is selected.");
  const m=await matchRow(matchId),matchName=matchLabelDb(m),allowed=(await players(true)).map(x=>x.name);
  if(forcedName)vote={...vote,name:forcedName};
  for(const k of ["three","two","one","dick","reason","name","subs"])if(!norm(vote[k]))throw new Error("Please complete all required fields.");
  if([vote.three,vote.two,vote.one,vote.dick].some(p=>norm(p).toUpperCase()==="N/A"))throw new Error("You must select a player for every voting category.");
  if(new Set([vote.three,vote.two,vote.one]).size!==3)throw new Error("Your 3, 2 and 1 point selections must be three different players.");
  for(const p of [vote.three,vote.two,vote.one,vote.dick])if(!allowed.includes(p))throw new Error("Invalid player selection.");
  const voter=norm(vote.name),key=normName(voter);
  const existing=await q("select id from perranporth.votes where match_id=$1 and lower(regexp_replace(trim(voter_name),'\\s+',' ','g'))=$2 order by id limit 1",[matchId,key]);
  if(existing.length){
    await q("update perranporth.votes set vote_timestamp=now(),match_name=$1,points_3=$2,points_2=$3,points_1=$4,dotd=$5,dotd_reason=$6,voter_name=$7,subs_paid=$8,source='Supabase web app' where id=$9",[matchName,norm(vote.three),norm(vote.two),norm(vote.one),norm(vote.dick),norm(vote.reason),voter,norm(vote.subs),existing[0].id]);
  }else{
    await q("insert into perranporth.votes(vote_timestamp,match_id,match_name,points_3,points_2,points_1,dotd,dotd_reason,voter_name,subs_paid,source,raw_data) values(now(),$1,$2,$3,$4,$5,$6,$7,$8,$9,'Supabase web app','{}'::jsonb)",[matchId,matchName,norm(vote.three),norm(vote.two),norm(vote.one),norm(vote.dick),norm(vote.reason),voter,norm(vote.subs)]);
  }
  await recordSubsResponseDb(matchId,voter,vote.subs);
  return{ok:true,match:matchName,updated:!!existing.length};
}
async function votingAdminData(){
  return{votingOpen:bool(await setting("Voting Open")),openMatchId:norm(await setting("Voting Open Match ID")),matchName:norm(await setting("Voting Match Name")),badgeUrl:norm(await setting("Voting Badge URL")),votingUrl:"https://PerranporthAFCMens.github.io/Perranporth/vote.html",matches:await matches(true),players:await players(true)};
}
async function openVotingDb(matchId){
  const m=await matchRow(matchId);
  await setSettingDb("Voting Open Match ID",matchId);
  await setSettingDb("Voting Match Name",matchLabelDb(m));
  await paymentForMatch(matchId);
  await setSettingDb("Voting Open",true);
  return votingAdminData();
}
async function closeVotingDb(){await setSettingDb("Voting Open",false);return votingAdminData();}
async function votingSnapshotDb(matchId){
  const m=await matchRow(matchId),targetName=matchLabelDb(m);
  const rows=await q("select * from perranporth.votes where match_id=$1 or (coalesce(match_id,'')='' and lower(trim(match_name))=lower($2)) order by id",[matchId,targetName]);
  const points={},counts={},dotd={},reasons={},voters=[];
  const add=(name,pts)=>{name=norm(name);if(!name)return;points[name]=(points[name]||0)+pts;if(!counts[name])counts[name]={three:0,two:0,one:0};if(pts===3)counts[name].three++;if(pts===2)counts[name].two++;if(pts===1)counts[name].one++;};
  for(const r of rows){add(r.points_3,3);add(r.points_2,2);add(r.points_1,1);const d=norm(r.dotd);if(d&&d!=="N/A"){dotd[d]=(dotd[d]||0)+1;const reason=norm(r.dotd_reason);if(reason){if(!reasons[d])reasons[d]=[];reasons[d].push(reason);}}const voter=norm(r.voter_name);if(voter)voters.push(voter);}
  const ranked=Object.entries(points).map(([player,score])=>({player,score,three:counts[player]?.three||0,two:counts[player]?.two||0,one:counts[player]?.one||0})).sort((a,b)=>b.score-a.score||b.three-a.three||b.two-a.two||b.one-a.one||a.player.localeCompare(b.player));
  let prev=null;for(let i=0;i<ranked.length;i++){const x=ranked[i],same=prev&&x.score===prev.score&&x.three===prev.three&&x.two===prev.two&&x.one===prev.one;x.rank=same?prev.rank:i+1;x.joint=!!same||(i+1<ranked.length&&ranked[i+1].score===x.score&&ranked[i+1].three===x.three&&ranked[i+1].two===x.two&&ranked[i+1].one===x.one);prev=x;}
  const dotdRows=Object.entries(dotd).map(([player,votes])=>({player,votes,reasons:reasons[player]||[]})).sort((a,b)=>b.votes-a.votes||a.player.localeCompare(b.player)),max=dotdRows.length?dotdRows[0].votes:0;
  const ps=await players(true),alias=new Map();for(const p of ps){alias.set(normName(p.name),p.name);if(p.alias)alias.set(normName(p.alias),p.name);}
  const voted=new Set();for(const v of voters){const x=alias.get(normName(v));if(x)voted.add(x);}
  return{matchId,matchName:targetName,ballots:rows.length,top3:ranked.filter(x=>x.rank<=3),dotd:dotdRows.filter(x=>x.votes>=Math.max(1,max-2)),dotdValidVotes:Object.values(dotd).reduce((a,b)=>a+b,0),voters,stillToVote:ps.map(p=>p.name).filter(n=>!voted.has(n))};
}
async function getPlayerSessionDb(token){
  const t=norm(token);if(!t)return null;
  await q("delete from perranporth.player_sessions where expires_at<=now()");
  const r=await q("select player,expires_at from perranporth.player_sessions where token=$1 and expires_at>now() limit 1",[t]);
  return r.length?{playerName:norm(r[0].player),expiresAt:new Date(r[0].expires_at).getTime()}:null;
}
async function portalPlayersDb(){
  const r=await q("select player,voting_alias,pin_chosen from perranporth.players where active=true order by player");
  return r.map(x=>({name:norm(x.player),alias:norm(x.voting_alias),pinChosen:!!x.pin_chosen}));
}
async function createPlayerSessionDb(playerName,pin){
  const name=norm(playerName),p=norm(pin);
  const r=await q("select player,active,portal_pin_hash,pin_chosen from perranporth.players where player=$1 and active=true limit 1",[name]);
  if(!r.length||!r[0].portal_pin_hash||await hash(name+"|"+p)!==String(r[0].portal_pin_hash))throw new Error("Player name or PIN is incorrect.");
  const token=crypto.randomUUID()+"-"+crypto.randomUUID(),exp=new Date(Date.now()+30*24*60*60*1000);
  await q("insert into perranporth.player_sessions(token,player,expires_at) values($1,$2,$3)",[token,name,exp]);
  const chosen=!!r[0].pin_chosen;return{token,playerName:name,expiresAt:exp.getTime(),pinChosen:chosen,mustChoosePin:!chosen};
}
async function createPlayerSetupSessionDb(playerName,dob){
  const name=norm(playerName),supplied=norm(dob);
  if(!name||!supplied)throw new Error("Select your name and enter your date of birth.");
  const r=await q("select player,active,pin_chosen,date_of_birth from perranporth.players where player=$1 and active=true limit 1",[name]);
  if(!r.length)throw new Error("Player not found.");
  if(r[0].pin_chosen)throw new Error("You already have a PIN. Use the normal login above, or ask management to reset it.");
  if(!r[0].date_of_birth)throw new Error("Your date of birth has not been added yet. Ask management to update your player record.");
  const saved=String(r[0].date_of_birth).slice(0,10);if(saved!==supplied)throw new Error("That date of birth does not match our records.");
  const token=crypto.randomUUID()+"-"+crypto.randomUUID(),exp=new Date(Date.now()+30*24*60*60*1000);
  await q("insert into perranporth.player_sessions(token,player,expires_at) values($1,$2,$3)",[token,name,exp]);
  return{token,playerName:name,expiresAt:exp.getTime(),pinChosen:false,mustChoosePin:true};
}
async function choosePlayerPinDb(token,newPin){
  const s=await getPlayerSessionDb(token);if(!s)throw new Error("Your player session has expired. Please log in again.");
  const p=norm(newPin);if(!/^\d{4}$/.test(p))throw new Error("Choose a 4-digit PIN.");
  const h=await hash(s.playerName+"|"+p);
  await q("update perranporth.players set portal_pin=$1,portal_pin_hash=$2,pin_chosen=true,pin_version=pin_version+1 where player=$3",[p,h,s.playerName]);
  return{ok:true,playerName:s.playerName};
}
async function resetPlayerPinDb(playerName,tempPin){
  const name=norm(playerName),p=norm(tempPin);if(!name)throw new Error("Select a player.");if(!/^\d{4}$/.test(p))throw new Error("Temporary PIN must be exactly 4 digits.");
  const h=await hash(name+"|"+p),r=await q("update perranporth.players set portal_pin=$1,portal_pin_hash=$2,pin_chosen=false,pin_version=pin_version+1 where player=$3 returning player",[p,h,name]);if(!r.length)throw new Error("Player not found.");
  await q("delete from perranporth.player_sessions where player=$1",[name]);
  return{ok:true,playerName:name,pinChosen:false};
}
function subsDisplay(raw,confirmed){raw=norm(raw);if(raw==="Paid")return confirmed?"Confirmed Paid":"Claims Paid";if(raw==="Not Paid")return"Not Paid";if(raw==="N/A")return"N/A";return"Unconfirmed";}
async function playedMatchIdsByPlayer(){
  const r=await q("select p.match_id,p.player,p.starter,p.minutes_played,p.notes,m.status,m.source,m.opponent from perranporth.player_match_data p join perranporth.matches m on m.match_id=p.match_id where m.status='Completed' and lower(coalesce(m.source,''))<>'trial' and coalesce(m.opponent,'') not ilike 'test%' and coalesce(m.opponent,'') not ilike 'testing%' and coalesce(m.opponent,'') not ilike 'trial%'");
  const map=new Map();for(const x of r){const used=!!x.starter||num(x.minutes_played)>0||low(x.notes).includes("used sub");if(!used)continue;if(!map.has(x.player))map.set(x.player,new Set());map.get(x.player).add(String(x.match_id));}return map;
}
async function playerSubsDb(playerName){
  const name=norm(playerName),played=(await playedMatchIdsByPlayer()).get(name)||new Set();
  const ms=(await q("select * from perranporth.matches where status='Completed' and lower(coalesce(source,''))<>'trial' and coalesce(opponent,'') not ilike 'test%' and coalesce(opponent,'') not ilike 'testing%' and coalesce(opponent,'') not ilike 'trial%' order by match_date desc")).filter(m=>played.has(String(m.match_id)));
  const sr=await q("select match_id,raw_status,confirmed from perranporth.subs_status where lower(player)=lower($1)",[name]),sm=new Map(sr.map(x=>[String(x.match_id),x]));
  const matchesOut=[];for(const m of ms){const x=sm.get(String(m.match_id)),pay=await paymentForMatch(String(m.match_id)),status=subsDisplay(x?.raw_status,!!x?.confirmed);matchesOut.push({matchId:String(m.match_id),date:dateText(m.match_date),match:matchLabelDb(m),rawStatus:norm(x?.raw_status),status,confirmed:!!x?.confirmed,paymentLink:pay.link});}
  const unpaid=matchesOut.filter(x=>x.status==="Not Paid"||x.status==="Unconfirmed"),amountDue=unpaid.length*3,identifier=name.replace(/[^A-Za-z0-9]/g,"")+"Subs";
  return{owed:unpaid.length,amountDue,totalPaymentLink:amountDue>0?"https://monzo.me/adamturner4/"+amountDue.toFixed(2)+"?h=CmJ3lb&d="+encodeURIComponent(identifier)+"&account_type=personal":"",unpaidMatches:unpaid,awaitingConfirmation:matchesOut.filter(x=>x.status==="Claims Paid").length,notPaid:matchesOut.filter(x=>x.status==="Not Paid").length,unconfirmed:matchesOut.filter(x=>x.status==="Unconfirmed").length,matches:matchesOut};
}
async function subsTrackerDb(){
  const ps=await players(true),played=await playedMatchIdsByPlayer(),ms=await q("select * from perranporth.matches where status='Completed' and lower(coalesce(source,''))<>'trial' and coalesce(opponent,'') not ilike 'test%' and coalesce(opponent,'') not ilike 'testing%' and coalesce(opponent,'') not ilike 'trial%' order by match_date desc");
  const statuses=await q("select * from perranporth.subs_status"),sm=new Map(statuses.map(x=>[String(x.match_id)+"|"+normName(x.player),x]));
  const matchRows=[];for(const m of ms){const pay=await paymentForMatch(String(m.match_id));matchRows.push({matchId:String(m.match_id),date:dateText(m.match_date),match:matchLabelDb(m),paymentIdentifier:pay.identifier,paymentLink:pay.link});}
  const result=[];
  for(const p of ps){const set=played.get(p.name)||new Set(),rows=[];for(const m of ms){if(!set.has(String(m.match_id)))continue;const x=sm.get(String(m.match_id)+"|"+normName(p.name)),status=subsDisplay(x?.raw_status,!!x?.confirmed),pay=await paymentForMatch(String(m.match_id));rows.push({matchId:String(m.match_id),date:dateText(m.match_date),match:matchLabelDb(m),rawStatus:norm(x?.raw_status),status,confirmed:!!x?.confirmed,paymentLink:pay.link});}
    const paymentDue=rows.filter(x=>x.status==="Not Paid"||x.status==="Unconfirmed").length,claimsPaid=rows.filter(x=>x.status==="Claims Paid").length,notPaid=rows.filter(x=>x.status==="Not Paid").length;
    result.push({name:p.name,matches:rows,outstanding:paymentDue+claimsPaid,paymentDue,claimsPaid,notPaid,amountDue:paymentDue*3,unpaidMatches:rows.filter(x=>x.status==="Not Paid"||x.status==="Unconfirmed")});
  }
  const debtors=result.filter(p=>p.amountDue>0).map(p=>({name:p.name,outstanding:p.outstanding,paymentDue:p.paymentDue,amountDue:p.amountDue,matches:p.unpaidMatches,claimsMatches:p.matches.filter(m=>m.status==="Claims Paid")})).sort((a,b)=>b.amountDue-a.amountDue||a.name.localeCompare(b.name));
  const pendingConfirmation=[];for(const p of result)for(const m of p.matches.filter(x=>x.status==="Claims Paid"))pendingConfirmation.push({player:p.name,matchId:m.matchId,date:m.date,match:m.match,paymentLink:m.paymentLink});
  return{players:result,matches:matchRows,debtors,pendingConfirmation,totalOutstandingGames:result.reduce((n,p)=>n+p.outstanding,0),totalPaymentDueGames:result.reduce((n,p)=>n+p.paymentDue,0),totalOutstandingAmount:result.reduce((n,p)=>n+p.amountDue,0),totalClaimsPaid:result.reduce((n,p)=>n+p.claimsPaid,0),totalNotPaid:result.reduce((n,p)=>n+p.notPaid,0)};
}
async function setSubsStatusDb(matchId,playerName,status){
  const id=norm(matchId),name=norm(playerName),s=norm(status);if(!id||!name)throw new Error("Match and player are required.");if(!["Confirmed Paid","Not Paid","N/A","Claims Paid",""].includes(s))throw new Error("Invalid subs status.");
  await paymentForMatch(id);let raw=s,confirmed=false;if(s==="Confirmed Paid"){raw="Paid";confirmed=true}else if(s==="Claims Paid"){raw="Paid";confirmed=false}
  await q("insert into perranporth.subs_status(match_id,player,raw_status,confirmed) values($1,$2,$3,$4) on conflict(match_id,player) do update set raw_status=excluded.raw_status,confirmed=excluded.confirmed,updated_at=now()",[id,name,raw,confirmed]);
  return subsTrackerDb();
}
function histKey(label){
  let s=low(label),venue="";const vm=[...s.matchAll(/\((h|a|n)\)/g)];if(vm.length)venue=vm[vm.length-1][1];
  s=s.replace(/\((h|a|n)\)/g," ").replace(/\([^)]*(ge cup|gec|jnr cup|junior cup|jc)[^)]*\)/g," ").replace(/\b(ge cup|gec|jnr cup|junior cup|jc)\b/g," ").replace(/\b(first|second|third|1st|2nd|2nds|3rd|3rds)\b/g," ").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();
  return venue+"|"+s;
}
async function historicalPlayerStatsDb(playerName,currentGameCount){
  const wanted=normName(playerName)==="gav counter"?"gavin counter":normName(playerName);
  const sr=await q("select * from perranporth.historic_player_season_stats where season='2025/26' and lower(player)=lower($1) limit 1",[wanted]);
  if(!sr.length)return null;const x=sr[0];
  const base={season:"2025/26",appearances:int(x.appearances),minutes:Math.round(num(x.total_minutes)),goals:int(x.goals),assists:int(x.assists),goalContributions:int(x.goals)+int(x.assists),full90s:int(x.full_90s),starts:0,cleanSheets:0};
  const allMatches=await q("select * from perranporth.historic_matches where season='2025/26' order by match_date asc,id asc");
  const mins=await q("select match_label,minutes from perranporth.historic_player_match_minutes where season='2025/26' and lower(player)=lower($1)",[wanted]),mm=new Map(mins.map(m=>[histKey(m.match_label),num(m.minutes)]));
  base.cleanSheets=allMatches.filter(m=>(mm.get(histKey(m.match_label))||0)>0&&int(m.opp_score)===0).length;
  const target=allMatches.slice(0,Math.max(0,int(currentGameCount))),keys=new Set(target.map(m=>histKey(m.match_label))),ev=await q("select * from perranporth.historic_events where season='2025/26' order by match_date,source_row");
  let apps=0,minutes=0,full90s=0,goals=0,assists=0,clean=0;const appeared=new Set();
  for(const m of target){const k=histKey(m.match_label),mn=mm.get(k)||0;if(mn>0){apps++;minutes+=mn;if(mn>=90)full90s++;appeared.add(k);if(int(m.opp_score)===0)clean++;}}
  for(const e of ev){const k=histKey(e.match_label);if(!keys.has(k)||e.event_type!=="Goal")continue;if(normName(e.player)===wanted){goals++;if(!appeared.has(k)){apps++;appeared.add(k)}}if(normName(e.secondary_player)===wanted){assists++;if(!appeared.has(k)){apps++;appeared.add(k)}}}
  base.sameStage={season:"2025/26",gamesCompared:target.length,appearances:apps,minutes:Math.round(minutes),goals,assists,goalContributions:goals+assists,full90s,cleanSheets:clean,starts:0};
  return base;
}
function topTotals(obj){return Object.entries(obj).map(([player,total])=>({player,total})).sort((a,b)=>b.total-a.total||a.player.localeCompare(b.player)).slice(0,5)}
async function historicalTeamStatsDb(currentGameCount){
  const d=await historicDashboardData(),goals={},assists={};for(const m of d.matches)for(const e of m.events||[]){if(e.type==="Goal"&&low(e.team)!=="opposition"){if(e.player)goals[e.player]=(goals[e.player]||0)+1;if(e.secondaryPlayer)assists[e.secondaryPlayer]=(assists[e.secondaryPlayer]||0)+1;}}
  const base={season:"2025/26",games:d.matches.length,goals:d.matches.reduce((n,m)=>n+int(m.ourScore),0),conceded:d.matches.reduce((n,m)=>n+int(m.oppScore),0),cleanSheets:d.matches.filter(m=>int(m.oppScore)===0).length,topScorers:topTotals(goals),topAssists:topTotals(assists),matches:d.matches.slice().reverse().slice(0,5)};
  const ms=d.matches.slice(0,Math.max(0,int(currentGameCount))),g={},a={};for(const m of ms)for(const e of m.events||[]){if(e.type==="Goal"&&low(e.team)!=="opposition"){if(e.player)g[e.player]=(g[e.player]||0)+1;if(e.secondaryPlayer)a[e.secondaryPlayer]=(a[e.secondaryPlayer]||0)+1;}}
  base.sameStage={season:"2025/26",games:ms.length,goals:ms.reduce((n,m)=>n+int(m.ourScore),0),conceded:ms.reduce((n,m)=>n+int(m.oppScore),0),cleanSheets:ms.filter(m=>int(m.oppScore)===0).length,topScorers:topTotals(g),topAssists:topTotals(a),matches:ms.slice().reverse().slice(0,5)};
  return base;
}

function isTestMatch_(m){
  if(!m)return false;
  const source=low(m.source),competition=low(m.competition),opponent=low(m.opponent);
  return source==="trial" || competition==="trial" ||
    opponent.startsWith("test") ||
    opponent.startsWith("testing") ||
    opponent.startsWith("trial") ||
    opponent.startsWith("voting test");
}
async function submitGhostTestVoteDb(token,playerName,vote){
  await auth(token,"read");
  const matchId=norm(await setting("Voting Open Match ID"));
  if(!bool(await setting("Voting Open"))||!matchId)throw new Error("Voting is not open.");
  const m=await matchRow(matchId);
  const isTest=low(m.source)==="trial"||low(m.competition)==="trial"||/^(test|testing|trial|voting test)\b/i.test(norm(m.opponent));
  if(!isTest)throw new Error("Ghost voting is only available for test/trial matches.");
  const p=(await players(true)).find(x=>x.name===norm(playerName));
  if(!p)throw new Error("Select an active player.");
  return submitVoteDb(vote||{},p.name);
}
async function buildPlayerPortalDb(playerName,ghostMode){
  const name=norm(playerName),pRows=await q("select * from perranporth.players where player=$1 limit 1",[name]);if(!pRows.length)throw new Error("Player not found.");const player=pRows[0];
  const pm=await q("select p.*,m.status,m.source,m.opponent from perranporth.player_match_data p join perranporth.matches m on m.match_id=p.match_id where p.player=$1 and lower(coalesce(m.source,''))<>'trial' and coalesce(m.opponent,'') not ilike 'test%' and coalesce(m.opponent,'') not ilike 'testing%' and coalesce(m.opponent,'') not ilike 'trial%'",[name]);
  const my={appearances:0,starts:0,minutes:0,goals:0,assists:0,yellow:0,red:0,cleanSheets:0};const appeared=new Set();
  for(const r of pm){const used=!!r.starter||num(r.minutes_played)>0||low(r.notes).includes("used sub");if(used){my.appearances++;appeared.add(String(r.match_id));}if(r.starter)my.starts++;my.minutes+=num(r.minutes_played);my.goals+=int(r.goals);my.assists+=int(r.assists);my.yellow+=int(r.yellow_cards);my.red+=int(r.red_cards);}
  const dash=await currentDashboardData();my.cleanSheets=dash.matches.filter(m=>appeared.has(String(m.matchId))&&int(m.oppScore)===0).length;
  const histSeason=await historicalPlayerStatsDb(name,dash.matches.length),histTeam=await historicalTeamStatsDb(dash.matches.length);
  const goalTotals={},assistTotals={};for(const m of dash.matches)for(const e of m.events||[]){if(e.type==="Goal"&&low(e.team)!=="opposition"){if(e.player)goalTotals[e.player]=(goalTotals[e.player]||0)+1;if(e.secondaryPlayer)assistTotals[e.secondaryPlayer]=(assistTotals[e.secondaryPlayer]||0)+1;}}
  const vote=await publicVotingData(),vr=vote.matchId?await q("select 1 from perranporth.votes where match_id=$1 and lower(regexp_replace(trim(voter_name),'\\s+',' ','g'))=$2 limit 1",[vote.matchId,normName(name)]):[];
  let testMode=false;
  if(vote.matchId){
    const vm=await q("select source,competition,opponent from perranporth.matches where match_id=$1 limit 1",[vote.matchId]);
    if(vm.length)testMode=isTestMatch_(vm[0]);
  }
  return{playerName:name,ghostMode:!!ghostMode,pinChosen:!!player.pin_chosen,badgeUrl:norm(await setting("Voting Badge URL")),season:norm(await setting("Season"))||"2026/27",historicalSeason:histSeason,historicalTeam:histTeam,my,team:{games:dash.matches.length,goals:dash.matches.reduce((a,m)=>a+int(m.ourScore),0),conceded:dash.matches.reduce((a,m)=>a+int(m.oppScore),0),cleanSheets:dash.matches.filter(m=>int(m.oppScore)===0).length,topScorers:topTotals(goalTotals),topAssists:topTotals(assistTotals),matches:dash.matches.slice().reverse().slice(0,5)},voting:{open:vote.open,matchId:vote.matchId,matchName:vote.matchName,players:vote.players,paymentIdentifier:vote.paymentIdentifier,paymentLink:vote.paymentLink,alreadyVoted:!!vr.length,testMode},subs:await playerSubsDb(name)};
}

async function handle(action,args){
  if(action==="createAdminSession")return createSession(args[0]);
  if(action==="verifyPin")return !!(await ctx(args[0]));
  if(action==="logoutAdminSession"){await q("delete from perranporth.admin_sessions where token=$1",[norm(args[0])]);return true;}
  if(action==="getPublicSpectatorData")return spectator();
  if(action==="getPublicDashboardData")return currentDashboardData();
  if(action==="getHistoricalDashboardData")return historicDashboardData();
  if(action==="getPublicVotingData")return publicVotingData();
  if(action==="submitVote")return submitVoteDb(args[0]||{});
  if(action==="getPortalPlayers")return portalPlayersDb();
  if(action==="createPlayerSession")return createPlayerSessionDb(args[0],args[1]);
  if(action==="createPlayerSetupSession")return createPlayerSetupSessionDb(args[0],args[1]);
  if(action==="verifyPlayerSession"){const s=await getPlayerSessionDb(args[0]);return s?{ok:true,playerName:s.playerName,expiresAt:s.expiresAt}:{ok:false};}
  if(action==="logoutPlayerSession"){await q("delete from perranporth.player_sessions where token=$1",[norm(args[0])]);return true;}
  if(action==="choosePlayerPin")return choosePlayerPinDb(args[0],args[1]);
  if(action==="getPlayerPortalData"){const s=await getPlayerSessionDb(args[0]);if(!s)throw new Error("Your player session has expired. Please log in again.");return buildPlayerPortalDb(s.playerName,false);}
  if(action==="submitPortalVote"){const s=await getPlayerSessionDb(args[0]);if(!s)throw new Error("Your player session has expired. Please log in again.");return submitVoteDb(args[1]||{},s.playerName);}
  const votingActions=new Set(["getVotingAdminData","getVotingSnapshot","openVoting","closeVoting"]);
  const subsActions=new Set(["getSubsTrackerData","setSubsStatus"]);
  const fullActions=new Set(["getAllPlayersForAdmin","addPlayer","updatePlayer","getPlayerPinAdminData","resetPlayerPin"]);
  const readActions=new Set(["getInitData","getMatches","getSeasonStats","getPlayerMinutesData","getGhostPlayerPortalDataDirect","submitGhostTestVote"]);
  const actionPerm=votingActions.has(action)?"voting":subsActions.has(action)?"subs":fullActions.has(action)?"*":readActions.has(action)?"read":"match";
  await auth(args[0],actionPerm);
  if(action==="getInitData")return initData();
  if(action==="getMatches")return matches(args[1]!==false);
  if(action==="getAllPlayersForAdmin")return allPlayers();
  if(action==="addPlayer")return addPlayer(args[1]||{});
  if(action==="updatePlayer")return updatePlayer(args[1],args[2]||{});
  if(action==="getSeasonStats")return seasonStats();
  if(action==="getPlayerMinutesData")return minutesData(args[1]);
  if(action==="getVotingAdminData")return votingAdminData();
  if(action==="openVoting")return openVotingDb(norm(args[1]));
  if(action==="closeVoting")return closeVotingDb();
  if(action==="getVotingSnapshot")return votingSnapshotDb(norm(args[1]));
  if(action==="getSubsTrackerData")return subsTrackerDb();
  if(action==="setSubsStatus")return setSubsStatusDb(args[1],args[2],args[3]);
  if(action==="getPlayerPinAdminData"){const r=await q("select player,active,pin_chosen from perranporth.players order by active desc,player");return r.map(x=>({name:norm(x.player),active:!!x.active,pinChosen:!!x.pin_chosen}));}
  if(action==="resetPlayerPin")return resetPlayerPinDb(args[1],args[2]);
  if(action==="getGhostPlayerPortalDataDirect"){const name=norm(args[1]);const p=(await players(true)).find(x=>x.name===name);if(!p)throw new Error("Select an active player.");return buildPlayerPortalDb(name,true);}
  if(action==="submitGhostTestVote")return submitGhostTestVoteDb(args[0],args[1],args[2]||{});
  if(action==="getSquad")return squad(norm(args[1]));
  if(action==="getLineup")return lineup(norm(args[1]));
  if(action==="getMatchSummary"||action==="getFullMatchSummary")return summary(norm(args[1]));
  if(action==="getMatchClock")return clock(norm(args[1]));
  if(action==="createMatch"){const d=args[1]||{},id="M"+new Date().toISOString().replace(/\D/g,"").slice(0,14);await q("insert into perranporth.matches(match_id,match_date,opponent,venue,competition,kickoff,status,formation,captain,notes,include,source,raw_data) values($1,$2,$3,$4,$5,$6,'Scheduled',$7,$8,$9,true,'Manual','{}'::jsonb)",[id,d.date||new Date().toISOString().slice(0,10),norm(d.opponent),norm(d.venue)||"Home",norm(d.competition)||"Other",d.kickoff||null,norm(d.formation),norm(d.captain),norm(d.notes)]);return id;}
  if(action==="createTrialMatch"){const tr=await q("select match_id from perranporth.matches where lower(source)='trial'");for(const t of tr){const id=String(t.match_id);await db.begin(async tx=>{for(const table of ["events","player_match_data","lineup_positions","votes","match_clocks"])await tx.unsafe("delete from perranporth."+table+" where match_id=$1",[id]);await tx.unsafe("delete from perranporth.matches where match_id=$1",[id]);});}const d=new Date(),id="TRIAL-"+new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/London",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit"}).format(d).replace(/\D/g,"").replace(/^(\d{8})(\d{6}).*/,"$1-$2");await q("insert into perranporth.matches(match_id,match_date,opponent,venue,competition,kickoff,status,notes,include,source,raw_data) values($1,$2,'Demo / Trial Match','Home','Trial',$3,'Scheduled','Temporary demo match — excluded from real match lists and season data.',true,'Trial','{}'::jsonb)",[id,new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/London"}).format(d),timeText(d)]);return id;}
  if(action==="deleteTrialMatch"){const id=norm(args[1]),m=await matchRow(id);if(low(m.source)!=="trial")throw new Error("Only trial matches can be deleted with this button.");await db.begin(async tx=>{for(const table of ["events","player_match_data","lineup_positions","votes","match_clocks"])await tx.unsafe("delete from perranporth."+table+" where match_id=$1",[id]);await tx.unsafe("delete from perranporth.matches where match_id=$1",[id]);});if(norm(await setting("Voting Open Match ID"))===id){await setSettingDb("Voting Open",false);await setSettingDb("Voting Open Match ID","");await setSettingDb("Voting Match Name","");}return true;}
  if(action==="saveSquad")return saveSquad(norm(args[1]),args[2]||[]);
  if(action==="addPlayerToLiveSquad"){const id=norm(args[1]),name=norm(args[2]),m=await matchRow(id);if(m.status!=="Live")throw new Error("Players can only be added this way while the match is live.");const p=(await players(true)).find(x=>x.name===name);if(!p)throw new Error("That player is not currently active in Manage Players.");const sq=await squad(id);if(!sq.length)throw new Error("No squad is saved for this match. All active players are already available for events.");if(sq.some(x=>x.player===name))return summary(id);await q("insert into perranporth.player_match_data(match_id,player,squad_status,starter,starting_position,shirt_no,minutes_played,goals,assists,yellow_cards,red_cards,notes,raw_data) values($1,$2,'Sub',false,$3,$4,0,0,0,0,0,'','{}'::jsonb)",[id,name,p.position,p.shirtNo]);return summary(id);}
  if(action==="saveLineup")return saveLineup(norm(args[1]),args[2]||{});
  if(action==="setStartingLineup")return starting(norm(args[1]),args[2]||{});
  if(action==="startMatch"){const id=norm(args[1]),m=await matchRow(id);if(m.status==="Completed")throw new Error("This match has already been completed.");if(m.status!=="Live"){await q("update perranporth.matches set status='Live' where match_id=$1",[id]);const n=Date.now();await writeClock({...defClock(id),startedAt:n,runningSince:n});if(low(m.source)!=="trial"&&low(m.competition)!=="trial")await openVotingDb(id);}return summary(id);}
  if(action==="toggleMatchClock"){const id=norm(args[1]);await notDone(id);let c=await rawClock(id);if(!c.startedAt){const n=Date.now();c={...defClock(id),startedAt:n,runningSince:n};}else{if(c.onBreak)throw new Error("Start the second half using the Half Time button.");if(c.runningSince){c.baseSeconds=elapsed(c);c.runningSince=null;}else c.runningSince=Date.now();}return pubClock(await writeClock(c));}
  if(action==="resetMatchClock"){const id=norm(args[1]);await notDone(id);return pubClock(await writeClock(defClock(id)));}
  if(action==="enterHalfTime"){const id=norm(args[1]);await notDone(id);let c=await rawClock(id);if(!c.startedAt)throw new Error("The match clock has not been started.");const e=elapsed(c);c.baseSeconds=e;c.runningSince=null;c.onBreak=true;c.half=1;c.firstHalfAddedMinutes=e<=2700?0:Math.max(0,Math.floor((e-2700)/60)+1);return pubClock(await writeClock(c));}
  if(action==="startSecondHalf"){const id=norm(args[1]);await notDone(id);let c=await rawClock(id);if(!c.startedAt)throw new Error("The match clock has not been started.");if(!c.onBreak)throw new Error("The match is not currently at half time.");c.half=2;c.baseSeconds=2700;c.runningSince=Date.now();c.onBreak=false;return pubClock(await writeClock(c));}
  if(action==="logEvent"){const e=args[1]||args[2];await notDone(e.matchId);await validEvent(e);const id="E"+crypto.randomUUID().replace(/-/g,"").slice(0,12);await q("insert into perranporth.events(event_id,match_id,minute,event_type,team,player,secondary_player,goal_type,touches,goal_zone,assist_zone,card_reason,notes,event_timestamp,raw_data) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now(),'{}'::jsonb)",[id,e.matchId,num(e.minute),norm(e.eventType),norm(e.team),norm(e.player),norm(e.secondaryPlayer),norm(e.goalType||e.restartPhase),e.touches===""?null:int(e.touches),norm(e.zone),norm(e.originZone),norm(e.cardReason),norm(e.notes)]);return summary(e.matchId);}
  if(action==="updateEvent"){const e=args[1]||args[2];await validEvent(e);const r=await q("update perranporth.events set minute=$1,event_type=$2,team=$3,player=$4,secondary_player=$5,goal_type=$6,touches=$7,goal_zone=$8,assist_zone=$9,card_reason=$10,notes=$11 where event_id=$12 and match_id=$13 returning event_id",[num(e.minute),norm(e.eventType),norm(e.team),norm(e.player),norm(e.secondaryPlayer),norm(e.goalType||e.restartPhase),e.touches===""?null:int(e.touches),norm(e.zone),norm(e.originZone),norm(e.cardReason),norm(e.notes),norm(e.eventId),norm(e.matchId)]);if(!r.length)throw new Error("Event not found.");await refreshStats(norm(e.matchId));return summary(norm(e.matchId));}
  if(action==="deleteEvent"){const eid=norm(args[1]),id=norm(args[2]),r=await q("delete from perranporth.events where event_id=$1 and match_id=$2 returning event_id",[eid,id]);if(!r.length)throw new Error("Event not found.");await refreshStats(id);return summary(id);}
  if(action==="deleteLastEvent"){const id=norm(args[1]);await notDone(id);const r=await q("select event_id from perranporth.events where match_id=$1 order by event_timestamp desc nulls last,event_id desc limit 1",[id]);if(r.length)await q("delete from perranporth.events where event_id=$1",[r[0].event_id]);return summary(id);}
  if(action==="finishMatch"){const id=norm(args[1]);await notDone(id);const ev=await events(id),sc=score(ev),snap=await clock(id);await q("update perranporth.matches set status='Completed',our_score=$1,opp_score=$2 where match_id=$3",[sc.ours,sc.opp,id]);let c=await rawClock(id),n=Date.now();c.baseSeconds=elapsed(c,n);c.runningSince=null;c.onBreak=false;c.finishedAt=n;await writeClock(c);await recalc(id,snap);return summary(id);}
  if(action==="reopenMatch"){const id=norm(args[1]),m=await matchRow(id);if(m.status!=="Completed")throw new Error("Only a completed match can be reopened.");await q("update perranporth.matches set status='Live' where match_id=$1",[id]);let c=await rawClock(id);c.finishedAt=null;c.onBreak=false;c.runningSince=null;await writeClock(c);return summary(id);}
  throw new Error("Unsupported Perranporth Supabase action: "+action);
}
Deno.serve(async req=>{if(req.method==="OPTIONS")return new Response("ok",{headers:CORS});if(req.method!=="POST")return fail("Method not allowed",405);try{const b=await req.json();return out(await handle(norm(b.action),Array.isArray(b.args)?b.args:[]));}catch(e){return fail(e instanceof Error?e.message:String(e),400);}});
