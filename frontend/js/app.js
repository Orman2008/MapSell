const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();
}


const API = window.APP_CONFIG.API_BASE_URL.replace(/\/$/, "");

const user =
  tg?.initDataUnsafe?.user ||
  {
    id: 0,
    first_name: "Web User"
  };


const map = L.map("map").setView(
  [41.2995, 69.2401],
  12
);


L.tileLayer(
  "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  {
    attribution: "&copy; OpenStreetMap contributors"
  }
).addTo(map);


let markers = new Map();

let places = new Map();

let currentLocation = null;

let userMarker = null;

let routeLayer = null;

let selectedPlace = null;

let selectedVisit = null;


function setStatus(text) {

  document.getElementById("status").textContent =
    text || "";

}


function escapeHtml(value) {

  return String(value ?? "")
    .replace(/[&<>"']/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[c]));

}


function clearMarkers() {

  markers.forEach(marker => {

    map.removeLayer(marker);

  });

  markers.clear();

}


function distanceKm(lat1, lon1, lat2, lon2) {

  const R = 6371;

  const p1 = lat1 * Math.PI / 180;

  const p2 = lat2 * Math.PI / 180;

  const dp =
    (lat2 - lat1) * Math.PI / 180;

  const dl =
    (lon2 - lon1) * Math.PI / 180;

  const a =
    Math.sin(dp / 2) ** 2 +
    Math.cos(p1) *
    Math.cos(p2) *
    Math.sin(dl / 2) ** 2;

  return (
    R *
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    )
  );

}


function getCurrentLocation() {

  return new Promise((resolve, reject) => {

    if (!navigator.geolocation) {

      reject(
        new Error(
          "Геолокация не поддерживается"
        )
      );

      return;

    }


    navigator.geolocation.getCurrentPosition(

      position => {

        currentLocation = {

          lat: position.coords.latitude,

          lon: position.coords.longitude

        };


        showUserLocation();


        resolve(currentLocation);

      },

      error => {

        reject(error);

      },

      {
        enableHighAccuracy: true,

        timeout: 10000,

        maximumAge: 10000

      }

    );

  });

}


function showUserLocation() {

  if (!currentLocation) return;


  if (userMarker) {

    userMarker.setLatLng([
      currentLocation.lat,
      currentLocation.lon
    ]);

  } else {

    userMarker = L.marker(
      [
        currentLocation.lat,
        currentLocation.lon
      ],
      {
        title: "Моё местоположение"
      }
    ).addTo(map);

    userMarker.bindPopup(
      "📍 <b>Вы здесь</b>"
    );

  }

}


async function ensureLocation() {

  if (currentLocation) {

    return currentLocation;

  }


  setStatus(
    "Получаю ваше местоположение..."
  );


  try {

    return await getCurrentLocation();

  } catch (error) {

    setStatus(
      "Не удалось получить местоположение"
    );

    throw error;

  }

}


async function searchPlaces() {

  const q =
    document
      .getElementById("search")
      .value
      .trim();


  if (!q) return;


  try {

    const location =
      await ensureLocation();


    setStatus(
      "Ищу места рядом с вами..."
    );


    const url =
      `${API}/api/places/search` +
      `?q=${encodeURIComponent(q)}` +
      `&lat=${location.lat}` +
      `&lon=${location.lon}`;


    const response =
      await fetch(url);


    if (!response.ok) {

      throw new Error(
        `Search HTTP ${response.status}`
      );

    }


    const data =
      await response.json();


    clearMarkers();

    clearRoute();

    places.clear();


    if (!data.length) {

      setStatus(
        "Ничего не найдено"
      );

      document.getElementById(
        "resultsPanel"
      ).classList.add("open");

      document.getElementById(
        "resultsList"
      ).innerHTML =
        `<div class="empty">
          Ничего не найдено.
        </div>`;

      return;

    }


    document.getElementById(
      "resultsPanel"
    ).classList.add("open");


    document.getElementById(
      "resultsTitle"
    ).textContent =
      `Найдено: ${data.length}`;


    const list =
      document.getElementById(
        "resultsList"
      );


    list.innerHTML = "";


    const bounds = [];


    for (const place of data) {

      places.set(
        String(place.id),
        place
      );


      const straight =
        place.distance_straight ??
        distanceKm(
          location.lat,
          location.lon,
          place.lat,
          place.lon
        ) * 1000;


      place.distanceKm =
        straight / 1000;


      const marker =
        createMarker(place);


      markers.set(
        String(place.id),
        marker
      );


      bounds.push([
        place.lat,
        place.lon
      ]);


      const item =
        document.createElement("div");


      item.className =
        "result-item";


      item.innerHTML = `

        <div class="result-icon">
          ${place.category || "📍"}
        </div>

        <div class="result-info">

          <b>
            ${escapeHtml(place.name)}
          </b>

          <small>
            ${escapeHtml(place.address || "")}
          </small>

          <div class="result-distance">

            📍 ${place.distanceKm.toFixed(1)} км

            <span
              class="route-times"
              id="time-${CSS.escape(String(place.id))}"
            >
              Расчёт маршрута...
            </span>

          </div>

        </div>

      `;


      item.addEventListener(
        "click",
        () => {

          map.setView(
            [
              place.lat,
              place.lon
            ],
            17
          );

          marker.openPopup();

          openPlace(place);

        }
      );


      list.appendChild(item);


      calculateTimesForResult(
        place,
        location
      );

    }


    if (bounds.length) {

      map.fitBounds(
        bounds,
        {
          padding: [50, 50]
        }
      );

    }


    setStatus(
      `Найдено: ${data.length}`
    );

  } catch (error) {

    console.error(error);

    setStatus(
      "Ошибка поиска"
    );

  }

}


function createMarker(place) {

  const icon =
    L.divIcon({

      className: "custom-marker",

      html: `
        <div class="marker-pin">
          ${place.category || "📍"}
        </div>
      `,

      iconSize: [42, 42],

      iconAnchor: [21, 42]

    });


  const marker =
    L.marker(
      [
        place.lat,
        place.lon
      ],
      {
        icon
      }
    ).addTo(map);


  marker.on(
    "click",
    () => openPlace(place)
  );


  return marker;

}


async function calculateTimesForResult(
  place,
  location
) {

  try {

    const [walk, car] =
      await Promise.all([

        getRoute(
          location,
          place,
          "pedestrian"
        ),

        getRoute(
          location,
          place,
          "auto"
        )

      ]);


    const element =
      document.getElementById(
        `time-${CSS.escape(String(place.id))}`
      );


    if (!element) return;


    element.innerHTML =
      `🚶 ${formatMinutes(walk.duration_min)}
       · 🚗 ${formatMinutes(car.duration_min)}`;

  } catch (error) {

    console.warn(
      "Route calculation failed",
      error
    );

  }

}


function formatMinutes(minutes) {

  if (minutes < 60) {

    return `${minutes} мин`;

  }

  const h =
    Math.floor(minutes / 60);

  const m =
    minutes % 60;

  return `${h} ч ${m} мин`;

}


async function getRoute(
  from,
  place,
  mode
) {

  const url =
    `${API}/api/route` +
    `?from_lat=${from.lat}` +
    `&from_lon=${from.lon}` +
    `&to_lat=${place.lat}` +
    `&to_lon=${place.lon}` +
    `&mode=${mode}`;


  const response =
    await fetch(url);


  if (!response.ok) {

    throw new Error(
      `Route HTTP ${response.status}`
    );

  }


  return response.json();

}


async function navigateTo(
  place,
  mode = "pedestrian"
) {

  try {

    const location =
      await ensureLocation();


    setStatus(
      "Строю маршрут..."
    );


    const route =
      await getRoute(
        location,
        place,
        mode
      );


    drawRoute(
      route,
      mode
    );


    const distance =
      route.distance_km;


    const duration =
      route.duration_min;


    document.getElementById(
      "navigationInfo"
    ).innerHTML = `

      <b>
        ${mode === "pedestrian"
          ? "🚶 Пешком"
          : "🚗 Машина"}
      </b>

      <span>
        ${distance.toFixed(2)} км
      </span>

      <span>
        ${formatMinutes(duration)}
      </span>

    `;


    setStatus(
      "Маршрут построен"
    );

  } catch (error) {

    console.error(error);

    setStatus(
      "Не удалось построить маршрут"
    );

  }

}


function decodePolyline6(encoded) {

  let index = 0;

  let lat = 0;

  let lng = 0;

  const coordinates = [];


  while (index < encoded.length) {

    let b;

    let shift = 0;

    let result = 0;


    do {

      b =
        encoded.charCodeAt(index++) -
        63;

      result |=
        (b & 0x1f) <<
        shift;

      shift += 5;

    } while (b >= 0x20);


    const dlat =
      (result & 1)
        ? ~(result >> 1)
        : (result >> 1);


    lat += dlat;


    shift = 0;

    result = 0;


    do {

      b =
        encoded.charCodeAt(index++) -
        63;

      result |=
        (b & 0x1f) <<
        shift;

      shift += 5;

    } while (b >= 0x20);


    const dlng =
      (result & 1)
        ? ~(result >> 1)
        : (result >> 1);


    lng += dlng;


    coordinates.push([
      lat / 1e6,
      lng / 1e6
    ]);

  }


  return coordinates;

}


function drawRoute(
  route,
  mode
) {

  clearRoute();


  if (!route.shape) return;


  const coordinates =
    decodePolyline6(
      route.shape
    );


  routeLayer =
    L.polyline(
      coordinates,
      {
        weight: 6,
        opacity: 0.85
      }
    ).addTo(map);


  map.fitBounds(
    routeLayer.getBounds(),
    {
      padding: [80, 80]
    }
  );

}


function clearRoute() {

  if (routeLayer) {

    map.removeLayer(
      routeLayer
    );

    routeLayer = null;

  }

}


function openPlace(place) {

  selectedPlace = place;


  getVisit(place.id)
    .then(visit => {

      selectedVisit = visit;

      renderPlaceModal(
        place,
        visit
      );

    });


  document
    .getElementById("placeModal")
    .classList.remove("hidden");

}


async function getVisit(placeId) {

  const response =
    await fetch(
      `${API}/api/visits/${encodeURIComponent(placeId)}` +
      `?user_id=${encodeURIComponent(user.id)}`
    );


  if (!response.ok) {

    return null;

  }


  return response.json();

}


function renderPlaceModal(
  place,
  visit
) {

  const sold =
    visit?.sold === true;


  const visited =
    visit?.visited === true;


  const distance =
    currentLocation
      ? distanceKm(
          currentLocation.lat,
          currentLocation.lon,
          place.lat,
          place.lon
        )
      : null;


  document.getElementById(
    "placeContent"
  ).innerHTML = `

    <div class="place-title">

      <div class="big-place-icon">
        ${place.category || "📍"}
      </div>

      <div>

        <h2>
          ${escapeHtml(place.name)}
        </h2>

        <p>
          ${escapeHtml(place.address || "Адрес не указан")}
        </p>

      </div>

    </div>


    ${
      distance !== null
        ? `<div class="place-distance">
             📍 ${distance.toFixed(2)} км
           </div>`
        : ""
    }


    <div
      id="navigationInfo"
      class="navigation-info"
    >
      Выберите способ маршрута
    </div>


    <div class="route-buttons">

      <button
        id="walkBtn"
      >
        🚶 Пешком
      </button>

      <button
        id="carBtn"
      >
        🚗 Машина
      </button>

    </div>


    <div class="sale-section">

      <h3>
        Продал?
      </h3>

      <div class="sale-buttons">

        <button
          class="${sold ? "sold-active" : ""}"
          id="soldYes"
        >
          + Продал
        </button>

        <button
          class="${!sold && visited ? "not-sold-active" : ""}"
          id="soldNo"
        >
          − Не продал
        </button>

      </div>

    </div>


    <div class="current-note">

      ${
        visit?.note
          ? `
            <h3>📝 Заметка</h3>
            <div class="saved-note">
              ${escapeHtml(visit.note)}
            </div>
          `
          : `
            <div class="muted">
              Заметки пока нет
            </div>
          `
      }

      <button
        id="addNoteBtn"
        class="note-button"
      >
        📝 ${visit?.note
          ? "Изменить заметку"
          : "Добавить заметку"}
      </button>

    </div>

  `;


  document.getElementById(
    "walkBtn"
  ).onclick =
    () => navigateTo(
      place,
      "pedestrian"
    );


  document.getElementById(
    "carBtn"
  ).onclick =
    () => navigateTo(
      place,
      "auto"
    );


  document.getElementById(
    "soldYes"
  ).onclick =
    () => saveVisit(
      place,
      true,
      true,
      visit?.note || null
    );


  document.getElementById(
    "soldNo"
  ).onclick =
    () => saveVisit(
      place,
      true,
      false,
      visit?.note || null
    );


  document.getElementById(
    "addNoteBtn"
  ).onclick =
    () => openNoteModal(
      place,
      visit
    );

}


async function saveVisit(
  place,
  visited,
  sold,
  note
) {

  const payload = {

    place_id: String(place.id),

    name: place.name,

    address: place.address || "",

    lat: place.lat,

    lon: place.lon,

    visited,

    sold,

    note,

    user_id: String(user.id),

    user_name:
      user.first_name || "User"

  };


  const response =
    await fetch(
      `${API}/api/visits`,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify(payload)
      }
    );


  if (!response.ok) {

    alert(
      "Не удалось сохранить"
    );

    return;

  }


  const saved =
    await response.json();


  selectedVisit = saved;


  renderPlaceModal(
    place,
    saved
  );


  const marker =
    markers.get(
      String(place.id)
    );


  if (marker) {

    marker.setPopupContent(
      popupHTML(
        place,
        saved
      )
    );

  }

}


