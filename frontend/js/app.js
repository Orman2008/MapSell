const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();
}


/* =========================================
   MAP
========================================= */

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


/* =========================================
   API / USER
========================================= */

const API =
  window.APP_CONFIG.API_BASE_URL.replace(/\/$/, '');


const user =
  tg?.initDataUnsafe?.user || {
    id: 0,
    first_name: 'Web User'
  };


/* =========================================
   STATE
========================================= */

let markers = new Map();

let places = new Map();

let selectedPlace = null;

let currentPosition = null;

let userMarker = null;

let routeLine = null;


/* =========================================
   HELPERS
========================================= */

function setStatus(text) {

  const el =
    document.getElementById('status');

  if (el) {
    el.textContent = text || '';
  }
}


function escapeHtml(value) {

  return String(value ?? '')
    .replace(
      /[&<>"']/g,
      char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      }[char])
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

    Math.cos(
      lat1 * Math.PI / 180
    ) *

    Math.cos(
      lat2 * Math.PI / 180
    ) *

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

    return (
      Math.round(km * 1000) +
      ' м'
    );
  }

  return km.toFixed(1) + ' км';
}


function formatTime(seconds) {

  const minutes =
    Math.round(seconds / 60);

  if (minutes < 60) {

    return (
      minutes +
      ' мин'
    );
  }

  const hours =
    Math.floor(minutes / 60);

  const mins =
    minutes % 60;

  if (mins) {

    return (
      hours +
      ' ч ' +
      mins +
      ' мин'
    );
  }

  return (
    hours +
    ' ч'
  );
}


/* =========================================
   USER LOCATION
========================================= */

function locateUser() {

  if (!navigator.geolocation) {

    alert(
      'Ваш браузер не поддерживает геолокацию.'
    );

    return;
  }


  setStatus(
    '📍 Определяю ваше местоположение...'
  );


  navigator.geolocation.getCurrentPosition(

    position => {

      currentPosition = {

        lat:
          position.coords.latitude,

        lon:
          position.coords.longitude
      };


      if (userMarker) {

        map.removeLayer(
          userMarker
        );
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

            fillColor: '#1877f2',

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


      setStatus(
        '📍 Местоположение определено'
      );
    },


    error => {

      console.error(
        'Geolocation error:',
        error
      );


      setStatus(
        '❌ Не удалось определить местоположение'
      );


      alert(
        'Не удалось определить местоположение. Разрешите доступ к геолокации в браузере.'
      );
    },


    {
      enableHighAccuracy: true,

      timeout: 15000,

      maximumAge: 30000
    }
  );
}


/* =========================================
   MARKER ICONS
========================================= */

function createIcon(place) {

  let icon =
    place.icon || '📍';


  return L.divIcon({

    className:
      'custom-marker',

    html: `
      <div class="marker-icon">
        ${escapeHtml(icon)}
      </div>
    `,

    iconSize: [
      40,
      40
    ],

    iconAnchor: [
      20,
      20
    ],

    popupAnchor: [
      0,
      -20
    ]
  });
}


/* =========================================
   PLACE POPUP
========================================= */

function popup(
  place,
  visit
) {

  const sold =
    visit?.sold === true;


  const note =
    visit?.note
      ? `
        <div class="note-preview">
          📝 ${escapeHtml(
            visit.note
          )}
        </div>
      `
      : '';


  return `

    <div class="popup">

      <h3>
        ${escapeHtml(
          place.name ||
          'Место'
        )}
      </h3>

      <p>
        ${escapeHtml(
          place.address ||
          ''
        )}
      </p>

      <p>
        ${
          sold
            ? '🟢 Продано'
            : '🔴 Не продано'
        }
      </p>

      ${
        visit?.visited
          ? '<p>🟢 Вы были здесь</p>'
          : ''
      }

      ${note}

      <div class="actions">

        <button
          onclick="openPlace('${escapeHtml(place.id)}')"
        >
          Открыть
        </button>

        <button
          class="secondary"
          onclick="buildRoute('${escapeHtml(place.id)}')"
        >
          🧭 Маршрут
        </button>

      </div>

    </div>

  `;
}


/* =========================================
   GET VISIT
========================================= */

async function getVisit(
  placeId
) {

  try {

    const response =
      await fetch(
        `${API}/api/visits/${encodeURIComponent(placeId)}?user_id=${encodeURIComponent(user.id)}`
      );


    if (!response.ok) {

      return null;
    }


    return await response.json();

  } catch (error) {

    console.error(
      'getVisit error:',
      error
    );

    return null;
  }
}


/* =========================================
   OPEN PLACE
========================================= */

async function openPlace(
  id
) {

  const place =
    places.get(
      String(id)
    );


  if (!place) {

    return;
  }


  selectedPlace =
    place;


  const visit =
    await getVisit(
      place.id
    );


  const title =
    document.getElementById(
      'modalTitle'
    );


  const address =
    document.getElementById(
      'modalAddress'
    );


  const note =
    document.getElementById(
      'note'
    );


  if (title) {

    title.textContent =
      place.name ||
      'Место';
  }


  if (address) {

    address.textContent =
      place.address ||
      '';
  }


  if (note) {

    note.value =
      visit?.note ||
      '';
  }


  document
    .getElementById('modal')
    .classList.remove(
      'hidden'
    );
}


/* =========================================
   SAVE VISIT
========================================= */

async function saveVisit(
  place,
  sold,
  note
) {

  if (!place) {

    return null;
  }


  const payload = {

    place_id:
      String(place.id),

    name:
      place.name ||
      'Место',

    address:
      place.address ||
      '',

    lat:
      Number(place.lat),

    lon:
      Number(place.lon),

    visited:
      true,

    sold:
      Boolean(sold),

    note:
      note ||
      null,

    user_id:
      String(user.id),

    user_name:
      user.first_name ||
      'User'
  };


  try {

    const response =
      await fetch(
        `${API}/api/visits`,
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json'
          },

          body:
            JSON.stringify(
              payload
            )
        }
      );


    if (!response.ok) {

      const text =
        await response.text();

      console.error(
        'Save visit error:',
        response.status,
        text
      );


      alert(
        'Не удалось сохранить место.'
      );

      return null;
    }


    const visit =
      await response.json();


    const marker =
      markers.get(
        String(place.id)
      );


    if (marker) {

      marker.setPopupContent(
        popup(
          place,
          visit
        )
      );
    }


    return visit;

  } catch (error) {

    console.error(
      'Save visit error:',
      error
    );


    alert(
      'Ошибка соединения с сервером.'
    );


    return null;
  }
}


