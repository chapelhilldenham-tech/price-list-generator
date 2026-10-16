'use strict';
const $ = id => document.getElementById(id);
const PULL_URL = 'https://github.com/chapelhilldenham-tech/price-list-generator-src/actions/workflows/prices.yml';
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const LIST_KEY = 'plg_covered_v1', Z_KEY = 'plg_zanibal_v1', ZOPT_KEY = 'plg_zanibal_opts', MODE_KEY = 'plg_mode', OK_KEY = 'plg_unlock_', OK_DAYS = 30;
const COLS = [
  ['sec', 'Ticker'], ['prev', 'Prev close'], ['open', 'Open'], ['high', 'High'], ['low', 'Low'], ['close', 'Close'],
  ['chg', 'Change'], ['pct', '% change'], ['deals', 'Deals'], ['volume', 'Volume'], ['value', 'Value (₦)'], ['spark', '10 days'],
];
const S = { index: null, teamList: [], all: [], day: null, file: null, hist: {}, histDates: [], sort: ['sec', 1], q: '', show: 'all',
  z: { chd: [], held: {} }, zEnc: null, zReady: false, mode: 'research', listMode: 'research', access: {} };

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n2 = v => v === null || v === undefined || isNaN(v) ? '—' : Number(v).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const n0 = v => v === null || v === undefined || isNaN(v) ? '—' : Number(v).toLocaleString('en-NG', { maximumFractionDigits: 0 });
const big = v => { v = Number(v) || 0; return v >= 1e9 ? (v / 1e9).toFixed(2) + 'bn' : v >= 1e6 ? (v / 1e6).toFixed(2) + 'm' : n0(v); };
const pctTxt = p => `${p > 0 ? '+' : ''}${(p * 100).toFixed(2)}%`;
const cls = v => v > 0 ? 'up' : v < 0 ? 'down' : 'flat';
const longDate = d => { const [y, m, dd] = d.split('-').map(Number); return `${dd} ${MONTHS[m - 1]} ${y}`; };
const dayName = d => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short' });
const ls = { get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }, set(k, v){ try{ v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); }catch(e){} } };
async function getJSON(u){ const r = await fetch(u + (u.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' }); if(!r.ok) throw new Error(`${u}: HTTP ${r.status}`); return r.json(); }
function save(blob, name){ const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 30000); }

// ---------- the lists ----------
function covered(){ try{ const own = JSON.parse(ls.get(LIST_KEY) || 'null'); if(Array.isArray(own) && own.length) return own; }catch(e){} return S.teamList; }
function zList(){ try{ const own = JSON.parse(ls.get(Z_KEY) || 'null'); if(Array.isArray(own) && own.length) return own; }catch(e){} return S.z.chd; }
function allList(){ const s = new Set(S.all.map(a => a.secId)); (S.file ? S.file.rows : []).forEach(r => s.add(r.sec)); return [...s]; }
function listFor(mode){ return mode === 'chd' ? zList() : mode === 'all' ? allList() : covered(); }
function nameOf(sec){ return (S.all.find(a => a.secId === sec) || {}).name || ''; }

// rows for a list on the chosen day, with change worked out
function rowsFor(list){
  const byId = {}; (S.file ? S.file.rows : []).forEach(r => byId[r.sec] = r);
  return list.slice().sort().map(sec => {
    const r = byId[sec];
    if(!r || r.close === null || r.close === undefined) return { sec, name: nameOf(sec), miss: true };
    const chg = r.prev ? r.close - r.prev : 0, pct = r.prev ? chg / r.prev : 0;
    return { ...r, name: r.name || nameOf(sec), chg, pct };
  });
}
function topN(have, sign){ return have.filter(r => sign > 0 ? r.pct > 0 : r.pct < 0).sort((a, b) => sign > 0 ? b.pct - a.pct : a.pct - b.pct).slice(0, 10); }
function spark(sec){
  const pts = S.histDates.map(d => ((S.hist[d] || {})[sec] || {}).close).filter(v => v !== undefined && v !== null);
  if(pts.length < 2) return '';
  const lo = Math.min(...pts), hi = Math.max(...pts), w = 84, h = 22, k = hi - lo || 1;
  const xy = pts.map((v, i) => `${(i * (w - 4) / (pts.length - 1) + 2).toFixed(1)},${(h - 3 - (v - lo) * (h - 6) / k).toFixed(1)}`).join(' ');
  const c = pts[pts.length - 1] > pts[0] ? 'var(--up)' : pts[pts.length - 1] < pts[0] ? 'var(--down)' : 'var(--dim)';
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${xy}" fill="none" stroke="${c}" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
}

// ---------- the blotter ----------
function render(){
  if(S.mode === 'chd' && chdLocked()) S.mode = 'research';
  let all = rowsFor(listFor(S.mode));
  const hidden = S.mode === 'all' ? all.filter(r => r.miss).length : 0;
  if(S.mode === 'all') all = all.filter(r => !r.miss);
  const have = all.filter(r => !r.miss);
  const up = have.filter(r => r.pct > 0), down = have.filter(r => r.pct < 0), flat = have.filter(r => !r.pct);
  const sum = k => have.reduce((a, r) => a + (Number(r[k]) || 0), 0);
  const w = x => have.length ? (x.length / have.length * 100).toFixed(1) + '%' : '0';
  $('tiles').innerHTML = [
    ['Trading day', S.day ? `${dayName(S.day)} ${longDate(S.day)}` : '—', `<div class="breadth" title="Advancing, unchanged, declining"><i style="width:${w(up)};background:var(--up)"></i><i style="width:${w(flat)};background:var(--dim)"></i><i style="width:${w(down)};background:var(--down)"></i></div>`],
    ['Up · down · flat', `<span class="up">${up.length}</span> · <span class="down">${down.length}</span> · ${flat.length}`],
    ['Value traded', `<small>₦</small>${big(sum('value'))}`], ['Volume', big(sum('volume'))], ['Deals', n0(sum('deals'))],
  ].map(([k, v, x]) => `<div class="tile"><div class="k">${k}</div><div class="v">${v}</div>${x || ''}</div>`).join('');
  $('tiles').firstElementChild.querySelector('.v').style.fontSize = '17px';

  let list = all;
  const q = S.q.trim().toUpperCase();
  if(q) list = list.filter(r => r.sec.includes(q) || String(r.name || '').toUpperCase().includes(q));
  if(S.show === 'up') list = list.filter(r => r.pct > 0);
  if(S.show === 'down') list = list.filter(r => r.pct < 0);
  if(S.show === 'flat') list = list.filter(r => !r.miss && !r.pct);
  if(S.show === 'traded') list = list.filter(r => Number(r.deals) > 0);
  const [k, dir] = S.sort;
  list.sort((a, b) => (a.miss - b.miss) || (k === 'sec' ? a.sec.localeCompare(b.sec) * dir : ((Number(a[k]) || 0) - (Number(b[k]) || 0)) * dir));
  $('thead').innerHTML = COLS.map(([c, l]) => `<th data-k="${c}" class="${c === k ? 'on' : ''}" ${c === 'spark' ? '' : `aria-sort="${c === k ? (dir > 0 ? 'ascending' : 'descending') : 'none'}"`}>${l}${c === k ? (dir > 0 ? ' ↑' : ' ↓') : ''}</th>`).join('');
  $('tbody').innerHTML = list.map(r => r.miss
    ? `<tr class="miss"><td>${esc(r.sec)}<small>${esc(r.name)}</small></td><td colspan="11" class="l">No MyWealth price for ${S.day ? longDate(S.day) : 'this day'}</td></tr>`
    : `<tr><td>${esc(r.sec)}${r.name ? `<small>${esc(r.name)}</small>` : ''}</td><td>${n2(r.prev)}</td><td>${n2(r.open)}</td><td>${n2(r.high)}</td><td>${n2(r.low)}</td>
      <td class="cl">${n2(r.close)}</td><td class="${cls(r.chg)}">${r.chg > 0 ? '+' : ''}${n2(r.chg)}</td>
      <td><span class="chg ${cls(r.pct)}">${pctTxt(r.pct)}</span></td>
      <td>${n0(r.deals)}</td><td>${n0(r.volume)}</td><td>${n2(r.value)}</td><td>${spark(r.sec)}</td></tr>`).join('')
    || `<tr class="miss"><td colspan="12" class="l" style="padding:18px 16px">Nothing to show.</td></tr>`;
  $('count').textContent = `${list.length} shown${hidden ? ` · ${hidden} with no price hidden` : ''}`;
  const mv = (arr, c) => arr.length ? arr.map(r => `<div class="mv"><b>${esc(r.sec)}</b><span>${n2(r.close)} <span class="${c}">${pctTxt(r.pct)}</span></span></div>`).join('') : '<div class="note">None.</div>';
  $('gain').innerHTML = mv(topN(have, 1), 'up');
  $('lose').innerHTML = mv(topN(have, -1), 'down');
  const counts = { research: covered().length, chd: zList().length, all: allList().length };
  $('seg').querySelectorAll('button').forEach(b => { b.classList.toggle('on', b.dataset.l === S.mode); b.setAttribute('aria-pressed', String(b.dataset.l === S.mode));
    const lockd = b.dataset.l === 'chd' && chdLocked();
    b.innerHTML = lockd ? `CHD <svg class="lk" viewBox="0 0 24 24" aria-label="locked"><rect x="5" y="11" width="14" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>` : `${{ research: 'Research', chd: 'CHD', all: 'All NGX' }[b.dataset.l]} (${counts[b.dataset.l]})`; });
  $('editList').hidden = S.mode === 'all';
  $('subtitle').textContent = { research: 'research list', chd: 'CHD securities', all: 'all equities' }[S.mode];
  let m = '';
  if(S.file && S.file.source && S.file.source !== 'mywealth') m += `<div class="warn">These figures are a <b>${esc(S.file.source)}</b>, not a MyWealth pull. The site switches to MyWealth once the GitHub Action has run.</div>`;
  const miss = all.filter(r => r.miss).length;
  if(miss && S.file && S.file.source === 'mywealth') m += `<div class="warn">${miss} securit${miss === 1 ? 'y has' : 'ies have'} no MyWealth price for this day (in grey). If a ticker is spelled differently on MyWealth, fix it under Downloads → Edit lists.</div>`;
  if(S.fromLink) m += `<div class="warn">Opened with a ${S.fromLink === 'zanibal' ? 'CHD' : 'research'} list from a shared link; it's now saved on this computer.</div>`;
  if(S.mode === 'research' && covered() !== S.teamList) m += ownNote('research', covered(), S.teamList);
  if(S.mode === 'chd' && zList() !== S.z.chd) m += ownNote('zanibal', zList(), S.z.chd);
  $('msgs').innerHTML = m;
  if($('dZan').open) zRender();
  if($('dRes').open) resInfo();
}
function ownNote(which, mine, shared){
  const added = mine.filter(s => !shared.includes(s)), removed = shared.filter(s => !mine.includes(s));
  return `<div class="warn">Using this computer's own ${which === 'zanibal' ? 'CHD' : 'research'} list: ${added.length} added${added.length ? ` (${esc(added.slice(0, 6).join(', '))}${added.length > 6 ? '…' : ''})` : ''}, ${removed.length} removed.<button data-reset="${which}">Back to the shared list</button></div>`;
}
// The pull schedule, in Lagos time (UTC+1, no daylight saving): the "CHD price pull" scheduled task on Fola's PC
// starts it at 16:00 on weekdays (local/install_task.ps1). Extra pulls (Pull fresh prices now, GitHub's own
// timer when it fires) just make the data fresher.
const LAGOS = 60 * 60000;
function pullSlots(){ return [16 * 60]; }
function nextPull(now){
  const l = new Date(now + LAGOS);                     // "Lagos clock" read with the UTC getters
  for(let add = 0; add < 8; add++){
    const d = new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate() + add)), wd = d.getUTCDay();
    if(wd === 0 || wd === 6) continue;
    const mins = add ? -1 : l.getUTCHours() * 60 + l.getUTCMinutes();
    const slot = pullSlots().find(t => t > mins);
    if(slot !== undefined) return new Date(d.getTime() + slot * 60000 - LAGOS);
  }
  return null;
}
function prevPull(now){ // the most recent scheduled slot at or before now
  const l = new Date(now + LAGOS);
  for(let back = 0; back < 8; back++){
    const d = new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate() - back)), wd = d.getUTCDay();
    if(wd === 0 || wd === 6) continue;
    const mins = back ? 24 * 60 : l.getUTCHours() * 60 + l.getUTCMinutes();
    const slot = pullSlots().filter(t => t <= mins).pop();
    if(slot !== undefined) return new Date(d.getTime() + slot * 60000 - LAGOS);
  }
  return null;
}
const hm = d => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' });
const dhm = d => d.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' });
function ago(mins){ return mins < 1 ? 'just now' : mins < 60 ? mins + ' min ago' : mins < 1440 ? Math.round(mins / 60) + ' h ago' : Math.round(mins / 1440) + ' days ago'; }
function stamp(){
  const ix = S.index || {}, when = ix.updatedAt ? new Date(ix.updatedAt) : null, now = Date.now();
  if(!when){ $('stamp').textContent = 'No data yet'; return; }
  const mins = Math.round((now - when) / 60000);
  const due = prevPull(now), next = nextPull(now);
  // late = a scheduled pull should have landed (allowing 12 min for GitHub's queue and the Pages deploy) but hasn't
  const late = ix.source === 'mywealth' && due && when < due && now - due > 12 * 60000;
  const nextTxt = !next ? '' : (new Date(next).toDateString() === new Date(now).toDateString() ? `next pull ${hm(next)}` : `next pull ${dhm(next)}`);
  $('stamp').innerHTML = `<span class="dot ${late ? 'late' : mins < 40 ? '' : 'old'}"></span>Prices as of <b>${dhm(when)}</b> <span class="ago">(${ago(mins)})</span><br>${late ? `<span class="lateTxt">The ${hm(due)} pull is running late</span> · ` : ''}${nextTxt}<span id="stampMsg" class="smsg"></span>`;
  flash();
  $('about').innerHTML = `Data: <b>${esc(ix.source || '—')}</b>${ix.equities ? ` · ${ix.equities} NGX equities on MyWealth` : ''}${(ix.errors || []).length ? ` · ${ix.errors.length} suspended/unknown ticker(s) skipped` : ''}.<br>Prices are pulled from MyWealth at 16:00 on weekdays, after the close, and on demand (Downloads → Pull fresh prices now).<br>Research list: ${S.teamList.length} securities · CHD list: ${chdLocked() ? 'locked' : S.z.chd.length}.`;
}
setInterval(stamp, 60000);   // keep "x min ago" and "next pull" current between checks
function dayOptions(ix){ return ix.dates.map((d, i) => `<option value="${d}">${dayName(d)} ${longDate(d)}${i === 0 ? ' (latest)' : ''}</option>`).join(''); }
async function loadDay(d){
  S.day = d; S.file = null; render();
  try{ S.file = await getJSON(`data/prices/${d}.json`); }catch(e){ $('msgs').innerHTML = `<div class="warn">Couldn't load ${esc(d)}: ${esc(e.message)}</div>`; }
  S.hist[d] = Object.fromEntries((S.file ? S.file.rows : []).map(r => [r.sec, r]));
  const i = S.index.dates.indexOf(d);
  S.histDates = S.index.dates.slice(i, i + 10).reverse();
  render();
  await Promise.all(S.histDates.filter(x => !S.hist[x]).map(async x => { try{ const f = await getJSON(`data/prices/${x}.json`); S.hist[x] = Object.fromEntries(f.rows.map(r => [r.sec, r])); }catch(e){ S.hist[x] = {}; } }));
  if(S.day === d) render();
}
async function loadAccess(){ try{ S.access = await getJSON('data/access.json'); }catch(e){ S.access = {}; } if(S.zReady && S.zEnc && !isOpen('zanibal')){ clearZ(); if(S.day) render(); } lockBadges(); }
async function boot(){
  try{
    const [ix, team] = await Promise.all([getJSON('data/index.json'), getJSON('securities.json')]);
    try{ const o = JSON.parse(ls.get(ZOPT_KEY) || 'null'); if(o){ $('zhl').checked = !!o.hl; $('zfill').checked = !!o.fill; } }catch(e){}
    S.index = ix; S.teamList = (team.covered || []).map(s => String(s).trim().toUpperCase()).filter(Boolean);
    try{ S.all = await getJSON('data/securities_all.json'); }catch(e){ S.all = S.teamList.map(s => ({ secId: s, name: '' })); }
  }catch(e){ $('stamp').textContent = 'Couldn\'t load the data'; $('msgs').innerHTML = `<div class="warn">${esc(e.message)}. If you opened the file directly, run a local server instead (see README).</div>`; return; }
  const m = ls.get(MODE_KEY); if(['research', 'chd', 'all'].includes(m)) S.mode = m;
  await loadAccess();
  await loadChd();
  S.fromLink = listFromLink();
  $('day').innerHTML = dayOptions(S.index);
  stamp();
  if(S.index.dates.length) await loadDay(S.index.dates[0]);
}
// every 5 minutes: new pull? reload the index (and the day, if you're on the latest) and the passwords file
// Check for a newer pull: every 5 minutes on its own, on the Refresh button, and every 20 s for a while after
// "Pull fresh prices" (the GitHub run plus the Pages deploy take about 2 minutes).
let checking = false, watchUntil = 0, lastMsg = '';
async function refresh(manual){
  if(checking) return; checking = true;
  const btn = $('refreshBtn'); if(manual) btn.classList.add('spin');
  let news = false;
  try{
    loadAccess();
    const ix = await getJSON('data/index.json');
    if(ix.updatedAt !== (S.index || {}).updatedAt){
      news = true; watchUntil = 0;
      const onLatest = S.day === (S.index || {}).latest, cur = $('day').value;
      S.index = ix;
      $('day').innerHTML = dayOptions(ix);
      $('day').value = onLatest ? ix.latest : cur;
      delete S.hist[$('day').value];
      await loadDay($('day').value);
    }
    lastMsg = news ? 'New prices loaded' : manual ? 'Checked: this is the newest pull' : lastMsg;
  }catch(e){ if(manual) lastMsg = 'Couldn\'t check: ' + e.message; }
  finally{ checking = false; btn.classList.remove('spin'); stamp(); }
}
function flash(){ const el = $('stampMsg'); if(el && lastMsg){ el.textContent = lastMsg; clearTimeout(flash.t); flash.t = setTimeout(() => { lastMsg = ''; el.textContent = ''; }, 8000); } }
setInterval(() => refresh(false), 300000);
setInterval(() => { if(watchUntil && Date.now() < watchUntil) refresh(false); else watchUntil = 0; }, 20000);