function popupHTML(
  place,
  visit
) {

  return `

    <div class="popup">

      <h3>
        ${place.category || "📍"}
        ${escapeHtml(place.name)}
      </h3>

      <p>
        ${escapeHtml(
          place.address || ""
        )}
      </p>

      <p>
        ${
          visit?.sold
            ? "🟢 Продано"
            : visit?.visited
              ? "🔴 Не продано"
              : "⚪ Не отмечено"
        }
      </p>

      <button
        onclick="openPlaceById('${String(place.id).replace(/'/g, "\\'")}')"
      >
        Открыть
      </button>

    </div>

  `;

}


window.openPlaceById =
  function(id) {

    const place =
      places.get(
        String(id)
      );

    if (place) {

      openPlace(place);

    }

  };


function openNoteModal(
  place,
  visit
) {

  selectedPlace = place;

  selectedVisit = visit;


  document.getElementById(
    "note"
  ).value =
    visit?.note || "";


  document
    .getElementById("noteModal")
    .classList.remove("hidden");

}


async function saveNote() {

  if (!selectedPlace) return;


  const note =
    document.getElementById(
      "note"
    ).value.trim();


  await saveVisit(

    selectedPlace,

    true,

    selectedVisit?.sold === true,

    note || null

  );


  document
    .getElementById("noteModal")
    .classList.add("hidden");

}