/* =========================================
   SEARCH
========================================= */

async function searchPlaces() {

  const input =
    document.getElementById(
      'search'
    );


  const q =
    input.value.trim();


  if (!q) {

    setStatus(
      'Введите что-нибудь для поиска'
    );

    return;
  }


  setStatus(
    '🔎 Ищу места...'
  );


  try {

    const lat =
      currentPosition?.lat ||
      41.2995;


    const lon =
      currentPosition?.lon ||
      69.2401;


    const url =
      `${API}/api/places/search?q=${encodeURIComponent(q)}&lat=${lat}&lon=${lon}`;


    console.log(
      'Search:',
      url
    );


    const response =
      await fetch(
        url
      );


    if (!response.ok) {

      const errorText =
        await response.text();


      console.error(
        'Search API error:',
        response.status,
        errorText
      );


      setStatus(
        '❌ Ошибка поиска'
      );

      return;
    }


    const data =
      await response.json();


    console.log(
      'Search results:',
      data
    );


    clearMarkers();


    places.clear();


    const list =
      document.getElementById(
        'resultsList'
      );


    list.innerHTML = '';


    if (
      !Array.isArray(data) ||
      data.length === 0
    ) {

      setStatus(
        'Ничего не найдено'
      );


      document
        .getElementById(
          'resultsPanel'
        )
        .classList.add(
          'hidden'
        );


      return;
    }


    /* -------------------------------------
       RESULTS
    ------------------------------------- */

    for (
      const place
      of data
    ) {

      places.set(
        String(place.id),
        place
      );


      /* marker */

      const marker =
        L.marker(
          [
            Number(place.lat),
            Number(place.lon)
          ],
          {
            icon:
              createIcon(
                place
              )
          }
        )
        .addTo(map);


      markers.set(
        String(place.id),
        marker
      );


      /* visit */

      const visit =
        await getVisit(
          place.id
        );


      marker.bindPopup(
        popup(
          place,
          visit
        )
      );


      /* distance */

      let distanceText =
        '—';


      if (currentPosition) {

        const km =
          distanceKm(
            currentPosition.lat,
            currentPosition.lon,
            Number(place.lat),
            Number(place.lon)
          );


        distanceText =
          formatDistance(
            km
          );
      }


      /* result item */

      const item =
        document.createElement(
          'div'
        );


      item.className =
        'result-item';


      item.innerHTML = `

        <div class="result-icon">
          ${escapeHtml(
            place.icon ||
            '📍'
          )}
        </div>

        <div class="result-content">

          <b>
            ${escapeHtml(
              place.name ||
              'Без названия'
            )}
          </b>

          <span>
            ${escapeHtml(
              place.address ||
              'Адрес не указан'
            )}
          </span>

          <small>
            📍 ${distanceText}
          </small>

        </div>

        <button
          type="button"
          class="result-open"
        >
          →
        </button>

      `;


      item.addEventListener(
        'click',
        () => {

          map.setView(
            [
              Number(place.lat),
              Number(place.lon)
            ],
            17
          );


          marker.openPopup();
        }
      );


      list.appendChild(
        item
      );
    }


    /* -------------------------------------
       SHOW RESULTS
    ------------------------------------- */

    const title =
      document.getElementById(
        'resultsTitle'
      );


    if (title) {

      title.textContent =
        `Найдено: ${data.length}`;
    }


    document
      .getElementById(
        'resultsPanel'
      )
      .classList.remove(
        'hidden'
      );


    /* -------------------------------------
       FIT MAP
    ------------------------------------- */

    if (
      markers.size > 0
    ) {

      const group =
        L.featureGroup(
          [
            ...markers.values()
          ]
        );


      map.fitBounds(
        group
          .getBounds()
          .pad(0.2)
      );
    }


    setStatus(
      `Найдено: ${data.length}`
    );

  } catch (error) {

    console.error(
      'Search error:',
      error
    );


    setStatus(
      '❌ Ошибка соединения'
    );
  }
}


