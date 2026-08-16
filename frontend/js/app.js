const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();
}


const map = L.map('map').setView(
  [41.2995, 69.2401],
  12
);


L.tileLayer(
  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  {
    attribution:
      '&copy; OpenStreetMap contributors'
  }
).addTo(map);


const API =
  window.APP_CONFIG.API_BASE_URL.replace(/\/$/, '');


const user =
  tg?.initDataUnsafe?.user ||
  {
    id: 0,
    first_name: 'Web User'
  };


let markers = new Map();
let places = new Map();

let selectedPlace = null;

let currentPosition = null;

let userMarker = null;

let routeLine = null;


/* -----------------------------------------
   HELPERS
----------------------------------------- */


function setStatus(text) {

  const el =
    document.getElementById('status');

  if (el) {
    el.textContent = text || '';
  }
}


function escapeHtml(s) {

  return String(s ?? '')
    .replace(
      /[&<>"']/g,
      c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      }[c])
    );
}


function distanceKm(
  lat1,
  lon1,
  lat2,
  lon2
) {

  const R = 6371;

  const dLat =
    (lat2 - lat1) *
    Math.PI / 180;

  const dLon =
    (lon2 - lon1) *
    Math.PI / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;

  return (
    R *
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    )
  );
}


function formatDistance(km) {

  if (km < 1) {
    return `${Math.round(km * 1000)} м`;
  }

  return `${km.toFixed(1)} км`;
}


function formatTime(seconds) {

  const minutes =
    Math.round(seconds / 60);

  if (minutes < 60) {
    return `${minutes} мин`;
  }

  const hours =
    Math.floor(minutes / 60);

  const mins =
    minutes % 60;

  return mins
    ? `${hours} ч ${mins} мин`
    : `${hours} ч`;
}


/* -----------------------------------------
   LOCATION
----------------------------------------- */


function locateUser() {

  if (!navigator.geolocation) {

    alert(
      'Ваш браузер не поддерживает геолокацию'
    );

    return;
  }


  navigator.geolocation.getCurrentPosition(

    position => {

      currentPosition = {
        lat: position.coords.latitude,
        lon: position.coords.longitude
      };


      if (userMarker) {
        map.removeLayer(userMarker);
      }


      userMarker =
        L.circleMarker(
          [
            currentPosition.lat,
            currentPosition.lon
          ],
          {
            radius: 9,
            color: '#ffffff',
            weight: 3,
            fillOpacity: 1
          }
        )
        .addTo(map)
        .bindPopup(
          '📍 Ваше местоположение'
        );


      map.setView(
        [
          currentPosition.lat,
          currentPosition.lon
        ],
        15
      );

    },

    error => {

      console.log(error);

      alert(
        'Не удалось определить местоположение. Разреши доступ к геолокации.'
      );
    },

    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 30000
    }
  );
}


/* -----------------------------------------
   ICONS
----------------------------------------- */


function createIcon(place) {

  const icon =
    place.icon || '📍';


  return L.divIcon({

    className: 'custom-marker',

    html: `
      <div class="marker-icon">
        ${icon}
      </div>
    `,

    iconSize: [40, 40],

    iconAnchor: [20, 20],

    popupAnchor: [0, -20]
  });
}


/* -----------------------------------------
   POPUP
----------------------------------------- */


function popup(place, visit) {

  const sold =
    visit?.sold === true;


  const note =
    visit?.note
      ? `
        <div class="note-preview">
          📝 ${escapeHtml(visit.note)}
        </div>
      `
      : '';


  return `

    <div class="popup">

      <h3>
        ${escapeHtml(
          place.name || 'Место'
        )}
      </h3>

      <p>
        ${escapeHtml(
          place.address || ''
        )}
      </p>

      <p>
        ${sold
          ? '🟢 Продано'
          : '🔴 Не продано'}
      </p>

      ${note}

      <div class="actions">

        <button
          onclick="openPlace('${place.id}')"
        >
          Открыть
        </button>

        <button
          class="secondary"
          onclick="buildRoute('${place.id}')"
        >
          🧭 Маршрут
        </button>

      </div>

    </div>
  `;
}


/* -----------------------------------------
   OPEN PLACE
----------------------------------------- */


async function openPlace(id) {

  const place =
    places.get(String(id));

  if (!place) return;


  selectedPlace = place;


  const visit =
    await getVisit(place.id);


  document.getElementById(
    'modalTitle'
  ).textContent =
    place.name;


  document.getElementById(
    'modalAddress'
  ).textContent =
    place.address || '';


  document.getElementById(
    'note'
  ).value =
    visit?.note || '';


  document
    .getElementById('modal')
    .classList.remove('hidden');
}


/* -----------------------------------------
   VISITS
----------------------------------------- */


