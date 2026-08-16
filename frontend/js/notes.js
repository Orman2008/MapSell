const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }
const API = window.APP_CONFIG.API_BASE_URL.replace(/\/$/, '');
const user = tg?.initDataUnsafe?.user || {id:0, first_name:'Web User'};

async function load() {
  const r = await fetch(`${API}/api/visits/all?user_id=${encodeURIComponent(user.id)}`);
  if (!r.ok) return;
  const data = await r.json();
  document.getElementById('total').textContent = data.length;
  document.getElementById('sold').textContent = data.filter(x => x.sold).length;
  document.getElementById('notSold').textContent = data.filter(x => !x.sold).length;
  const box = document.getElementById('notesList');
  box.innerHTML = data.map(x => `<article class="card">
    <div class="card-head"><h3>${esc(x.name)}</h3><span>${x.sold ? '💰 Продано' : '❌ Не продано'}</span></div>
    <p>📍 ${esc(x.address || '')}</p>
    <p>🟢 Был здесь</p>
    ${x.note ? `<div class="note">${esc(x.note)}</div>` : '<div class="muted">Без заметки</div>'}
    <small>Добавил: ${esc(x.user_name || 'Пользователь')}</small>
  </article>`).join('') || '<div class="empty">Пока нет записей.</div>';
}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}
load();
