/* FreightKit site search (header button, "/" or Ctrl+K) and recently used tools.
   Loaded by app.js, or directly on pages that do not use app.js. */
(()=>{
'use strict';
if(window.FK_SEARCH_LOADED)return;window.FK_SEARCH_LOADED=true;
const FK_BASE=window.FK_BASE_URL||(()=>{try{const src=document.currentScript&&document.currentScript.src;if(src)return new URL('../../',src).href;}catch(_){}return '/';})();
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* ---------- Site-wide search (header button, "/" or Ctrl+K) and recently used tools ----------
   The index (assets/js/search-index.js) is made by scripts/build-search-index.py and loaded on first use.
   Recently used tools are kept only in this browser (localStorage). */
const FK_RECENT_KEY='fk_recent';
function fkRecent(){let list=[];try{list=JSON.parse(localStorage.getItem(FK_RECENT_KEY)||'[]');}catch(_){}return Array.isArray(list)?list.filter(x=>x&&x.u&&x.t):[];}
function fkRememberPage(){
  try{
    const path=decodeURI(location.pathname);const base=decodeURI(new URL(FK_BASE).pathname);
    if(!path.startsWith(base))return;const rel=path.slice(base.length);
    if(!/^(tools\/[^/]+\/|document-process\/|custom-calculator\/)$/.test(rel))return;
    const h1=document.querySelector('main h1');const title=(h1?h1.textContent:document.title.replace(/\s*\|.*$/,'')).trim();
    const list=fkRecent().filter(x=>x.u!==rel);list.unshift({u:rel,t:title,at:Date.now()});
    localStorage.setItem(FK_RECENT_KEY,JSON.stringify(list.slice(0,8)));
  }catch(_){}
}
function fkRenderRecent(){
  const box=document.getElementById('fk-recent');if(!box)return;const list=fkRecent();
  if(!list.length){box.hidden=true;return;}
  box.hidden=false;const ul=box.querySelector('[data-recent-list]');
  ul.innerHTML=list.slice(0,6).map(x=>'<a class="recent-chip" href="'+esc(FK_BASE+x.u)+'">'+esc(x.t)+'</a>').join('');
}
let fkIndexPromise=null;
function fkLoadIndex(){
  if(window.FK_SEARCH_INDEX)return Promise.resolve(window.FK_SEARCH_INDEX);
  if(!fkIndexPromise)fkIndexPromise=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=FK_BASE+'assets/js/search-index.js';s.onload=()=>resolve(window.FK_SEARCH_INDEX||[]);s.onerror=()=>{fkIndexPromise=null;reject(new Error('Search is unavailable right now.'));};document.head.appendChild(s);});
  return fkIndexPromise;
}
function fkEscapeRx(w){return w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
function fkSearch(index,query){
  const words=query.toLowerCase().split(/\s+/).filter(Boolean);if(!words.length)return [];
  return index.map(item=>{
    const t=item.t.toLowerCase(),d=(item.d||'').toLowerCase(),x=(item.x||'').toLowerCase(),k=item.k.toLowerCase();let score=0;
    for(const w of words){
      let s=0;
      if(t.startsWith(w))s=10;else if(new RegExp('\\b'+fkEscapeRx(w)).test(t))s=7;else if(t.includes(w))s=5;else if(x.includes(w))s=3;else if(d.includes(w))s=2;else if(k.includes(w))s=1;
      if(!s)return null;score+=s;
    }
    if(item.k==='Tool'||item.k==='Workflow')score+=0.5;
    return {item,score};
  }).filter(Boolean).sort((a,b)=>b.score-a.score||a.item.t.localeCompare(b.item.t)).slice(0,12).map(r=>r.item);
}
function fkSetupSearch(){
  const navBar=document.querySelector('header.site .nav');if(!navBar||document.getElementById('fk-search'))return;
  const icon='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
  const btn=document.createElement('button');btn.type='button';btn.className='site-search-btn';btn.setAttribute('aria-haspopup','dialog');btn.setAttribute('aria-label','Search FreightKit');
  btn.innerHTML=icon+'<span>Search</span><kbd>/</kbd>';
  const toggle=navBar.querySelector('.mobile-menu-toggle');navBar.insertBefore(btn,toggle||navBar.querySelector('nav'));
  const dlg=document.createElement('div');dlg.id='fk-search';dlg.className='fk-search';dlg.hidden=true;dlg.setAttribute('role','dialog');dlg.setAttribute('aria-modal','true');dlg.setAttribute('aria-label','Search FreightKit');
  dlg.innerHTML='<div class="fk-search-box"><div class="fk-search-input">'+icon+'<input type="search" id="fk-search-input" placeholder="Search tools, templates, guides…" autocomplete="off" aria-controls="fk-search-results" aria-label="Search FreightKit"><button type="button" class="fk-search-close" aria-label="Close search">Esc</button></div><div id="fk-search-results" class="fk-search-results" role="listbox" aria-label="Search results"></div><p class="fk-search-foot">↑ ↓ to move · Enter to open · Esc to close</p></div>';
  document.body.appendChild(dlg);
  const input=dlg.querySelector('input'),results=dlg.querySelector('#fk-search-results');let items=[],active=0,lastFocus=null;
  const draw=()=>{
    const empty=input.value.trim()?'Nothing found. Try a shorter word such as “cost”, “stock” or “invoice”.':'Type to search all calculators, workflows, templates and guides.';
    results.innerHTML=items.length?items.map((it,i)=>'<a role="option" id="fk-opt-'+i+'" class="fk-result'+(i===active?' is-active':'')+'" href="'+esc(FK_BASE+it.u)+'"'+(it.k.startsWith('Template')?' download':'')+' aria-selected="'+(i===active)+'"><span class="fk-result-kind">'+esc(it.k)+'</span><strong>'+esc(it.t)+'</strong><span class="fk-result-desc">'+esc(it.d||'')+'</span></a>').join(''):'<p class="fk-search-empty">'+empty+'</p>';
    input.setAttribute('aria-activedescendant',items.length?'fk-opt-'+active:'');
  };
  const POPULAR=['document-process/','tools/volumetric-weight/','tools/landed-cost/','tools/container-load/','tools/safety-stock/','templates/'];
  const update=()=>{const q=input.value.trim();fkLoadIndex().then(index=>{
    if(q)items=fkSearch(index,q);
    else{const recent=fkRecent().map(r=>index.find(i=>i.u===r.u)).filter(Boolean);items=(recent.length?recent:POPULAR.map(u=>index.find(i=>i.u===u)).filter(Boolean)).slice(0,6);}
    active=0;draw();}).catch(err=>{results.innerHTML='<p class="fk-search-empty">'+esc(err.message)+'</p>';});};
  const open=()=>{lastFocus=document.activeElement;dlg.hidden=false;document.body.classList.add('fk-search-open');input.value='';update();setTimeout(()=>input.focus(),0);};
  const close=()=>{dlg.hidden=true;document.body.classList.remove('fk-search-open');if(lastFocus&&lastFocus.focus)lastFocus.focus();};
  btn.addEventListener('click',open);
  document.addEventListener('click',e=>{if(e.target.closest('[data-open-search]')){e.preventDefault();open();}});
  dlg.addEventListener('click',e=>{if(e.target===dlg||e.target.closest('.fk-search-close'))close();});
  input.addEventListener('input',update);
  input.addEventListener('keydown',e=>{
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(!items.length)return;active=(active+(e.key==='ArrowDown'?1:items.length-1))%items.length;draw();const el=document.getElementById('fk-opt-'+active);if(el)el.scrollIntoView({block:'nearest'});}
    else if(e.key==='Enter'){const el=document.getElementById('fk-opt-'+active);if(el){e.preventDefault();el.click();}}
    else if(e.key==='Escape'){e.preventDefault();close();}
  });
  document.addEventListener('keydown',e=>{
    const typing=e.target.closest&&e.target.closest('input,textarea,select,[contenteditable]');
    if((e.key==='k'||e.key==='K')&&(e.ctrlKey||e.metaKey)){e.preventDefault();if(dlg.hidden)open();else close();return;}
    if(e.key==='/'&&!typing&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!document.getElementById('tool-search')&&!document.getElementById('template-search')){e.preventDefault();open();}
    if(e.key==='Escape'&&!dlg.hidden)close();
  });
}
const fkStart=()=>{fkSetupSearch();fkRememberPage();fkRenderRecent();};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',fkStart);else fkStart();

})();