async function getVisit(placeId) {

  const r =
    await fetch(
      `${API}/api/visits/${encodeURIComponent(placeId)}?user_id=${encodeURIComponent(user.id)}`
    );


  if (!r.ok) {
    return null;
  }


  return r.json();
}


async function saveVisit(
  place,
  sold,
  note
) {

  if (!place) return;


  const payload = {

    place_id:
      String(place.id),

    name:
      place.name,

    address:
      place.address || '',

    lat:
      place.lat,

    lon:
      place.lon,

    visited:
      true,

    sold:
      sold,

    note:
      note || null,

    user_id:
      String(user.id),

    user_name:
      user.first_name || 'User'
  };


  const r =
    await fetch(
      `${API}/api/visits`,
      {
        method: 'POST',

        headers: {
          'Content-Type':
            'application/json'
        },

        body:
          JSON.stringify(payload)
      }
    );


  if (!r.ok) {

    alert(
      'Не удалось сохранить'
    );

    return;
  }


  const v =
    await r.json();


  const marker =
    markers.get(
      String(place.id)
    );


  if (marker) {

    marker
      .setPopupContent(
        popup(place, v)
      );
  }
}


/* -----------------------------------------
   SEARCH
----------------------------------------- */


async function searchPlaces() {

  const q =
    document
      .getElementById('search')
      .value
      .trim();


  if (!q) return;


  setStatus(
    '🔎 Ищу места...'
  );


  try {

    const r =
      await fetch(
        `${API}/api/places/search?q=${encodeURIComponent(q)}&lat=${currentPosition?.lat || 41.2995}&lon=${currentPosition?.lon || 69.2401}`
      );


    if (!r.ok) {

      setStatus(
        '❌ Ошибка поиска'
      );

      return;
    }


    const data =
      await r.json();


    clearMarkers();


    if (!data.length) {

      setStatus(
        'Ничего не найдено'
      );

      return;
    }


    const list =
      document.getElementById(
        'resultsList'
      );


    list.innerHTML = '';


    for (const p of data) {

      places.set(
        String(p.id),
        p
      );


      const marker =
        L.marker(
          [p.lat, p.lon],
          {
            icon:
              createIcon(p)
          }
        )
        .addTo(map);


      markers.set(
        String(p.id),
        marker
      );


      const visit =
        await getVisit(p.id);


      marker.bindPopup(
        popup(p, visit)
      );


      let distance = '—';

      if (currentPosition) {

        const km =
          distanceKm(
            currentPosition.lat,
            currentPosition.lon,
            p.lat,
            p.lon
          );

        distance =
          formatDistance(km);
      }


      const item =
        document.createElement(
          'div'
        );


      item.className =
        'result-item';


      item.innerHTML = `

        <div class="result-icon">
          ${p.icon || '📍'}
        </div>

        <div class="result-content">

          <b>
            ${escapeHtml(p.name)}
          </b>

          <span>
            ${escapeHtml(
              p.address || ''
            )}
          </span>

          <small>
            📍 ${distance}
          </small>

        </div>

        <button>
          →
        </button>
      `;


      item.onclick = () => {

        map.setView(
          [p.lat, p.lon],
          17
        );

        marker.openPopup();
      };


      list.appendChild(item);
    }


    document
      .getElementById(
        'resultsPanel'
      )
      .classList.remove('hidden');


    const group =
      L.featureGroup(
        [...markers.values()]
      );


    map.fitBounds(
      group
        .getBounds()
        .pad(0.2)
    );


    setStatus(
      `Найдено: ${data.length}`
    );

  } catch (e) {

    console.error(e);

    setStatus(
      '❌ Ошибка соединения'
    );
  }
}


/* -----------------------------------------
   ROUTING
----------------------------------------- */