// ---------- download passwords ----------
// data/access.json holds, per download, a PBKDF2-SHA256 hash of the password (made by scripts/set_password.py from
// the repository secrets). The page hashes what you type and compares. A soft gate: it keeps casual visitors out.
const hexBytes = h => new Uint8Array((h.match(/../g) || []).map(b => parseInt(b, 16)));
const toHex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
async function pbkdf2(pw, saltHex, iter){
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw.normalize('NFC')), 'PBKDF2', false, ['deriveBits']);
  return toHex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: hexBytes(saltHex), iterations: iter }, key, 256));
}
// ---------- the CHD list: published only as data/zanibal.enc.json (AES-GCM, key from the Zanibal password) ----------
function setZ(z){ S.z = { chd: (z.chd || []).map(x => String(x).trim().toUpperCase()), held: z.held || {} }; S.zReady = true; }
function clearZ(){ S.z = { chd: [], held: {} }; S.zReady = false; if(S.mode === 'chd') S.mode = 'research'; }
async function chdKey(pw, enc){ return pbkdf2(pw, enc.salt, enc.iter); }
async function decryptChd(enc, keyHex){
  const key = await crypto.subtle.importKey('raw', hexBytes(keyHex), 'AES-GCM', false, ['decrypt']);
  const ct = Uint8Array.from(atob(enc.ct), c => c.charCodeAt(0));
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: hexBytes(enc.nonce), additionalData: new TextEncoder().encode('plg-chd-v1') }, key, ct);
  return JSON.parse(new TextDecoder().decode(plain));
}
async function loadChd(){
  try{ S.zEnc = await getJSON('data/zanibal.enc.json'); }catch(e){ S.zEnc = null; }
  if(!S.zEnc){ clearZ(); return; }
  const r = unlockRec('zanibal');
  if(isOpen('zanibal') && r && r.key){ try{ setZ(await decryptChd(S.zEnc, r.key)); return; }catch(e){} }
  clearZ();
}
const chdLocked = () => !S.zReady;
const gate = kind => (S.access || {})[kind];
// An unlock is remembered on this computer (this browser) for OK_DAYS days, or until the password is changed,
// whichever comes first. Another browser or computer asks again.
function unlockRec(kind){ try{ return JSON.parse(ls.get(OK_KEY + kind) || 'null'); }catch(e){ return null; } }
const isOpen = kind => { if(kind === 'research') return true; const g = gate(kind), r = unlockRec(kind); return !!(g && g.hash && r && r.hash === g.hash && Date.now() - r.at < OK_DAYS * 864e5); };
function lockBadges(){
  const g = gate('zanibal'), el = $('lk-zanibal');
  el.textContent = !g || !S.zEnc ? 'Not set up' : isOpen('zanibal') && S.zReady ? 'Unlocked' : 'CHD password'; el.classList.toggle('open', isOpen('zanibal') && S.zReady);
  $('pwAge').textContent = g && g.changedAt ? `CHD password last changed ${new Date(g.changedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}.` : 'CHD password: not set up yet.';
}
let pending = null, pendingThen = null;
function askPassword(kind, then){
  pending = kind; pendingThen = then || null;
  const label = kind === 'research' ? 'the research price list' : 'the CHD view and the Zanibal CSV';
  $('dPassT').textContent = kind === 'research' ? 'Research price list' : 'CHD view';
  $('pwErr').textContent = ''; $('pw').value = '';
  if(!gate(kind) || (kind === 'zanibal' && !S.zEnc)){
    $('passWhy').innerHTML = `No password has been set up for ${label} yet, so it stays locked. IT sets it once as the <code>DOWNLOAD_PASSWORD_${kind.toUpperCase()}</code> repository secret (Downloads → Passwords explains how).`;
    $('pw').disabled = $('pwGo').disabled = true;
  } else {
    $('passWhy').textContent = kind === 'research' ? 'Enter the research team\'s download password. Ask the research lead if you don\'t have it.' : 'Enter the CHD password. It opens the CHD view, its list and the Zanibal CSV on this computer.';
    $('pw').disabled = $('pwGo').disabled = false;
  }
  $('dPass').showModal(); if(!$('pw').disabled) $('pw').focus();
}
function openDl(kind){
  if(kind === 'csv') return blotterCsv();
  if(kind === 'lists') return openLists(S.mode === 'chd' && !chdLocked() ? 'zanibal' : 'research');
  if(kind === 'help'){ lockBadges(); return $('dHelp').showModal(); }
  if(kind === 'pull'){ window.open(PULL_URL, '_blank', 'noopener'); watchUntil = Date.now() + 6 * 60000; lastMsg = 'Waiting for the new pull (about 2 min)…'; stamp(); return; }
  if(!S.day) return;
  if(kind === 'research') return showDl('research');
  if(isOpen(kind) && S.zReady) return showDl(kind);
  askPassword(kind, () => showDl(kind));
}
function showDl(kind){ if(kind === 'research'){ resInfo(); $('dRes').showModal(); } else { zRender(); $('dZan').showModal(); } }
$('passForm').onsubmit = async e => {
  e.preventDefault();
  const kind = pending, g = gate(kind), pw = $('pw').value;
  if(!g || !pw) return;
  if(!window.crypto || !crypto.subtle){ $('pwErr').textContent = 'This browser can\'t check the password here (the page must be opened over https).'; return; }
  $('pwGo').disabled = true; $('pwGo').textContent = 'Checking…';
  try{
    const h = await pbkdf2(pw, g.salt, g.iter);
    if(h === g.hash){
      const rec = { hash: g.hash, at: Date.now() };
      if(kind === 'zanibal' && S.zEnc){ rec.key = await chdKey(pw, S.zEnc); setZ(await decryptChd(S.zEnc, rec.key)); }
      ls.set(OK_KEY + kind, JSON.stringify(rec)); lockBadges(); $('dPass').close();
      const then = pendingThen; pendingThen = null; render(); if(then) then();
    }
    else { $('pwErr').textContent = 'That password isn\'t right.'; $('pw').select(); }
  }catch(err){ $('pwErr').textContent = 'Couldn\'t check the password: ' + err.message; }
  finally{ $('pwGo').disabled = false; $('pwGo').textContent = 'Unlock'; }
};
$('lockAll').onclick = () => { ['research', 'zanibal'].forEach(k => ls.set(OK_KEY + k, null)); clearZ(); lockBadges(); $('dHelp').close(); render(); };

