const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();
}

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


const API = (
  window.APP_CONFIG?.API_BASE_URL || ""
).replace(/\/$/, "");


const user =
  tg?.initDataUnsafe?.user || {
    id: 0,
    first_name: "Web User"
  };


let markers = new Map();
let places = new Map();

let selectedPlace = null;

let currentPosition = null;
let userMarker = null;
let routeLine = null;


/* =====================================================
   HELPERS
===================================================== */

function setStatus(text) {

  const el =
    document.getElementById("status");

  if (el) {
    el.textContent = text || "";
  }
}


function escapeHtml(value) {

  return String(value ?? "")
    .replace(
      /[&<>"']/g,
      c => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
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


/* =====================================================
   LOCATION
===================================================== */

function locateUser() {

  if (!navigator.geolocation) {

    alert(
      "Ваш браузер не поддерживает геолокацию."
    );

    return;
  }

  setStatus(
    "📍 Определяю местоположение..."
  );

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
            color: "#ffffff",
            weight: 3,
            fillOpacity: 1
          }
        )
        .addTo(map)
        .bindPopup(
          "📍 Ваше местоположение"
        );

      map.setView(
        [
          currentPosition.lat,
          currentPosition.lon
        ],
        15
      );

      setStatus(
        "📍 Местоположение найдено"
      );
    },

    error => {

      console.error(error);

      setStatus(
        "❌ Не удалось определить местоположение"
      );

      alert(
        "Разреши сайту доступ к геолокации."
      );
    },

    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 30000
    }
  );
}


/* =====================================================
   ICON
===================================================== */