async function loadMyPlaces() {

  try {

    const response =
      await fetch(
        `${API}/api/visits?user_id=${encodeURIComponent(user.id)}`
      );


    if (!response.ok) {

      throw new Error(
        `HTTP ${response.status}`
      );

    }


    const list =
      await response.json();


    clearMarkers();

    clearRoute();

    places.clear();


    if (!list.length) {

      setStatus(
        "У вас пока нет отмеченных мест"
      );

      return;

    }


    const bounds = [];


    for (const visit of list) {

      const place = {

        id: visit.place_id,

        name: visit.name,

        address: visit.address,

        lat: visit.lat,

        lon: visit.lon,

        category:
          visit.sold
            ? "💰"
            : "📍"

      };


      places.set(
        String(place.id),
        place
      );


      const marker =
        createMarker(
          place
        );


      marker.bindPopup(
        popupHTML(
          place,
          visit
        )
      );


      markers.set(
        String(place.id),
        marker
      );


      bounds.push([
        place.lat,
        place.lon
      ]);

    }


    map.fitBounds(
      bounds,
      {
        padding: [70, 70]
      }
    );


    setStatus(
      `Моих мест: ${list.length}`
    );

  } catch (error) {

    console.error(error);

    setStatus(
      "Не удалось загрузить мои места"
    );

  }

}