// ---------- the research Excel: the team's own workbook, refilled ----------
// assets/pricelist-template.xlsx is their sheet as they make it (logo, rule image, header fills, fonts, the
// red/amber/green colour scale and the ▲▼ triangle icons on % CHANGE, no gridlines). Rows 1-6 are kept byte for
// byte; rows from 7 are rewritten with the day's figures using the template's own cell styles.
const XL = { s: { gainEndTxt: 25, gainEndPx: 26, gainEndPct: 27, loseEndTxt: 25, loseEndPx: 29, loseEndPct: 30, body: 17, pct: 18, deals: 19, big: 20, lastBody: 34, lastPct: 35, lastDeals: 36, lastBig: 37, txt: 1, gainPx: 21, gainPct: 22, losePx: 28, losePct: 23, tail: 25, tailPx: 38 } };
const xnum = v => v === null || v === undefined || v === '' || isNaN(v) ? null : String(Number(v));
const xesc = v => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function xc(ref, style, v, str){
  if(str) return `<c r="${ref}" s="${style}" t="inlineStr"><is><t>${xesc(v)}</t></is></c>`;
  const n = xnum(v);
  return n === null ? `<c r="${ref}" s="${style}"/>` : `<c r="${ref}" s="${style}"><v>${n}</v></c>`;
}
function excelSerial(iso){ const [y, m, d] = iso.split('-').map(Number); return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000); }
function xlName(){ const [y, m, dd] = S.day.split('-').map(Number); return `${dd}_${MONTHS[m - 1]}_${y}.xlsx`; }
function resInfo(){
  const all = rowsFor(covered()), have = all.filter(r => !r.miss);
  $('resInfo').innerHTML = `<b>${esc(xlName())}</b><br>${have.length} of ${all.length} securities priced for ${esc(longDate(S.day))}${all.length - have.length ? ` · ${all.length - have.length} left blank (no MyWealth price)` : ''}.${covered() !== S.teamList ? '<br><span class="pill">Uses this computer\'s own research list.</span>' : ''}${(S.access || {}).excel ? '<br><span class="pill">Protected: it opens and prints as normal, but can\'t be edited without the Excel password (IT).</span>' : ''}`;
  $('xlsx').disabled = !have.length;
}
async function buildXlsx(){
  if(!window.JSZip){ $('resInfo').innerHTML += '<div class="err">The Excel library is still loading (or blocked). Try again in a moment.</div>'; return; }
  const btn = $('xlsx'); btn.disabled = true; btn.textContent = 'Building…';
  try{
    const all = rowsFor(covered()), have = all.filter(r => !r.miss), d = S.day;
    const tpl = await (await fetch('assets/pricelist-template.xlsx', { cache: 'no-store' })).arrayBuffer();
    const zip = await JSZip.loadAsync(tpl);
    const path = 'xl/worksheets/sheet1.xml';
    let x = await zip.file(path).async('string');
    const a = x.indexOf('<sheetData>'), b = x.indexOf('</sheetData>');
    const head = x.slice(a + 11, b).match(/<row r="[1-6]"[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g) || [];
    if(head.length < 6) throw new Error('the template sheet has changed');
    head[0] = head[0].replace(/(<c r="E1" s="\d+")(?:\/>|>[\s\S]*?<\/c>)/, `$1><v>${excelSerial(d)}</v></c>`);
    const gain = topN(have, 1), lose = topN(have, -1), S2 = XL.s;
    const last = 6 + all.length, end = Math.max(last + 4, 29);   // their sheet keeps 4 empty styled rows under the list
    const out = [];
    for(let R = 7; R <= end; R++){
      const r = all[R - 7], isLast = R === last, cells = [];
      if(!r && R > last && R <= last + 4) cells.push(`<c r="A${R}" s="${S2.body}"/><c r="B${R}" s="${S2.body}"/><c r="C${R}" s="${S2.body}"/><c r="D${R}" s="${S2.body}"/><c r="E${R}" s="${S2.body}"/><c r="F${R}" s="${S2.body}"/><c r="G${R}" s="${S2.body}"/><c r="H${R}" s="${S2.pct}"/><c r="I${R}" s="${S2.deals}"/><c r="J${R}" s="${S2.big}"/><c r="K${R}" s="${S2.big}"/>`);
      if(r){
        const st = isLast ? [S2.lastBody, S2.lastPct, S2.lastDeals, S2.lastBig] : [S2.body, S2.pct, S2.deals, S2.big];
        cells.push(xc(`A${R}`, st[0], r.sec, true));
        if(r.miss) ['B', 'C', 'D', 'E', 'F', 'G'].forEach(c => cells.push(xc(`${c}${R}`, st[0], null))), cells.push(xc(`H${R}`, st[1], null), xc(`I${R}`, st[2], null), xc(`J${R}`, st[3], null), xc(`K${R}`, st[3], null));
        else {
          [['B', r.prev], ['C', r.open], ['D', r.high], ['E', r.low], ['F', r.close], ['G', r.chg]].forEach(([c, v]) => cells.push(xc(`${c}${R}`, st[0], v)));
          cells.push(xc(`H${R}`, st[1], r.pct), xc(`I${R}`, st[2], r.deals), xc(`J${R}`, st[3], r.volume), xc(`K${R}`, st[3], r.value));
        }
      }
      const g = gain[R - 7], l = lose[R - 20];
      if(R <= 16 && g){ const e = R === 16; cells.push(xc(`M${R}`, e ? S2.gainEndTxt : S2.txt, g.sec, true), xc(`N${R}`, e ? S2.gainEndPx : S2.gainPx, g.close), xc(`O${R}`, e ? S2.gainEndPct : S2.gainPct, g.pct * 100)); }
      else if(R === 19) cells.push('<c r="M19" s="14" t="s"><v>14</v></c><c r="N19" s="15" t="s"><v>12</v></c><c r="O19" s="13" t="s"><v>13</v></c>');
      else if(R >= 20 && R <= 29 && l){ const e = R === 29; cells.push(xc(`M${R}`, e ? S2.loseEndTxt : S2.txt, l.sec, true), xc(`N${R}`, e ? S2.loseEndPx : S2.losePx, l.close), xc(`O${R}`, e ? S2.loseEndPct : S2.losePct, l.pct * 100)); }
      else if(isLast && R > 29) cells.push(`<c r="L${R}" s="${S2.tail}"/><c r="M${R}" s="${S2.tail}"/><c r="N${R}" s="${S2.tailPx}"/><c r="O${R}" s="${S2.tail}"/>`);
      if(cells.length) out.push(`<row r="${R}" spans="1:15">${cells.join('')}</row>`);
    }
    x = x.slice(0, a + 11) + head.join('') + out.join('') + x.slice(b);
    x = x.replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="A1:AC${end}"/>`)
         .replace(/H7:H\d+/g, `H7:H${last + 4}`)
         .replace(/ topLeftCell="[^"]*"/, '')
         .replace(/<selection [^>]*\/>/, '<selection activeCell="A7" sqref="A7"/>');
    // Protection (from EXCEL_PROTECT_PASSWORD, hashed by the Action): read and print only, no edits, no sheet changes.
    const px = (S.access || {}).excel;
    if(px && px.hash){
      const a = `algorithmName="SHA-512" hashValue="${px.hash}" saltValue="${px.salt}" spinCount="${px.spin}"`;
      x = x.replace(/<sheetProtection[^>]*\/>/, '').replace('</sheetData>', `</sheetData><sheetProtection ${a} sheet="1" objects="1" scenarios="1"/>`);
      let wb = await zip.file('xl/workbook.xml').async('string');
      wb = wb.replace(/<workbookProtection[^>]*\/>/, '').replace('<bookViews>', `<workbookProtection workbookAlgorithmName="SHA-512" workbookHashValue="${px.hash}" workbookSaltValue="${px.salt}" workbookSpinCount="${px.spin}" lockStructure="1"/><bookViews>`);
      zip.file('xl/workbook.xml', wb);
    }
    zip.file(path, x);
    save(await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), xlName());
  }catch(e){ $('resInfo').innerHTML += `<div class="err">Couldn't build the Excel: ${esc(e.message)}</div>`; }
  finally{ btn.disabled = false; btn.textContent = 'Download Excel'; }
}
function blotterCsv(){
  if(!S.day) return;
  let all = rowsFor(listFor(S.mode)); if(S.mode === 'all') all = all.filter(r => !r.miss);
  const [y, m, dd] = S.day.split('-').map(Number);
  const lines = [['TICKER', 'PREV CLOSE', 'OPEN', 'HIGH', 'LOW', 'CLOSE', 'CHANGE', '% CHANGE', 'DEALS', 'VOLUME', 'VALUE'].join(',')];
  all.forEach(r => lines.push(r.miss ? r.sec : [r.sec, r.prev, r.open, r.high, r.low, r.close, r.chg.toFixed(2), (r.pct * 100).toFixed(2), r.deals, r.volume, r.value].join(',')));
  save(new Blob([lines.join('\r\n')], { type: 'text/csv' }), `ngx-blotter-${S.mode}-${dd}_${MONTHS[m - 1]}_${y}.csv`);
}

// ---------- Zanibal price CSV (same file as Nexus / pricelist-to-zanibal: header, " -   " blanks, en-US 2dp, CRLF, MM/DD/YYYY) ----------
const Z_HEADER = ['BOARD', 'COMPANY', 'REF_PRICE', 'PCLOSE', 'OPEN_PRICE', 'HIGH_PRICE', 'LOW_PRICE', 'CLOSE_PRICE', 'CHANGE', 'NUM_TRADES', 'OFF_MKT_VOL', 'OFF_MKT_VAL', 'DAILY_VOLUME', 'DAILY_VALUE', 'COMPANY_NAME', 'TRADE_DATE'];
const Z_BLANK = ' -   ';
const zFmt = (v, dp) => v === null || v === undefined ? '' : Number(v).toLocaleString('en-US', { minimumFractionDigits: dp ?? 2, maximumFractionDigits: dp ?? 2 });
const zField = v => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const zUS = iso => { const [y, m, d] = iso.split('-'); return `${m}/${d}/${y}`; };
function zRows(){
  const d = S.day; if(!d) return [];
  const earlier = S.histDates.filter(x => x < d).slice().reverse();          // newest first
  return zList().slice().sort().map(sym => {
    const r = (S.hist[d] || {})[sym];
    if(r && r.close !== null && r.close !== undefined){
      let prev = r.prev;
      if(prev === null || prev === undefined){ const p = earlier.map(x => (S.hist[x] || {})[sym]).find(Boolean); prev = p ? p.close : r.close; }
      return { sym, prev, open: r.open ?? prev, high: r.high, low: r.low, close: r.close, change: r.close - prev, deals: r.deals, volume: r.volume ?? 0, value: r.value ?? 0, how: 'MyWealth' };
    }
    for(const x of earlier){ const p = (S.hist[x] || {})[sym]; if(p && p.close !== null && p.close !== undefined) return { sym, prev: p.close, open: p.close, high: p.close, low: p.close, close: p.close, change: 0, deals: 0, volume: 0, value: 0, how: `flat at last close (${longDate(x)})`, flag: true }; }
    if(S.z.held[sym] !== undefined) return { sym, prev: S.z.held[sym], open: S.z.held[sym], high: S.z.held[sym], low: S.z.held[sym], close: S.z.held[sym], change: 0, deals: 0, volume: 0, value: 0, how: 'held price', flag: true };
    return { sym, miss: true, how: 'no MyWealth price: left out' };
  });
}
function zCsv(){
  const hl = $('zhl').checked, fill = $('zfill').checked, date = zUS(S.day), out = [Z_HEADER.join(',')];
  zRows().filter(r => !r.miss).forEach(r => {
    let hi = r.high, lo = r.low;
    if(hl){ if(!hi) hi = r.close; if(!lo) lo = r.close; }
    let change = Z_BLANK, deals = Z_BLANK;
    if(fill){ if(r.change !== null && r.change !== undefined) change = zFmt(Math.round(r.change * 10000) / 10000); if(r.deals !== null && r.deals !== undefined) deals = zFmt(r.deals, 0); }
    out.push(['EQTY', r.sym, zFmt(r.prev), zFmt(r.prev), zFmt(r.open), zFmt(hi), zFmt(lo), zFmt(r.close), change, deals, Z_BLANK, Z_BLANK,
      r.volume !== null && r.volume !== undefined ? zFmt(r.volume) : '0.00', r.value !== null && r.value !== undefined ? zFmt(r.value) : '0.00', r.sym, date].map(zField).join(','));
  });
  return out.join('\r\n');
}
const zName = () => `zanibal-prices-${zUS(S.day).replace(/\//g, '')}.csv`;
function zRender(){
  if(!S.day){ $('zcsv').disabled = true; return; }
  const zr = zRows(), ok = zr.filter(r => !r.miss), flags = zr.filter(r => r.flag), miss = zr.filter(r => r.miss);
  $('zcsv').disabled = $('zcopy').disabled = !ok.length;
  $('zcount').innerHTML = `${ok.length} of ${zr.length} for ${esc(zUS(S.day))}${flags.length ? ` · <span style="color:var(--bronze2)">${flags.length} flat</span>` : ''}${miss.length ? ` · <span class="down">${miss.length} left out</span>` : ''}`;
  $('ztbody').innerHTML = zr.map(r => r.miss ? `<tr class="miss"><td>${esc(r.sym)}</td><td colspan="9"></td><td class="l down">${esc(r.how)}</td></tr>`
    : `<tr><td>${esc(r.sym)}</td><td>${n2(r.prev)}</td><td>${n2(r.open)}</td><td>${n2(r.high)}</td><td>${n2(r.low)}</td><td class="cl">${n2(r.close)}</td><td class="${cls(r.change)}">${n2(r.change)}</td><td>${n0(r.deals)}</td><td>${n0(r.volume)}</td><td>${n2(r.value)}</td><td class="l" style="color:${r.flag ? 'var(--bronze2)' : 'var(--muted)'}">${esc(r.how)}</td></tr>`).join('');
  $('znote').innerHTML = `<b>${esc(zName())}</b>, the same file as Nexus's Zanibal prices page. A security with no MyWealth price that day is written flat at its last close; one MyWealth doesn't have at all uses its held price from the CHD list.`;
}
function zDownload(copy){
  if(!isOpen('zanibal')) return openDl('zanibal');
  const csv = zCsv();
  if(copy){ (navigator.clipboard ? navigator.clipboard.writeText(csv) : Promise.reject()).then(() => { $('zcopy').textContent = 'Copied'; setTimeout(() => $('zcopy').textContent = 'Copy', 1500); }, () => prompt('Copy the CSV:', csv)); return; }
  save(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), zName());
}

// ---------- add / remove securities (this browser) ----------
function curList(){ return S.listMode === 'zanibal' ? zList() : covered(); }
function setList(which, list){
  const shared = which === 'zanibal' ? S.z.chd : S.teamList, key = which === 'zanibal' ? Z_KEY : LIST_KEY;
  const same = list.length === shared.length && list.every(x => shared.includes(x));
  ls.set(key, same ? null : JSON.stringify(list));
}
function openLists(which){ S.listMode = which; $('dq').value = ''; chips(); $('dlg').showModal(); }
function chips(){
  $('dseg').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.m === S.listMode));
  $('dtitle').textContent = S.listMode === 'zanibal' ? 'CHD securities (Zanibal CSV)' : 'Research price list';
  const cov = new Set(curList()), q = $('dq').value.trim().toUpperCase();
  const pool = [...new Map([...S.all.map(a => [a.secId, a]), ...[...cov].map(s => [s, S.all.find(a => a.secId === s) || { secId: s, name: 'not on MyWealth' }])]).values()];
  const list = pool.filter(a => !q || a.secId.includes(q) || String(a.name || '').toUpperCase().includes(q)).sort((a, b) => (cov.has(b.secId) - cov.has(a.secId)) || a.secId.localeCompare(b.secId));
  $('dcount').textContent = `${cov.size} on the list · ${S.all.length} NGX equities on MyWealth${q ? ` · ${list.length} match` : ''}`;
  $('dchips').innerHTML = list.slice(0, 400).map(a => `<label class="chip ${cov.has(a.secId) ? 'on' : ''}"><input type="checkbox" data-s="${esc(a.secId)}" ${cov.has(a.secId) ? 'checked' : ''}><span><b>${esc(a.secId)}</b><small>${esc(a.name || '')}</small></span></label>`).join('');
}
function shareLink(){ const u = new URL(location.href); u.search = ''; u.hash = ''; u.searchParams.set(S.listMode === 'zanibal' ? 'chd' : 'research', curList().slice().sort().join(',')); return u.toString(); }
function copyText(t, btn, label){ (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => { btn.textContent = 'Copied'; setTimeout(() => btn.textContent = label, 1500); }, () => prompt('Copy this:', t)); }
// A link made with "Copy link" carries a list (?research=A,B,C or ?chd=…); opening it saves that list on this computer.
function listFromLink(){
  const q = new URLSearchParams(location.search); let used = '';
  for(const [p, which] of [['research', 'research'], ['chd', 'zanibal']]){
    const v = q.get(p); if(!v) continue;
    const list = [...new Set(v.split(',').map(x => x.trim().toUpperCase()).filter(x => /^[A-Z0-9._-]{1,20}$/.test(x)))];
    if(list.length && (which === 'research' || S.zReady)){ setList(which, list); used = which; if(which === 'zanibal') S.mode = 'chd'; else S.mode = 'research'; }
  }
  if(q.has('research') || q.has('chd')) history.replaceState(null, '', location.pathname);
  return used;
}
function copyList(){ const t = JSON.stringify(curList().slice().sort()); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => { $('dcopy').textContent = 'Copied'; setTimeout(() => $('dcopy').textContent = 'Copy list', 1500); }, () => prompt('Copy this list:', t)); }