async function buildRoute(id) {

  const place =
    places.get(String(id));


  if (!place) return;


  if (!currentPosition) {

    locateUser();


    alert(
      'Сначала разреши доступ к местоположению.'
    );

    return;
  }


  const start =
    `${currentPosition.lon},${currentPosition.lat}`;


  const end =
    `${place.lon},${place.lat}`;


  try {

    /*
      Пеший маршрут
    */

    const walkUrl =
      `https://router.project-osrm.org/route/v1/foot/${start};${end}?overview=full&geometries=geojson`;


    /*
      Машина
    */

    const carUrl =
      `https://router.project-osrm.org/route/v1/driving/${start};${end}?overview=full&geometries=geojson`;


    const [
      walkResponse,
      carResponse
    ] =
      await Promise.all([
        fetch(walkUrl),
        fetch(carUrl)
      ]);


    const walk =
      await walkResponse.json();


    const car =
      await carResponse.json();


    if (
      walk.code !== 'Ok' &&
      car.code !== 'Ok'
    ) {

      alert(
        'Маршрут не найден'
      );

      return;
    }


    if (routeLine) {

      map.removeLayer(
        routeLine
      );
    }


    const route =
      walk.code === 'Ok'
        ? walk.routes[0]
        : car.routes[0];


    routeLine =
      L.geoJSON(
        route.geometry
      ).addTo(map);


    map.fitBounds(
      routeLine.getBounds(),
      {
        padding: [40, 40]
      }
    );


    document.getElementById(
      'routeTitle'
    ).textContent =
      `🧭 ${place.name}`;


    if (walk.code === 'Ok') {

      document.getElementById(
        'walkDistance'
      ).textContent =
        formatDistance(
          walk.routes[0].distance / 1000
        );


      document.getElementById(
        'walkTime'
      ).textContent =
        formatTime(
          walk.routes[0].duration
        );
    }


    if (car.code === 'Ok') {

      document.getElementById(
        'carDistance'
      ).textContent =
        formatDistance(
          car.routes[0].distance / 1000
        );


      document.getElementById(
        'carTime'
      ).textContent =
        formatTime(
          car.routes[0].duration
        );
    }


    document
      .getElementById(
        'routePanel'
      )
      .classList.remove('hidden');


    document
      .getElementById(
        'modal'
      )
      .classList.add('hidden');


  } catch (e) {

    console.error(e);

    alert(
      'Не удалось построить маршрут'
    );
  }
}


/* -----------------------------------------
   MY PLACES
----------------------------------------- */


async function loadMyPlaces() {

  const r =
    await fetch(
      `${API}/api/visits?user_id=${encodeURIComponent(user.id)}`
    );


  if (!r.ok) return;


  const list =
    await r.json();


  clearMarkers();


  for (const v of list) {

    const p = {

      id:
        v.place_id,

      name:
        v.name,

      address:
        v.address,

      lat:
        v.lat,

      lon:
        v.lon,

      icon:
        v.sold
          ? '💰'
          : '📍'
    };


    places.set(
      String(p.id),
      p
    );


    const marker =
      L.marker(
        [p.lat, p.lon],
        {
          icon:
            createIcon(p)
        }
      )
      .addTo(map);


    marker.bindPopup(
      popup(p, v)
    );


    markers.set(
      String(p.id),
      marker
    );
  }


  if (list.length) {

    map.fitBounds(
      L.featureGroup(
        [...markers.values()]
      )
      .getBounds()
      .pad(0.2)
    );
  }
}


/* -----------------------------------------
   EVENTS
----------------------------------------- */


document
  .getElementById('searchBtn')
  .onclick =
    searchPlaces;


document
  .getElementById('search')
  .addEventListener(
    'keydown',
    e => {

      if (e.key === 'Enter') {
        searchPlaces();
      }

    }
  );


document
  .getElementById('locationBtn')
  .onclick =
    locateUser;


document
  .getElementById('allBtn')
  .onclick =
    loadMyPlaces;


document
  .getElementById('closeResults')
  .onclick =
    () => {

      document
        .getElementById(
          'resultsPanel'
        )
        .classList.add('hidden');
    };


document
  .getElementById('closeRoute')
  .onclick =
    () => {

      document
        .getElementById(
          'routePanel'
        )
        .classList.add('hidden');

      if (routeLine) {

        map.removeLayer(
          routeLine
        );

        routeLine = null;
      }
    };


document
  .getElementById('closeModal')
  .onclick =
    () => {

      document
        .getElementById(
          'modal'
        )
        .classList.add('hidden');
    };


document
  .getElementById('soldYes')
  .onclick =
    async () => {

      await saveVisit(
        selectedPlace,
        true,
        document
          .getElementById('note')
          .value
          .trim()
      );


      document
        .getElementById(
          'modal'
        )
        .classList.add('hidden');
    };


document
  .getElementById('soldNo')
  .onclick =
    async () => {

      await saveVisit(
        selectedPlace,
        false,
        document
          .getElementById('note')
          .value
          .trim()
      );


      document
        .getElementById(
          'modal'
        )
        .classList.add('hidden');
    };


document
  .getElementById('saveNote')
  .onclick =
    async () => {

      const oldVisit =
        await getVisit(
          selectedPlace.id
        );


      await saveVisit(
        selectedPlace,
        oldVisit?.sold || false,
        document
          .getElementById('note')
          .value
          .trim()
      );


      document
        .getElementById(
          'modal'
        )
        .classList.add('hidden');
    };


document
  .getElementById('routeBtn')
  .onclick =
    () => {

      if (selectedPlace) {
        buildRoute(
          selectedPlace.id
        );
      }
    };


function clearMarkers() {

  markers.forEach(
    m => map.removeLayer(m)
  );

  markers.clear();
}


/* -----------------------------------------
   START
----------------------------------------- */


locateUser();