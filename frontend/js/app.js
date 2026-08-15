const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

const map = L.map('map').setView([41.2995, 69.2401], 12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

const API = window.APP_CONFIG.API_BASE_URL.replace(/\/$/, '');
const user = tg?.initDataUnsafe?.user || {id: 0, first_name: 'Web User'};
let markers = new Map();
let places = new Map();
let selectedPlace = null;

function setStatus(text) { document.getElementById('status').textContent = text || ''; }

function popup(place, visit) {
  const status = visit?.visited ? '🟢 Вы были здесь' : '⚪ Вы ещё не были';
  const sold = visit?.sold === true ? 'Продано: Да' : 'Продано: Нет';
  const note = visit?.note ? `<div class="note-preview">📝 ${escapeHtml(visit.note)}</div>` : '';
  return `<div class="popup">
    <h3>${escapeHtml(place.name || 'Место')}</h3>
    <p>${escapeHtml(place.address || '')}</p>
    <p>${status}<br>${sold}</p>
    ${note}
    <div class="actions">
      <button onclick="visitPlace('${place.id}')">Я здесь был</button>
      <button class="secondary" onclick="setSold('${place.id}', true)">Продано: Да</button>
      <button class="secondary" onclick="setSold('${place.id}', false)">Продано: Нет</button>
    </div>
  </div>`;
}
function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }

async function searchPlaces() {
  const q = document.getElementById('search').value.trim();
  if (!q) return;
  setStatus('Ищу места...');
  const res = await fetch(`${API}/api/places/search?q=${encodeURIComponent(q)}&lat=41.2995&lon=69.2401`);
  if (!res.ok) { setStatus('Ошибка поиска'); return; }
  const data = await res.json();
  clearMarkers();
  if (!data.length) { setStatus('Ничего не найдено'); return; }
  for (const p of data) {
    places.set(String(p.id), p);
    const m = L.marker([p.lat, p.lon]).addTo(map);
    markers.set(String(p.id), m);
    const visit = await getVisit(p.id);
    m.bindPopup(popup(p, visit));
  }
  map.fitBounds(L.featureGroup([...markers.values()]).getBounds().pad(0.2));
  setStatus(`Найдено: ${data.length}`);
}
async function getVisit(placeId) {
  const r = await fetch(`${API}/api/visits/${encodeURIComponent(placeId)}?user_id=${encodeURIComponent(user.id)}`);
  return r.ok ? r.json() : null;
}
async function visitPlace(placeId) {
  const p = places.get(String(placeId));
  await saveVisit(p, true, undefined);
}
async function setSold(placeId, sold) {
  const p = places.get(String(placeId));
  if (sold) {
    selectedPlace = p;
    document.getElementById('modalTitle').textContent = `Продано — ${p.name}`;
    document.getElementById('note').value = '';
    document.getElementById('modal').classList.remove('hidden');
  } else {
    await saveVisit(p, true, false, '');
  }
}
async function saveVisit(p, visited=true, sold=true, note=null) {
  if (!p) return;
  const payload = {
    place_id: String(p.id), name: p.name, address: p.address || '',
    lat: p.lat, lon: p.lon, visited, sold, note,
    user_id: String(user.id), user_name: user.first_name || 'User'
  };
  const r = await fetch(`${API}/api/visits`, {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)
  });
  if (!r.ok) { alert('Не удалось сохранить'); return; }
  const v = await r.json();
  markers.get(String(p.id))?.setPopupContent(popup(p, v)).openPopup();
}
document.getElementById('searchBtn').onclick = searchPlaces;
document.getElementById('search').addEventListener('keydown', e => { if (e.key === 'Enter') searchPlaces(); });
document.getElementById('closeModal').onclick = () => document.getElementById('modal').classList.add('hidden');
document.getElementById('saveNote').onclick = async () => {
  await saveVisit(selectedPlace, true, true, document.getElementById('note').value.trim());
  document.getElementById('modal').classList.add('hidden');
};
document.getElementById('allBtn').onclick = async () => {
  const r = await fetch(`${API}/api/visits?user_id=${encodeURIComponent(user.id)}`);
  if (!r.ok) return;
  const list = await r.json();
  clearMarkers();
  for (const v of list) {
    const p = {id:v.place_id,name:v.name,address:v.address,lat:v.lat,lon:v.lon};
    places.set(String(p.id), p);
    const m = L.marker([p.lat,p.lon]).addTo(map).bindPopup(popup(p,v));
    markers.set(String(p.id),m);
  }
};
function clearMarkers() { markers.forEach(m => map.removeLayer(m)); markers.clear(); }