/* =========================================
   ROUTING
========================================= */

async function buildRoute(
  id
) {

  const place =
    places.get(
      String(id)
    );


  if (!place) {

    return;
  }


  selectedPlace =
    place;


  /* ---------------------------------------
     GET LOCATION
  --------------------------------------- */

  if (!currentPosition) {

    locateUser();


    alert(
      'Сначала разрешите доступ к вашему местоположению.'
    );


    return;
  }


  const start =
    `${currentPosition.lon},${currentPosition.lat}`;


  const end =
    `${place.lon},${place.lat}`;


  setStatus(
    '🧭 Строю маршрут...'
  );


  try {

    /*
      ВАЖНО:

      OSRM public server нормально работает
      с driving.

      Для пешего маршрута используем
      отдельный Valhalla public API.
    */


    const carUrl =
      `https://router.project-osrm.org/route/v1/driving/${start};${end}?overview=full&geometries=geojson`;


    const walkUrl =
      `https://valhalla1.openstreetmap.de/route?json=${encodeURIComponent(
        JSON.stringify({

          locations: [

            {
              lat:
                currentPosition.lat,

              lon:
                currentPosition.lon
            },

            {
              lat:
                Number(place.lat),

              lon:
                Number(place.lon)
            }

          ],

          costing:
            'pedestrian',

          units:
            'kilometers',

          directions_options: {
            units:
              'kilometers'
          }
        })
      )}`;


    const [
      carResponse,
      walkResponse
    ] =
      await Promise.all([
        fetch(carUrl),
        fetch(walkUrl)
      ]);


    let car = null;

    let walk = null;


    /* -------------------------------------
       CAR
    ------------------------------------- */

    if (
      carResponse.ok
    ) {

      car =
        await carResponse.json();
    }


    /* -------------------------------------
       WALK
    ------------------------------------- */

    if (
      walkResponse.ok
    ) {

      walk =
        await walkResponse.json();
    }


    /* -------------------------------------
       ROUTE DATA
    ------------------------------------- */

    let geometry =
      null;


    if (
      walk?.trip?.legs?.length
    ) {

      geometry =
        walk.trip
          .legs[0]
          .shape;
    }


    /*
      Valhalla shape может быть encoded polyline.
      Если пеший маршрут не получился,
      показываем автомобильный.
    */


    if (
      !geometry &&
      car?.routes?.length
    ) {

      geometry =
        car.routes[0]
          .geometry;
    }


    /* -------------------------------------
       DRAW ROUTE
    ------------------------------------- */

    if (routeLine) {

      map.removeLayer(
        routeLine
      );

      routeLine =
        null;
    }


    if (
      car?.routes?.length
    ) {

      const route =
        car.routes[0];


      routeLine =
        L.geoJSON(
          route.geometry
        ).addTo(map);


      map.fitBounds(
        routeLine.getBounds(),
        {
          padding: [
            40,
            40
          ]
        }
      );
    }


    /* -------------------------------------
       ROUTE PANEL
    ------------------------------------- */

    document.getElementById(
      'routeTitle'
    ).textContent =
      `🧭 ${place.name}`;


    /* WALK */

    if (
      walk?.trip
    ) {

      const summary =
        walk.trip.summary;


      document.getElementById(
        'walkDistance'
      ).textContent =
        formatDistance(
          Number(
            summary.length
          )
        );


      document.getElementById(
        'walkTime'
      ).textContent =
        formatTime(
          Number(
            summary.time
          )
        );
    }

    else {

      document.getElementById(
        'walkDistance'
      ).textContent =
        '—';


      document.getElementById(
        'walkTime'
      ).textContent =
        '—';
    }


    /* CAR */

    if (
      car?.routes?.length
    ) {

      document.getElementById(
        'carDistance'
      ).textContent =
        formatDistance(
          car.routes[0]
            .distance / 1000
        );


      document.getElementById(
        'carTime'
      ).textContent =
        formatTime(
          car.routes[0]
            .duration
        );
    }

    else {

      document.getElementById(
        'carDistance'
      ).textContent =
        '—';


      document.getElementById(
        'carTime'
      ).textContent =
        '—';
    }


    document
      .getElementById(
        'routePanel'
      )
      .classList.remove(
        'hidden'
      );


    document
      .getElementById(
        'modal'
      )
      .classList.add(
        'hidden'
      );


    setStatus(
      '🧭 Маршрут построен'
    );

  } catch (error) {

    console.error(
      'Routing error:',
      error
    );


    setStatus(
      '❌ Не удалось построить маршрут'
    );


    alert(
      'Не удалось построить маршрут. Попробуйте ещё раз.'
    );
  }
}