// ---------- light / dark (dark by default; remembered in this browser) ----------
function theme(t){
  const light = t === 'light';
  light ? document.documentElement.setAttribute('data-theme', 'light') : document.documentElement.removeAttribute('data-theme');
  ls.set('plg_theme', light ? 'light' : null);
  $('themeBtn').setAttribute('aria-label', light ? 'Switch to dark mode' : 'Switch to light mode');
  document.querySelector('meta[name="theme-color"]').content = light ? '#FFFFFF' : '#0B1116';
}
$('refreshBtn').onclick = () => refresh(true);
$('themeBtn').onclick = () => theme(document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light');
theme(ls.get('plg_theme') === 'light' ? 'light' : 'dark');

// ---------- wiring ----------
const menu = $('menu'), menuBtn = $('menuBtn');
function menuOpen(on){ menu.classList.toggle('open', on); menuBtn.setAttribute('aria-expanded', String(on)); if(on) lockBadges(), menu.querySelector('button').focus(); }
menuBtn.onclick = e => { e.stopPropagation(); menuOpen(!menu.classList.contains('open')); };
document.addEventListener('click', e => { if(!e.target.closest('.menu')) menuOpen(false); });
document.addEventListener('keydown', e => {
  if(!menu.classList.contains('open')) return;
  const items = [...menu.querySelectorAll('button')], i = items.indexOf(document.activeElement);
  if(e.key === 'Escape'){ menuOpen(false); menuBtn.focus(); }
  if(e.key === 'ArrowDown'){ e.preventDefault(); items[(i + 1) % items.length].focus(); }
  if(e.key === 'ArrowUp'){ e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
});
menu.onclick = e => { const b = e.target.closest('[data-dl]'); if(!b) return; menuOpen(false); openDl(b.dataset.dl); };
document.addEventListener('click', e => { const c = e.target.closest('[data-close]'); if(c) c.closest('dialog').close(); });
$('msgs').onclick = e => { const b = e.target.closest('[data-reset]'); if(!b) return; setList(b.dataset.reset, b.dataset.reset === 'zanibal' ? S.z.chd : S.teamList); render(); };
$('seg').onclick = e => { const b = e.target.closest('[data-l]'); if(!b) return; const go = () => { S.mode = b.dataset.l; ls.set(MODE_KEY, S.mode); render(); }; if(b.dataset.l === 'chd' && chdLocked()) return askPassword('zanibal', go); go(); };
$('day').onchange = e => loadDay(e.target.value);
$('xlsx').onclick = buildXlsx;
$('q').oninput = e => { S.q = e.target.value; render(); };
$('show').onchange = e => { S.show = e.target.value; render(); };
$('thead').onclick = e => { const th = e.target.closest('th'), k = th && th.dataset.k; if(!k || k === 'spark') return; S.sort = [k, S.sort[0] === k ? -S.sort[1] : (k === 'sec' ? 1 : -1)]; render(); };
$('zedit').onclick = () => { $('dZan').close(); openLists('zanibal'); };
$('zcsv').onclick = () => zDownload(false);
$('zcopy').onclick = () => zDownload(true);
['zhl', 'zfill'].forEach(id => $(id).onchange = () => { ls.set(ZOPT_KEY, JSON.stringify({ hl: $('zhl').checked, fill: $('zfill').checked })); zRender(); });
$('dseg').onclick = e => { const b = e.target.closest('[data-m]'); if(!b) return; if(b.dataset.m === 'zanibal' && chdLocked()){ $('dlg').close(); return askPassword('zanibal', () => openLists('zanibal')); } S.listMode = b.dataset.m; chips(); };
$('dq').oninput = chips;
$('dchips').onchange = e => { const s = e.target.dataset.s; if(!s) return; const cov = new Set(curList()); e.target.checked ? cov.add(s) : cov.delete(s); setList(S.listMode, [...cov]); chips(); render(); };
$('dreset').onclick = () => { setList(S.listMode, S.listMode === 'zanibal' ? S.z.chd : S.teamList); chips(); render(); };
$('dcopy').onclick = copyList;
$('dlink').onclick = () => copyText(shareLink(), $('dlink'), 'Copy link');
$('editList').onclick = () => openLists(S.mode === 'chd' && !chdLocked() ? 'zanibal' : 'research');
boot();