function createIcon(place) {

  let icon = place.icon;

  if (!icon) {

    const type =
      String(
        place.type ||
        place.category ||
        ""
      ).toLowerCase();

    if (
      type.includes("shop") ||
      type.includes("supermarket") ||
      type.includes("store")
    ) {
      icon = "🛒";
    }

    else if (
      type.includes("pharmacy")
    ) {
      icon = "💊";
    }

    else if (
      type.includes("dentist")
    ) {
      icon = "🦷";
    }

    else if (
      type.includes("restaurant")
    ) {
      icon = "🍽️";
    }

    else if (
      type.includes("cafe")
    ) {
      icon = "☕";
    }

    else {
      icon = "📍";
    }
  }

  return L.divIcon({

    className: "custom-marker",

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


/* =====================================================
   POPUP
===================================================== */

function popup(place, visit) {

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
      : `
        <div class="note-preview">
          Заметок пока нет
        </div>
      `;

  return `
    <div class="popup">

      <h3>
        ${escapeHtml(
          place.name || "Место"
        )}
      </h3>

      <p>
        ${escapeHtml(
          place.address || ""
        )}
      </p>

      <p>
        ${
          sold
            ? "🟢 Продано"
            : "🔴 Не продано"
        }
      </p>

      ${note}

      <div class="actions">

        <button
          onclick="openPlace('${place.id}')"
        >
          📝 Открыть
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


/* =====================================================
   OPEN PLACE
===================================================== */

async function openPlace(id) {

  const place =
    places.get(String(id));

  if (!place) return;

  selectedPlace = place;

  const visit =
    await getVisit(place.id);

  const modal =
    document.getElementById(
      "placeModal"
    );

  const content =
    document.getElementById(
      "placeContent"
    );

  if (!modal || !content) {
    return;
  }

  content.innerHTML = `

    <h2>
      ${escapeHtml(place.name)}
    </h2>

    <p>
      ${escapeHtml(
        place.address || ""
      )}
    </p>

    <hr>

    <p>
      ${
        visit?.sold
          ? "🟢 Продано"
          : "🔴 Не продано"
      }
    </p>

    ${
      visit?.note
        ? `
          <div class="note-preview">
            📝 ${escapeHtml(
              visit.note
            )}
          </div>
        `
        : ""
    }

    <div class="actions">

      <button
        id="placeSoldYes"
      >
        ➕ Продал
      </button>

      <button
        id="placeSoldNo"
        class="secondary"
      >
        ➖ Не продал
      </button>

      <button
        id="placeNote"
        class="secondary"
      >
        📝 Заметка
      </button>

      <button
        id="placeRoute"
      >
        🧭 Маршрут
      </button>

    </div>
  `;

  modal.classList.remove(
    "hidden"
  );


  document.getElementById(
    "placeSoldYes"
  ).onclick = async () => {

    await saveVisit(
      place,
      true,
      visit?.note || ""
    );

    modal.classList.add(
      "hidden"
    );
  };


  document.getElementById(
    "placeSoldNo"
  ).onclick = async () => {

    await saveVisit(
      place,
      false,
      visit?.note || ""
    );

    modal.classList.add(
      "hidden"
    );
  };


  document.getElementById(
    "placeNote"
  ).onclick = () => {

    const noteModal =
      document.getElementById(
        "noteModal"
      );

    const textarea =
      document.getElementById(
        "note"
      );

    textarea.value =
      visit?.note || "";

    noteModal.classList.remove(
      "hidden"
    );
  };


  document.getElementById(
    "placeRoute"
  ).onclick = () => {

    buildRoute(
      place.id
    );
  };
}


/* =====================================================
   VISIT API
===================================================== */

async function getVisit(placeId) {

  try {

    const r =
      await fetch(
        `${API}/api/visits/${encodeURIComponent(
          placeId
        )}?user_id=${encodeURIComponent(
          user.id
        )}`
      );

    if (!r.ok) {
      return null;
    }

    return await r.json();

  } catch (error) {

    console.error(
      "getVisit:",
      error
    );

    return null;
  }
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
      place.address || "",

    lat:
      Number(place.lat),

    lon:
      Number(place.lon),

    visited:
      true,

    sold:
      Boolean(sold),

    note:
      note
        ? note
        : null,

    user_id:
      String(user.id),

    user_name:
      user.first_name ||
      "User"
  };


  try {

    const r =
      await fetch(
        `${API}/api/visits`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify(
              payload
            )
        }
      );


    if (!r.ok) {

      const text =
        await r.text();

      console.error(
        "SAVE ERROR:",
        text
      );

      alert(
        "Не удалось сохранить место."
      );

      return;
    }


    const visit =
      await r.json();


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

  } catch (error) {

    console.error(
      "saveVisit:",
      error
    );

    alert(
      "Ошибка соединения с сервером."
    );
  }
}


/* =====================================================
   SEARCH
===================================================== */

async function searchPlaces() {

  const input =
    document.getElementById(
      "search"
    );

  const q =
    input.value.trim();

  if (!q) {
    return;
  }


  setStatus(
    "🔎 Ищу места..."
  );


  try {

    const lat =
      currentPosition?.lat ||
      41.2995;

    const lon =
      currentPosition?.lon ||
      69.2401;


    const url =
      `${API}/api/places/search` +
      `?q=${encodeURIComponent(q)}` +
      `&lat=${lat}` +
      `&lon=${lon}`;


    console.log(
      "SEARCH URL:",
      url
    );


    const response =
      await fetch(url);


    if (!response.ok) {

      const errorText =
        await response.text();

      console.error(
        "SEARCH ERROR:",
        response.status,
        errorText
      );

      setStatus(
        `❌ Ошибка поиска (${response.status})`
      );

      return;
    }


    const data =
      await response.json();


    clearMarkers();


    const list =
      document.getElementById(
        "resultsList"
      );

    if (list) {
      list.innerHTML = "";
    }


    if (!data.length) {

      setStatus(
        "Ничего не найдено"
      );

      return;
    }


    for (const place of data) {

      places.set(
        String(place.id),
        place
      );


      const marker =
        L.marker(
          [
            place.lat,
            place.lon
          ],
          {
            icon:
              createIcon(place)
          }
        ).addTo(map);


      markers.set(
        String(place.id),
        marker
      );


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


      let distance = "—";

      if (currentPosition) {

        const km =
          distanceKm(
            currentPosition.lat,
            currentPosition.lon,
            place.lat,
            place.lon
          );

        distance =
          formatDistance(km);
      }


      if (list) {

        const item =
          document.createElement(
            "div"
          );

        item.className =
          "result-item";


        item.innerHTML = `

          <div class="result-icon">
            ${createListIcon(place)}
          </div>

          <div class="result-content">

            <b>
              ${escapeHtml(
                place.name
              )}
            </b>

            <span>
              ${escapeHtml(
                place.address || ""
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
            [
              place.lat,
              place.lon
            ],
            17
          );

          marker.openPopup();
        };


        list.appendChild(
          item
        );
      }
    }


    const panel =
      document.getElementById(
        "resultsPanel"
      );

    if (panel) {
      panel.classList.remove(
        "hidden"
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
      `Найдено: ${data.length}`
    );

  } catch (error) {

    console.error(
      "SEARCH CONNECTION ERROR:",
      error
    );

    setStatus(
      "❌ Ошибка соединения с сервером"
    );
  }
}


/* =====================================================
   SEARCH ICON
===================================================== */

function createListIcon(place) {

  const type =
    String(
      place.type ||
      place.category ||
      ""
    ).toLowerCase();


  if (
    type.includes("shop") ||
    type.includes("store") ||
    type.includes("supermarket")
  ) {
    return "🛒";
  }


  if (
    type.includes("pharmacy")
  ) {
    return "💊";
  }


  if (
    type.includes("dentist")
  ) {
    return "🦷";
  }


  if (
    type.includes("restaurant")
  ) {
    return "🍽️";
  }


  if (
    type.includes("cafe")
  ) {
    return "☕";
  }


  return "📍";
}


/* =====================================================
   ROUTE
===================================================== */

async function buildRoute(id) {

  const place =
    places.get(
      String(id)
    );

  if (!place) {
    return;
  }


  if (!currentPosition) {

    locateUser();

    alert(
      "Сначала разреши доступ к местоположению."
    );

    return;
  }


  const start =
    `${currentPosition.lon},${currentPosition.lat}`;

  const end =
    `${place.lon},${place.lat}`;


  try {

    /*
      Автомобильный маршрут
    */

    const carUrl =
      `https://router.project-osrm.org/route/v1/driving/${start};${end}?overview=full&geometries=geojson`;


    const carResponse =
      await fetch(
        carUrl
      );


    const car =
      await carResponse.json();


    if (
      car.code !== "Ok"
    ) {

      alert(
        "Маршрут не найден."
      );

      return;
    }


    if (routeLine) {

      map.removeLayer(
        routeLine
      );
    }


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


    const routePanel =
      document.getElementById(
        "routePanel"
      );


    if (routePanel) {

      routePanel.classList.remove(
        "hidden"
      );

      const title =
        document.getElementById(
          "routeTitle"
        );

      const carDistance =
        document.getElementById(
          "carDistance"
        );

      const carTime =
        document.getElementById(
          "carTime"
        );


      if (title) {
        title.textContent =
          `🧭 ${place.name}`;
      }


      if (carDistance) {
        carDistance.textContent =
          formatDistance(
            route.distance / 1000
          );
      }


      if (carTime) {
        carTime.textContent =
          formatTime(
            route.duration
          );
      }
    }


    const modal =
      document.getElementById(
        "placeModal"
      );

    if (modal) {
      modal.classList.add(
        "hidden"
      );
    }

  } catch (error) {

    console.error(
      "ROUTE ERROR:",
      error
    );

    alert(
      "Не удалось построить маршрут."
    );
  }
}


/* =====================================================
   MY PLACES
===================================================== */

async function loadMyPlaces() {

  setStatus(
    "⭐ Загружаю мои места..."
  );


  try {

    const response =
      await fetch(
        `${API}/api/visits?user_id=${encodeURIComponent(
          user.id
        )}`
      );


    if (!response.ok) {

      setStatus(
        "❌ Не удалось загрузить места"
      );

      return;
    }


    const list =
      await response.json();


    clearMarkers();


    for (const visit of list) {

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
            ? "💰"
            : "📍"
      };


      places.set(
        String(place.id),
        place
      );


      const marker =
        L.marker(
          [
            place.lat,
            place.lon
          ],
          {
            icon:
              createIcon(place)
          }
        ).addTo(map);


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


    if (list.length) {

      map.fitBounds(
        L.featureGroup(
          [
            ...markers.values()
          ]
        )
        .getBounds()
        .pad(0.2)
      );


      setStatus(
        `⭐ Мест: ${list.length}`
      );

    } else {

      setStatus(
        "У тебя пока нет сохранённых мест"
      );
    }

  } catch (error) {

    console.error(
      error
    );

    setStatus(
      "❌ Ошибка загрузки мест"
    );
  }
}


/* =====================================================
   EVENTS
===================================================== */

const searchBtn =
  document.getElementById(
    "searchBtn"
  );

if (searchBtn) {

  searchBtn.onclick =
    searchPlaces;
}


const searchInput =
  document.getElementById(
    "search"
  );

if (searchInput) {

  searchInput.addEventListener(
    "keydown",
    event => {

      if (
        event.key === "Enter"
      ) {
        searchPlaces();
      }
    }
  );
}


const locationBtn =
  document.getElementById(
    "locationBtn"
  );

if (locationBtn) {

  locationBtn.onclick =
    locateUser;
}


const allBtn =
  document.getElementById(
    "allBtn"
  );

if (allBtn) {

  allBtn.onclick =
    loadMyPlaces;
}


const closeResults =
  document.getElementById(
    "closeResults"
  );

if (closeResults) {

  closeResults.onclick =
    () => {

      document
        .getElementById(
          "resultsPanel"
        )
        ?.classList.add(
          "hidden"
        );
    };
}


const closePlace =
  document.getElementById(
    "closePlace"
  );

if (closePlace) {

  closePlace.onclick =
    () => {

      document
        .getElementById(
          "placeModal"
        )
        ?.classList.add(
          "hidden"
        );
    };
}


const closeNote =
  document.getElementById(
    "closeNote"
  );

if (closeNote) {

  closeNote.onclick =
    () => {

      document
        .getElementById(
          "noteModal"
        )
        ?.classList.add(
          "hidden"
        );
    };
}


const saveNote =
  document.getElementById(
    "saveNote"
  );

if (saveNote) {

  saveNote.onclick =
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
            "note"
          )
          .value
          .trim();


      await saveVisit(
        selectedPlace,
        oldVisit?.sold || false,
        note
      );


      document
        .getElementById(
          "noteModal"
        )
        ?.classList.add(
          "hidden"
        );


      document
        .getElementById(
          "placeModal"
        )
        ?.classList.add(
          "hidden"
        );
    };
}


const closeRoute =
  document.getElementById(
    "closeRoute"
  );

if (closeRoute) {

  closeRoute.onclick =
    () => {

      document
        .getElementById(
          "routePanel"
        )
        ?.classList.add(
          "hidden"
        );


      if (routeLine) {

        map.removeLayer(
          routeLine
        );

        routeLine = null;
      }
    };
}


/* =====================================================
   CLEAR MARKERS
===================================================== */

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


/* =====================================================
   START
===================================================== */

locateUser();