/* =========================================
   MY PLACES
========================================= */

async function loadMyPlaces() {

  setStatus(
    '⭐ Загружаю мои места...'
  );


  try {

    const response =
      await fetch(
        `${API}/api/visits?user_id=${encodeURIComponent(user.id)}`
      );


    if (!response.ok) {

      setStatus(
        '❌ Не удалось загрузить места'
      );

      return;
    }


    const list =
      await response.json();


    clearMarkers();


    places.clear();


    if (
      !list.length
    ) {

      setStatus(
        'У вас пока нет сохранённых мест'
      );

      return;
    }


    for (
      const visit
      of list
    ) {

      const place = {

        id:
          visit.place_id,

        name:
          visit.name,

        address:
          visit.address,

        lat:
          visit.lat,

        lon:
          visit.lon,

        icon:
          visit.sold
            ? '💰'
            : '📍'
      };


      places.set(
        String(place.id),
        place
      );


      const marker =
        L.marker(
          [
            Number(place.lat),
            Number(place.lon)
          ],
          {
            icon:
              createIcon(
                place
              )
          }
        )
        .addTo(map);


      marker.bindPopup(
        popup(
          place,
          visit
        )
      );


      markers.set(
        String(place.id),
        marker
      );
    }


    const group =
      L.featureGroup(
        [
          ...markers.values()
        ]
      );


    map.fitBounds(
      group
        .getBounds()
        .pad(0.2)
    );


    setStatus(
      `⭐ Мест: ${list.length}`
    );

  } catch (error) {

    console.error(
      'My places error:',
      error
    );


    setStatus(
      '❌ Ошибка загрузки мест'
    );
  }
}