document.getElementById(
  "searchBtn"
).onclick =
  searchPlaces;


document.getElementById(
  "search"
).addEventListener(
  "keydown",
  event => {

    if (event.key === "Enter") {

      searchPlaces();

    }

  }
);


document.getElementById(
  "locationBtn"
).onclick =
  async () => {

    try {

      await getCurrentLocation();

      map.setView(
        [
          currentLocation.lat,
          currentLocation.lon
        ],
        16
      );

      userMarker.openPopup();

    } catch {

      setStatus(
        "Разрешите доступ к геолокации"
      );

    }

  };


document.getElementById(
  "allBtn"
).onclick =
  loadMyPlaces;


document.getElementById(
  "closeResults"
).onclick =
  () => {

    document
      .getElementById(
        "resultsPanel"
      )
      .classList.remove("open");

  };


document.getElementById(
  "closePlace"
).onclick =
  () => {

    document
      .getElementById(
        "placeModal"
      )
      .classList.add("hidden");

  };


document.getElementById(
  "closeNote"
).onclick =
  () => {

    document
      .getElementById(
        "noteModal"
      )
      .classList.add("hidden");

  };


document.getElementById(
  "saveNote"
).onclick =
  saveNote;


// Try to get GPS immediately.
getCurrentLocation()
  .catch(() => {
    // User may deny location.
  });