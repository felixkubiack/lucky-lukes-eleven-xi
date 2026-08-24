(() => {
'use strict';
const MODE=window.APP_MODE||(/admin\.html$/.test(location.pathname)?'admin':'player');
const SUPABASE_URL=window.LLX_SUPABASE_URL||'',SUPABASE_KEY=window.LLX_SUPABASE_KEY||'';
const WA='https://chat.whatsapp.com/D8peyB1ArekKODQgTfJtWV?s=cl&p=a&ilr=4';
const POLL=['Sehr gut','Gut','Okay','Nicht gut'];
const SLOTS=[['TW',50,88],['LV',18,70],['IV',39,70],['IV',61,70],['RV',82,70],['LM',18,47],['ZM',39,47],['ZM',61,47],['RM',82,47],['ST',38,20],['ST',62,20]];
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const uid=()=>crypto.randomUUID?.()||`${Date.now()}_${Math.random().toString(36).slice(2)}`;
const LOCAL_KEY='llx_shared_state_v4';
let state=null,adminTag=localStorage.getItem('llx_admin_tag')||'Admin';
let me=JSON.parse(localStorage.getItem('llx_me_v2')||'null')||{id:uid(),name:'',age:'',pos:'',joined:false};
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function blank(){return{version:0,members:[],applications:[],sessions:[],polls:[],notices:[],history:[],lineup:{starters:[],bench:[],slots:{}},adminAttendance:{},updatedAt:0}}
function saveMe(){localStorage.setItem('llx_me_v2',JSON.stringify(me))}
function normalizeLineup(s){
  const ids=new Set(s.members.map(m=>m.id));
  s.lineup.starters=s.lineup.starters.filter(id=>ids.has(id)).slice(0,11);
  s.lineup.bench=s.members.map(m=>m.id).filter(id=>!s.lineup.starters.includes(id));
  for(const id of Object.keys(s.lineup.slots)) if(!s.lineup.starters.includes(id)) delete s.lineup.slots[id];
}
function ended(x){return new Date(`${x.date}T${x.time}`).getTime()<Date.now()}
function autoPolls(s){
  for(const x of s.sessions.filter(ended)){
    if(!s.polls.some(p=>p.sessionId===x.id)) s.polls.push({id:uid(),sessionId:x.id,title:`Wie hat dir „${x.title}“ gefallen?`,votes:{},at:Date.now()});
  }
}
function normalize(s){
  s.members||=[];s.applications||=[];s.sessions||=[];s.polls||=[];s.notices||=[];s.history||=[];s.adminAttendance||={};
  s.lineup||={starters:[],bench:[],slots:{}};s.lineup.starters||=[];s.lineup.bench||=[];s.lineup.slots||={};
  autoPolls(s);normalizeLineup(s);return s;
}
function localRead(){try{return normalize(JSON.parse(localStorage.getItem(LOCAL_KEY)||'null')||blank())}catch{return blank()}}
function localWrite(s){localStorage.setItem(LOCAL_KEY,JSON.stringify(s))}
function supabaseReady(){return !!(SUPABASE_URL&&SUPABASE_KEY)}
function headers(extra={}){return{apikey:SUPABASE_KEY,'Content-Type':'application/json',...extra}}

async function ensureRemoteRow(){
  if(!supabaseReady())return;
  const r=await fetch(`${SUPABASE_URL}/rest/v1/club_state?id=eq.1&select=id`,{headers:headers(),cache:'no-store'});
  if(!r.ok)throw Error(`Supabase prüfen ${r.status}`);
  const rows=await r.json();
  if(rows.length)return;
  const init=blank();
  const c=await fetch(`${SUPABASE_URL}/rest/v1/club_state`,{
    method:'POST',
    headers:headers({Prefer:'return=minimal'}),
    body:JSON.stringify({id:1,version:0,data:init,updated_at:new Date().toISOString()})
  });
  if(!c.ok&&c.status!==409)throw Error(`Supabase initialisieren ${c.status}`);
}

async function read(){
  if(!supabaseReady())return localRead();
  try{
    await ensureRemoteRow();
    const r=await fetch(`${SUPABASE_URL}/rest/v1/club_state?id=eq.1&select=version,data,updated_at`,{headers:headers(),cache:'no-store'});
    if(!r.ok)throw Error(`Supabase lesen ${r.status}`);
    const rows=await r.json();
    if(!rows.length)return blank();
    const s=normalize({...blank(),...(rows[0].data||{})});
    s.version=Number(rows[0].version||0);
    s.updatedAt=rows[0].updated_at?Date.parse(rows[0].updated_at):Date.now();
    localWrite(s);
    return s;
  }catch(e){
    console.error(e);
    return localRead();
  }
}

async function put(base,s){
  const next=normalize({...s,version:Number(base||0)+1,updatedAt:Date.now()});
  if(!supabaseReady()){
    localWrite(next);
    return next;
  }
  const r=await fetch(
    `${SUPABASE_URL}/rest/v1/club_state?id=eq.1&version=eq.${encodeURIComponent(base)}`,
    {
      method:'PATCH',
      headers:headers({Prefer:'return=representation'}),
      body:JSON.stringify({version:next.version,data:next,updated_at:new Date(next.updatedAt).toISOString()})
    }
  );
  if(!r.ok)throw Error(`Supabase speichern ${r.status}`);
  const rows=await r.json();
  if(!rows.length)return null;
  localWrite(next);
  return next;
}

async function mutate(fn){
  for(let i=0;i<5;i++){
    const s=normalize(await read());
    const base=Number(s.version||0);
    fn(s);
    normalize(s);
    const saved=await put(base,s);
    if(saved){
      state=saved;
      return saved;
    }
  }
  throw Error('Datenkonflikt');
}

const member=()=>state?.members.find(m=>m.id===me.id);

function managerRank(){
  const m=state?.members.find(x=>x.name.toLowerCase()===adminTag.toLowerCase());
  return m?.rank==='VM'?'VM':'Admin';
}

function notify(s,target,title,text,page='home',type='info'){
  s.notices.push({id:uid(),target,title,text,page,type,at:Date.now()});
}

function seen(){
  try{return JSON.parse(localStorage.getItem('llx_seen_v2')||'[]')}
  catch{return[]}
}

function ownNotices(){
  if(!state)return[];
  let a=(state.notices||[]).filter(n=>MODE==='admin'?n.target==='admin':(n.target===me.id||n.target==='all'));
  if(MODE==='admin'){
    for(const x of state.applications.filter(a=>a.status==='pending')){
      if(!a.some(n=>n.id===`app:${x.id}`)){
        a.push({
          id:`app:${x.id}`,
          target:'admin',
          title:'Neue Bewerbung',
          text:`${x.name} möchte dem Verein beitreten.`,
          page:'applications',
          at:x.at
        });
      }
    }
  }
  return a.sort((a,b)=>b.at-a.at);
}

function unread(){
  const z=new Set(seen());
  return ownNotices().filter(n=>!z.has(n.id));
}

function toast(t,red=false){
  const x=$('#toast');
  if(!x)return;
  x.textContent=t;
  x.className=`toast${red?' red':''} show`;
  setTimeout(()=>x.classList.remove('show'),2600);
}

function bell(){
  const b=$('#bell');
  if(b)b.classList.toggle('unread',unread().length>0);
}

function noticePanel(){
  const p=$('#noticePanel');
  if(!p)return;
  const z=new Set(seen()),a=ownNotices();
  p.innerHTML='<b>Mitteilungen</b>'+(a.length
    ?a.map(n=>`<button class="notice ${z.has(n.id)?'read':''}" onclick="openNotice('${n.id}')"><b>${esc(n.title)}</b><br><small>${esc(n.text)}</small><br><small>${z.has(n.id)?'Gelesen':'Ungelesen'}</small></button>`).join('')
    :'<p class="muted">Keine Mitteilungen.</p>');
  p.classList.toggle('open');
}

function openNotice(id){
  const n=ownNotices().find(x=>x.id===id),z=seen();
  if(!z.includes(id))z.push(id);
  localStorage.setItem('llx_seen_v2',JSON.stringify(z));
  $('#noticePanel')?.classList.remove('open');
  $('#pink')?.classList.remove('show');
  bell();
  if(n)page(n.page||'home');
}

function popup(){
  const n=unread()[0];
  if(!n||sessionStorage.getItem('llx_popup_v2')===n.id)return;
  sessionStorage.setItem('llx_popup_v2',n.id);
  const p=$('#pink');
  if(p){
    p.innerHTML=`<b>${esc(n.title)}</b><br><small>${esc(n.text)}</small>`;
    p.classList.add('show');
    p.onclick=()=>openNotice(n.id);
  }
}

function nav(){
  const player=['home:Start','sessions:Einheiten','polls:Umfragen','lineup:Aufstellung','community:Community','profile:Profil'];
  const admin=['home:Start','sessions:Einheiten','polls:Umfragen','lineup:Aufstellung','rights:Spieler & Rechte','applications:Bewerbungen','history:Verlauf','community:Community','profile:Profil'];
  $('#nav').innerHTML=(MODE==='admin'?admin:player)
    .map(x=>{
      const[id,l]=x.split(':');
      return`<button data-page="${id}" onclick="page('${id}')">${l}</button>`;
    }).join('')+
    `<button id="bell" class="bell" onclick="noticePanel()">🔔<i class="dot"></i></button>`;
  $('#sub').textContent=MODE==='admin'?'Admin / VM':'Spielerportal';
}

function page(id){
  if(MODE==='player'&&!me.joined)return;
  document.body.dataset.page=id;
  $$('.page').forEach(x=>x.classList.remove('active'));
  $(`#${id}`)?.classList.add('active');
  $$('#nav [data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===id));
  render();
}

function validateJoin(){
  const n=$('#jName'),a=$('#jAge'),p=$('#jPos');
  let bad=false;
  [n,a,p].forEach(x=>x?.classList.remove('invalid'));
  if(!n?.value.trim()){n?.classList.add('invalid');bad=true}
  if(!a?.value||+a.value<1||+a.value>99){a?.classList.add('invalid');bad=true}
  if(!p?.value){p?.classList.add('invalid');bad=true}
  return!bad;
}

async function submitJoin(){
  if(!validateJoin())return;
  me.name=$('#jName').value.trim();
  me.age=+$('#jAge').value;
  me.pos=$('#jPos').value;
  saveMe();

  await mutate(s=>{
    if(!s.applications.some(a=>a.playerId===me.id&&a.status==='pending')){
      s.applications.push({
        id:uid(),
        playerId:me.id,
        name:me.name,
        age:me.age,
        pos:me.pos,
        status:'pending',
        at:Date.now()
      });
    }
    notify(s,'admin','Neue Bewerbung',`${me.name} möchte dem Verein beitreten.`,'applications','pink');
  });

  toast('Beitrittsanfrage gesendet');
  await tick();
}

async function decide(id,status){
  await mutate(s=>{
    const a=s.applications.find(x=>x.id===id);
    if(!a)return;
    a.status=status;
    a.decidedAt=Date.now();

    if(status==='approved'&&!s.members.some(m=>m.id===a.playerId)){
      const rank=s.members.length===0?'Ältester':'Mitglied';
      s.members.push({
        id:a.playerId,
        name:a.name,
        age:a.age,
        pos:a.pos,
        rank,
        attendance:{}
      });
      s.history.push({id:uid(),name:a.name,type:'Angenommen',rank,at:Date.now()});
      notify(s,a.playerId,'Aufgenommen',`Du wurdest als ${rank} aufgenommen.`,'home','green');
    }else if(status==='rejected'){
      notify(s,a.playerId,'Anfrage abgelehnt','Deine Beitrittsanfrage wurde abgelehnt.','home','red');
    }
  });
  await tick();
}

async function attend(id,v){
  await mutate(s=>{
    if(MODE==='admin'){
      s.adminAttendance[id]={status:v,at:Date.now()};
    }else{
      const m=s.members.find(x=>x.id===me.id);
      if(m){
        m.attendance||={};
        m.attendance[id]={status:v,at:Date.now()};
      }
    }
  });
  await tick();
}

async function addSession(){
  const title=$('#sTitle').value.trim();
  const loc=$('#sLoc').value.trim();
  const date=$('#sDate').value;
  const time=$('#sTime').value;
  if(!title||!date||!time)return toast('Bitte Einheit vervollständigen',true);

  await mutate(s=>s.sessions.push({
    id:uid(),
    title,
    loc,
    date,
    time,
    at:Date.now()
  }));

  await tick();
}

async function deleteSession(id){
  await mutate(s=>s.sessions=s.sessions.filter(x=>x.id!==id));
  await tick();
}

async function vote(id,opt){
  await mutate(s=>{
    const p=s.polls.find(x=>x.id===id);
    if(p)p.votes[me.id]={name:me.name,choice:opt,at:Date.now()};
  });
  await tick();
}

async function promote(id){
  await mutate(s=>{
    const m=s.members.find(x=>x.id===id);
    if(!m)return;
    if(managerRank()==='VM'&&m.rank==='VM')return;
    if(m.rank==='VM')return;
    m.rank=m.rank==='Mitglied'?'Ältester':'VM';
    notify(s,m.id,'Befördert',`Du wurdest zum ${m.rank} befördert.`,'profile','green');
  });
  await tick();
}

async function demote(id){
  await mutate(s=>{
    const m=s.members.find(x=>x.id===id);
    if(!m||m.rank==='Mitglied'||(managerRank()==='VM'&&m.rank==='VM'))return;
    m.rank='Mitglied';
    notify(s,m.id,'Degradiert','Du wurdest zum Mitglied degradiert.','profile','red');
  });
  await tick();
}

async function removeMember(id){
  await mutate(s=>{
    const m=s.members.find(x=>x.id===id);
    if(!m||(managerRank()==='VM'&&m.rank==='VM'))return;

    s.members=s.members.filter(x=>x.id!==id);
    s.history.push({id:uid(),name:m.name,type:'Entfernt',rank:m.rank,at:Date.now()});
    s.lineup.starters=s.lineup.starters.filter(x=>x!==id);
    s.lineup.bench=s.lineup.bench.filter(x=>x!==id);
    delete s.lineup.slots[id];

    notify(s,id,'Aus dem Verein entfernt','Du wurdest aus dem Verein entfernt.','home','red');
  });
  await tick();
}

async function leave(){
  if(!confirm('Möchtest du den Verein wirklich verlassen?'))return;

  await mutate(s=>{
    const m=s.members.find(x=>x.id===me.id);
    if(m){
      s.members=s.members.filter(x=>x.id!==me.id);
      s.history.push({id:uid(),name:m.name,type:'Verlassen',rank:m.rank,at:Date.now()});
      notify(s,'admin','Verein verlassen',`${m.name} hat den Verein verlassen.`,'history','red');
    }
  });

  me={id:uid(),name:'',age:'',pos:'',joined:false};
  saveMe();
  await tick();
}

async function movePlayer(id,to){
  if(MODE!=='admin')return;

  await mutate(s=>{
    normalizeLineup(s);

    s.lineup.starters=s.lineup.starters.filter(x=>x!==id);
    s.lineup.bench=s.lineup.bench.filter(x=>x!==id);
    delete s.lineup.slots[id];

    if(to==='bench'){
      s.lineup.bench.push(id);
      return;
    }

    const slot=Number(to);

    if(!Number.isInteger(slot)||slot<0||slot>=SLOTS.length){
      s.lineup.bench.push(id);
      return;
    }

    const occupied=Object.keys(s.lineup.slots)
      .find(pid=>pid!==id&&Number(s.lineup.slots[pid])===slot);

    if(occupied){
      s.lineup.starters=s.lineup.starters.filter(x=>x!==occupied);
      s.lineup.bench.push(occupied);
      delete s.lineup.slots[occupied];
    }

    if(s.lineup.starters.length>=11){
      s.lineup.bench.push(id);
      toast('Die Startelf ist bereits voll.',true);
      return;
    }

    s.lineup.starters.push(id);
    s.lineup.slots[id]=slot;
    s.lineup.bench=s.lineup.bench.filter(x=>x!==id);
  });

  closeLineupModal();
  await tick();
}

function openPlayerMenu(id){
  if(MODE!=='admin')return;

  const m=state?.members.find(x=>x.id===id);
  if(!m)return;

  $('#modalTitle').textContent=m.name;

  $('#modalOptions').innerHTML=
    `<button class="btn" onclick="movePlayer('${id}','bench')">Auf die Bank</button>`+
    SLOTS.map((s,i)=>`<button class="btn" onclick="movePlayer('${id}','${i}')">${s[0]} ${i+1}</button>`).join('');

  $('#lineupModal').classList.add('open');
}

function closeLineupModal(){
  $('#lineupModal')?.classList.remove('open');
}

function renderJoin(){
  if(MODE==='admin'){
    me.joined=true;
    $('#joinWrap').classList.add('hidden');
    $('#app').classList.remove('hidden');
    return;
  }

  const m=member();
  const pending=state.applications.find(a=>a.playerId===me.id&&a.status==='pending');

  if(m){
    me.joined=true;
    me.name=m.name;
    me.age=m.age;
    me.pos=m.pos;
    saveMe();

    $('#joinWrap').classList.add('hidden');
    $('#app').classList.remove('hidden');
  }else{
    me.joined=false;
    saveMe();

    $('#app').classList.add('hidden');
    $('#joinWrap').classList.remove('hidden');

    if(pending){
      $('#joinForm').classList.add('hidden');
      $('#joinState').innerHTML=
        '<div class="card"><h3 style="color:#79e2a4">Beitrittsanfrage gesendet</h3><p class="muted">Deine Anfrage wartet auf die Freigabe durch einen Admin.</p></div>';
    }else{
      $('#joinForm').classList.remove('hidden');
      $('#joinState').innerHTML='';
    }
  }
}

const storageStatus=()=>supabaseReady()?'Online-Sync':'Lokaler Modus';

function renderHome(){
  if(MODE==='admin'){
    $('#home').innerHTML=
      `<div class="status-strip">
        <span class="status-chip"><strong>${storageStatus()}</strong></span>
        <span class="status-chip">Rang: <strong>${managerRank()}</strong></span>
      </div>
      <div class="card">
        <h1>Lucky Luke's Eleven XI</h1>
        <div class="grid3">
          <div class="kpi"><b>${state.members.length}</b><div class="muted">Mitglieder</div></div>
          <div class="kpi"><b>${state.applications.filter(a=>a.status==='pending').length}</b><div class="muted">Bewerbungen</div></div>
          <div class="kpi"><b>${state.sessions.length}</b><div class="muted">Einheiten</div></div>
        </div>
      </div>`;
  }else{
    const xi=state.lineup.starters.includes(me.id);

    $('#home').innerHTML=
      `<div class="status-strip">
        <span class="status-chip"><strong>${storageStatus()}</strong></span>
        <span class="status-chip">Rang: <strong>${esc(member()?.rank||'Mitglied')}</strong></span>
      </div>
      <div class="card">
        <h1>Willkommen im Verein</h1>
        <p class="${xi?'yes':'muted'}">
          ${xi?'Du bist in der Startelf.':'Du bist aktuell nicht in der Startelf.'}
        </p>
      </div>`;
  }
}

function renderSessions(){
  const mine=id=>MODE==='admin'
    ?state.adminAttendance[id]?.status
    :member()?.attendance?.[id]?.status;

  $('#sessions').innerHTML=
    (MODE==='admin'
      ?`<div class="card">
          <h2>Einheit erstellen</h2>
          <div class="grid">
            <label>Titel<input id="sTitle"></label>
            <label>Ort<input id="sLoc"></label>
            <label>Datum<input id="sDate" type="date"></label>
            <label>Uhrzeit<input id="sTime" type="time"></label>
          </div>
          <button class="btn primary" style="margin-top:10px" onclick="addSession()">Erstellen</button>
        </div>`
      :'')
    +
    (state.sessions.map(s=>{
      const st=mine(s.id);
      const others=state.members.filter(m=>MODE==='admin'||m.id!==me.id);

      return`
        <div class="card">
          <h3>${esc(s.title)}</h3>
          <p class="muted">${esc(s.loc||'')} · ${esc(s.date)} · ${esc(s.time)}</p>

          <div class="actions" style="justify-content:flex-start">
            <button class="btn green" onclick="attend('${s.id}','yes')">
              ${st==='yes'?'Nehme teil':'Teilnehmen'}
            </button>

            <button class="btn red" onclick="attend('${s.id}','no')">
              ${st==='no'?'Nehme nicht teil':'Absagen'}
            </button>

            ${MODE==='admin'
              ?`<button class="btn red" onclick="deleteSession('${s.id}')">Löschen</button>`
              :''}
          </div>

          <h4 style="margin-top:14px">Teilnehmende</h4>

          ${MODE==='player'
            ?`<div class="row">
                <span>Admin</span>
                <span class="pill">
                  ${state.adminAttendance[s.id]?.status==='yes'
                    ?'Nimmt teil'
                    :state.adminAttendance[s.id]?.status==='no'
                    ?'Nimmt nicht teil'
                    :'Offen'}
                </span>
              </div>`
            :''}

          ${others.map(m=>`
            <div class="row">
              <span>${esc(m.name)}</span>
              <span class="pill">
                ${m.attendance?.[s.id]?.status==='yes'
                  ?'Nimmt teil'
                  :m.attendance?.[s.id]?.status==='no'
                  ?'Nimmt nicht teil'
                  :'Offen'}
              </span>
            </div>
          `).join('')}
        </div>`;
    }).join('')
    ||
    '<div class="card muted">Keine Einheiten vorhanden.</div>');
}

function renderPolls(){
  const canPrivate=MODE==='admin'||member()?.rank==='VM';

  $('#polls').innerHTML=
    state.polls.map(p=>{
      const vals=Object.values(p.votes||{});

      return`
        <div class="card">
          <h3>${esc(p.title)}</h3>

          ${POLL.map(o=>{
            const n=vals.filter(v=>v.choice===o).length;
            const pc=vals.length?Math.round(n/vals.length*100):0;

            return`
              <div class="poll">
                <div>${o} <b>${pc}%</b></div>
                <div class="bar">
                  <i style="width:${pc}%"></i>
                </div>
              </div>`;
          }).join('')}

          ${MODE==='player'
            ?`<div class="actions" style="justify-content:flex-start">
                ${POLL.map(o=>`
                  <button class="btn" onclick="vote('${p.id}','${o}')">${o}</button>
                `).join('')}
              </div>`
            :''}

          ${canPrivate
            ?`<h4 style="margin-top:14px">Private Einzelstimmen</h4>
              ${vals.map(v=>`
                <div class="row">
                  <span>${esc(v.name)}</span>
                  <b>${esc(v.choice)}</b>
                </div>
              `).join('')
              ||'<p class="muted">Noch keine Stimmen.</p>'}`
            :''}
        </div>`;
    }).join('')
    ||
    '<div class="card muted">Nach einer abgelaufenen Einheit erscheint hier automatisch eine Umfrage.</div>';
}

function renderLineup(){
  normalizeLineup(state);

  const starts=state.lineup.starters
    .map(id=>state.members.find(m=>m.id===id))
    .filter(Boolean);

  const bench=state.lineup.bench
    .map(id=>state.members.find(m=>m.id===id))
    .filter(Boolean);

  $('#lineup').innerHTML=
    `<div class="card">
      <h2>Aufstellung</h2>

      <div class="pitch" ondragover="event.preventDefault()" ondrop="dropPitch(event)">
        ${SLOTS.map((s,i)=>`
          <div
            class="slot"
            data-slot="${i}"
            style="left:${s[1]}%;top:${s[2]}%"
            ondragover="event.preventDefault()"
            ondrop="dropSlot(event,${i})"
          >
            ${s[0]}
          </div>
        `).join('')}

        ${starts.map(m=>{
          const i=state.lineup.slots[m.id]??0;
          const s=SLOTS[i]||SLOTS[0];

          return`
            <button
              class="player"
              draggable="${MODE==='admin'}"
              ondragstart="dragPlayer(event,'${m.id}')"
              style="left:${s[1]}%;top:${s[2]}%"
              onclick="openPlayerMenu('${m.id}')"
            >
              ${esc(m.name)}
              <small><br>${s[0]}</small>
            </button>`;
        }).join('')}
      </div>

      <h3 style="margin-top:14px">Bank</h3>

      <div class="bench" ondragover="event.preventDefault()" ondrop="dropBench(event)">
        ${bench.map(m=>`
          <button
            class="player"
            draggable="${MODE==='admin'}"
            ondragstart="dragPlayer(event,'${m.id}')"
            onclick="openPlayerMenu('${m.id}')"
          >
            ${esc(m.name)}
          </button>
        `).join('')}
      </div>

      ${MODE==='admin'
        ?'<p class="muted" style="margin-top:10px">Spieler antippen und Position wählen. „Auf die Bank“ verschiebt ihn zurück.</p>'
        :''}
    </div>`;
}

function dragPlayer(e,id){
  e.dataTransfer.setData('text/plain',id);
}

function dropSlot(e,i){
  e.preventDefault();
  const id=e.dataTransfer.getData('text/plain');
  if(id)movePlayer(id,String(i));
}

function dropBench(e){
  e.preventDefault();
  const id=e.dataTransfer.getData('text/plain');
  if(id)movePlayer(id,'bench');
}

function dropPitch(e){
  e.preventDefault();
}

function renderRights(){
  if(MODE!=='admin')return;

  const mgr=managerRank();

  $('#rights').innerHTML=
    `<div class="card">
      <h2>Spieler & Rechte</h2>

      ${state.members.map(m=>{
        const block=mgr==='VM'&&m.rank==='VM';

        return`
          <div class="row">
            <div>
              <b>${esc(m.name)}</b>
              <div class="muted">${esc(m.pos)} · ${esc(m.rank)}</div>
            </div>

            <div class="actions">
              <button
                class="btn"
                ${block?'disabled':''}
                onclick="promote('${m.id}')"
              >
                ${m.rank==='Mitglied'
                  ?'Zum Ältesten'
                  :m.rank==='Ältester'
                  ?'Zum VM'
                  :'Höchster Rang'}
              </button>

              <button
                class="btn"
                ${(m.rank==='Mitglied'||block)?'disabled':''}
                onclick="demote('${m.id}')"
              >
                Degradieren
              </button>

              <button
                class="btn red"
                ${block?'disabled':''}
                onclick="removeMember('${m.id}')"
              >
                Aus Verein werfen
              </button>
            </div>
          </div>`;
      }).join('')
      ||
      '<p class="muted">Noch keine Mitglieder.</p>'}
    </div>`;
}

function renderApplications(){
  if(MODE!=='admin')return;

  const a=state.applications.filter(x=>x.status==='pending');

  $('#applications').innerHTML=
    `<div class="card">
      <h2>Bewerbungen</h2>

      ${a.map(x=>`
        <div class="row">
          <div>
            <b>${esc(x.name)}</b>
            <div class="muted">${esc(x.pos)} · ${x.age} Jahre</div>
          </div>

          <div class="actions">
            <button class="btn green" onclick="decide('${x.id}','approved')">
              Annehmen
            </button>

            <button class="btn red" onclick="decide('${x.id}','rejected')">
              Ablehnen
            </button>
          </div>
        </div>
      `).join('')
      ||
      '<p class="muted">Keine offenen Bewerbungen.</p>'}
    </div>`;
}

function renderHistory(){
  if(MODE!=='admin')return;

  $('#history').innerHTML=
    `<div class="card">
      <h2>Spielerverlauf</h2>

      ${[...state.history].reverse().map(h=>`
        <div class="row">
          <span>${esc(h.name)}</span>
          <span>${esc(h.type)} ${h.rank?'· '+esc(h.rank):''}</span>
        </div>
      `).join('')
      ||
      '<p class="muted">Noch keine Einträge.</p>'}
    </div>`;
}

function renderCommunity(){
  $('#community').innerHTML=
    `<div class="card">
      <h2>Community</h2>

      <a
        class="btn primary"
        style="display:block;text-decoration:none;text-align:center;margin-bottom:9px"
        href="${WA}"
        target="_blank"
      >
        WhatsApp Community
      </a>

      <button class="btn" style="width:100%" disabled>
        Discord – Link noch nicht hinterlegt
      </button>
    </div>`;
}

function renderProfile(){
  if(MODE==='admin'){
    $('#profile').innerHTML=
      `<div class="card">
        <h2>Profil</h2>

        <label>
          Gamer-Tag
          <input id="aTag" value="${esc(adminTag)}">
        </label>

        <p class="muted">Rang: ${managerRank()}</p>

        <button class="btn primary" onclick="saveAdmin()">
          Speichern
        </button>
      </div>`;
  }else{
    const m=member();

    $('#profile').innerHTML=
      `<div class="card">
        <h2>Profil</h2>

        <p><b>${esc(m?.name||me.name)}</b></p>

        <p class="muted">
          ${esc(m?.pos||me.pos)}
          · ${m?.age||me.age} Jahre
          · ${esc(m?.rank||'Mitglied')}
        </p>

        <button
          class="btn red"
          style="width:100%"
          onclick="leave()"
        >
          Verein verlassen
        </button>
      </div>`;
  }
}

function saveAdmin(){
  adminTag=$('#aTag').value.trim()||'Admin';
  localStorage.setItem('llx_admin_tag',adminTag);
  toast('Profil gespeichert');
}

function render(){
  if(!state)return;

  renderJoin();

  if(MODE==='player'&&!me.joined){
    bell();
    return;
  }

  renderHome();
  renderSessions();
  renderPolls();
  renderLineup();
  renderRights();
  renderApplications();
  renderHistory();
  renderCommunity();
  renderProfile();
  bell();
}

async function tick(){
  try{
    state=normalize(await read());

    if(MODE==='player'){
      const m=member();

      if(m&&!me.joined){
        me.joined=true;
        me.name=m.name;
        me.age=m.age;
        me.pos=m.pos;
        saveMe();
        toast('Du wurdest aufgenommen.');
      }

      if(me.joined&&!m){
        me.joined=false;
        saveMe();
      }
    }

    render();
    popup();

  }catch(e){
    console.error(e);
    toast('Verbindungsfehler – bitte neu laden',true);
  }
}

async function enableNotifications(){
  if('Notification' in window){
    const p=await Notification.requestPermission();

    if(p==='granted'){
      localStorage.setItem('llx_notify_asked','1');
      $('#permission')?.classList.remove('show');
      toast('Benachrichtigungen aktiviert');
    }
  }
}

function dismissPermission(){
  localStorage.setItem('llx_notify_asked','1');
  $('#permission')?.classList.remove('show');
}

Object.assign(window,{
  page,
  noticePanel,
  openNotice,
  submitJoin,
  decide,
  attend,
  addSession,
  deleteSession,
  vote,
  promote,
  demote,
  removeMember,
  leave,
  openPlayerMenu,
  closeLineupModal,
  movePlayer,
  dragPlayer,
  dropSlot,
  dropBench,
  dropPitch,
  saveAdmin,
  enableNotifications,
  dismissPermission
});

document.addEventListener('DOMContentLoaded',()=>{
  nav();

  if($('#brand')){
    $('#brand').onclick=()=>page('home');
  }

  navigator.serviceWorker
    ?.register('sw.js')
    .catch(()=>{});

  if(
    !localStorage.getItem('llx_notify_asked') &&
    'Notification' in window &&
    Notification.permission==='default'
  ){
    setTimeout(
      ()=>$('#permission')?.classList.add('show'),
      1200
    );
  }

  tick();
  setInterval(tick,1800);
});

window.addEventListener('storage',e=>{
  if(e.key===LOCAL_KEY){
    tick();
  }
});

})();
       