/* =========================================
   CLOSE SEARCH RESULTS
========================================= */

document
  .getElementById(
    'closeResults'
  )
  .addEventListener(
    'click',
    () => {

      document
        .getElementById(
          'resultsPanel'
        )
        .classList.add(
          'hidden'
        );
    }
  );


/* =========================================
   CLOSE ROUTE
========================================= */

document
  .getElementById(
    'closeRoute'
  )
  .addEventListener(
    'click',
    () => {

      document
        .getElementById(
          'routePanel'
        )
        .classList.add(
          'hidden'
        );


      if (routeLine) {

        map.removeLayer(
          routeLine
        );

        routeLine =
          null;
      }
    }
  );


/* =========================================
   CLOSE PLACE MODAL
========================================= */

document
  .getElementById(
    'closeModal'
  )
  .addEventListener(
    'click',
    () => {

      document
        .getElementById(
          'modal'
        )
        .classList.add(
          'hidden'
        );
    }
  );


/* =========================================
   SOLD YES
========================================= */

document
  .getElementById(
    'soldYes'
  )
  .addEventListener(
    'click',
    async () => {

      if (!selectedPlace) {
        return;
      }


      const note =
        document
          .getElementById(
            'note'
          )
          .value
          .trim();


      const result =
        await saveVisit(
          selectedPlace,
          true,
          note
        );


      if (result) {

        document
          .getElementById(
            'modal'
          )
          .classList.add(
            'hidden'
          );
      }
    }
  );


/* =========================================
   SOLD NO
========================================= */

document
  .getElementById(
    'soldNo'
  )
  .addEventListener(
    'click',
    async () => {

      if (!selectedPlace) {
        return;
      }


      const note =
        document
          .getElementById(
            'note'
          )
          .value
          .trim();


      const result =
        await saveVisit(
          selectedPlace,
          false,
          note
        );


      if (result) {

        document
          .getElementById(
            'modal'
          )
          .classList.add(
            'hidden'
          );
      }
    }
  );


/* =========================================
   SAVE NOTE
========================================= */

document
  .getElementById(
    'saveNote'
  )
  .addEventListener(
    'click',
    async () => {

      if (!selectedPlace) {
        return;
      }


      const oldVisit =
        await getVisit(
          selectedPlace.id
        );


      const note =
        document
          .getElementById(
            'note'
          )
          .value
          .trim();


      const result =
        await saveVisit(
          selectedPlace,

          oldVisit?.sold === true,

          note
        );


      if (result) {

        document
          .getElementById(
            'modal'
          )
          .classList.add(
            'hidden'
          );
      }
    }
  );


/* =========================================
   ROUTE BUTTON
========================================= */

document
  .getElementById(
    'routeBtn'
  )
  .addEventListener(
    'click',
    () => {

      if (!selectedPlace) {

        return;
      }


      buildRoute(
        selectedPlace.id
      );
    }
  );


/* =========================================
   SEARCH BUTTON
========================================= */

document
  .getElementById(
    'searchBtn'
  )
  .addEventListener(
    'click',
    searchPlaces
  );


/* =========================================
   ENTER SEARCH
========================================= */

document
  .getElementById(
    'search'
  )
  .addEventListener(
    'keydown',
    event => {

      if (
        event.key === 'Enter'
      ) {

        searchPlaces();
      }
    }
  );


/* =========================================
   LOCATION BUTTON
========================================= */

document
  .getElementById(
    'locationBtn'
  )
  .addEventListener(
    'click',
    locateUser
  );


/* =========================================
   MY PLACES BUTTON
========================================= */

document
  .getElementById(
    'allBtn'
  )
  .addEventListener(
    'click',
    loadMyPlaces
  );


/* =========================================
   CLEAR MARKERS
========================================= */

function clearMarkers() {

  markers.forEach(
    marker => {

      map.removeLayer(
        marker
      );
    }
  );


  markers.clear();
}


/* =========================================
   START
========================================= */

locateUser();