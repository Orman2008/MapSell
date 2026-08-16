const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();
}

const API = window.APP_CONFIG.API_BASE_URL.replace(/\/$/, "");

const user =
  tg?.initDataUnsafe?.user || {
    id: 0,
    first_name: "Web User"
  };

let markers = new Map();
let places = new Map();

let currentPosition = null;
let userMarker = null;
let routeLine = null;
let selectedPlace = null;


// ===============================
// MAP
// ===============================

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


// ===============================
// HELPERS
// ===============================

function setStatus(text) {
  const el = document.getElementById("status");

  if (el) {
    el.textContent = text || "";
  }
}


function escapeHtml(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    c =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      })[c]
  );
}


function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;

  const dLat =
    (lat2 - lat1) * Math.PI / 180;

  const dLon =
    (lon2 - lon1) * Math.PI / 180;

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
  const minutes = Math.round(seconds / 60);

  if (minutes < 60) {
    return `${minutes} мин`;
  }

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  return mins
    ? `${hours} ч ${mins} мин`
    : `${hours} ч`;
}


// ===============================
// LOCATION
// ===============================

function locateUser() {
  if (!navigator.geolocation) {
    alert("Ваш браузер не поддерживает геолокацию.");
    return;
  }

  setStatus("📍 Определяю местоположение...");

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
        .bindPopup("📍 Ваше местоположение");

      map.setView(
        [
          currentPosition.lat,
          currentPosition.lon
        ],
        15
      );

      setStatus("📍 Местоположение определено");
    },

    error => {
      console.error(error);

      setStatus(
        "⚠️ Не удалось определить местоположение"
      );
    },

    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 30000
    }
  );
}


// ===============================
// ICON
// ===============================

function createIcon(place) {

  let icon = "📍";

  if (place.category === "shop") {
    icon = "🛒";
  }

  if (
    place.category === "pharmacy" ||
    place.type === "pharmacy"
  ) {
    icon = "💊";
  }

  if (
    place.category === "dentist" ||
    place.type === "dentist"
  ) {
    icon = "🦷";
  }

  if (
    place.category === "restaurant" ||
    place.type === "restaurant"
  ) {
    icon = "🍽️";
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


// ===============================
// POPUP
// ===============================

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
      : "";

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

      ${
        note
          ? note
          : "<p>📝 Заметок пока нет</p>"
      }

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


// ===============================
// VISIT
// ===============================

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

  } catch (e) {

    console.error("getVisit:", e);

    return null;
  }
}


// ===============================
// OPEN PLACE
// ===============================

async function openPlace(id) {

  const place =
    places.get(String(id));

  if (!place) {
    return;
  }

  selectedPlace = place;

  const visit =
    await getVisit(place.id);

  const modal =
    document.getElementById("placeModal");

  const content =
    document.getElementById("placeContent");

  if (!modal || !content) {
    return;
  }

  content.innerHTML = `
    <h2>
      ${escapeHtml(place.name)}
    </h2>

    <p>
      📍 ${escapeHtml(place.address || "")}
    </p>

    <hr>

    <p>
      ${visit?.sold === true
        ? "🟢 Вы продали здесь"
        : "🔴 Пока не продали"}
    </p>

    ${
      visit?.note
        ? `
          <div class="note-preview">
            📝 ${escapeHtml(visit.note)}
          </div>
        `
        : ""
    }

    <div class="actions">

      <button
        id="soldYes"
      >
        ➕ Продал
      </button>

      <button
        id="soldNo"
        class="secondary"
      >
        ➖ Не продал
      </button>

      <button
        id="addNote"
        class="secondary"
      >
        📝 Заметка
      </button>

      <button
        id="routeBtn"
        class="secondary"
      >
        🧭 Маршрут
      </button>

    </div>
  `;

  modal.classList.remove("hidden");

  document.getElementById("soldYes").onclick =
    async () => {

      await saveVisit(
        place,
        true,
        visit?.note || ""
      );

      modal.classList.add("hidden");
    };

  document.getElementById("soldNo").onclick =
    async () => {

      await saveVisit(
        place,
        false,
        visit?.note || ""
      );

      modal.classList.add("hidden");
    };

  document.getElementById("addNote").onclick =
    () => {

      const noteModal =
        document.getElementById("noteModal");

      document.getElementById("note").value =
        visit?.note || "";

      noteModal.classList.remove("hidden");
    };

  document.getElementById("routeBtn").onclick =
    () => {
      buildRoute(place.id);
    };
}


// ===============================
// SAVE
// ===============================

async function saveVisit(
  place,
  sold,
  note
) {

  if (!place) {
    return;
  }

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
      note || null,

    user_id:
      String(user.id),

    user_name:
      user.first_name || "User"
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
            JSON.stringify(payload)
        }
      );

    if (!r.ok) {

      console.error(
        "Save error:",
        await r.text()
      );

      alert(
        "Не удалось сохранить"
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

      marker.setPopupContent(
        popup(place, v)
      );
    }

  } catch (e) {

    console.error(e);

    alert(
      "Ошибка соединения с сервером"
    );
  }
}


// ===============================
// SEARCH
// ===============================

async function searchPlaces() {

  const input =
    document.getElementById("search");

  if (!input) {
    return;
  }

  const q =
    input.value.trim();

  if (!q) {
    return;
  }

  setStatus("🔎 Ищу места...");

  try {

    const lat =
      currentPosition?.lat ||
      41.2995;

    const lon =
      currentPosition?.lon ||
      69.2401;

    const url =
      `${API}/api/places/search?q=${encodeURIComponent(
        q
      )}&lat=${lat}&lon=${lon}`;

    console.log(
      "SEARCH:",
      url
    );

    const r =
      await fetch(url);

    if (!r.ok) {

      const errorText =
        await r.text();

      console.error(
        "SEARCH ERROR:",
        r.status,
        errorText
      );

      setStatus(
        `❌ Ошибка поиска (${r.status})`
      );

      return;
    }

    const data =
      await r.json();

    console.log(
      "SEARCH RESULT:",
      data
    );

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

      let distance =
        "—";

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

      if (list) {

        const item =
          document.createElement(
            "div"
          );

        item.className =
          "result-item";

        item.innerHTML = `
          <div class="result-icon">
            ${p.category === "shop"
              ? "🛒"
              : "📍"}
          </div>

          <div class="result-content">

            <b>
              ${escapeHtml(
                p.name
              )}
            </b>

            <span>
              ${escapeHtml(
                p.address || ""
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
    }

    const resultsPanel =
      document.getElementById(
        "resultsPanel"
      );

    if (resultsPanel) {
      resultsPanel.classList.remove(
        "hidden"
      );
    }

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

    console.error(
      "SEARCH CONNECTION ERROR:",
      e
    );

    setStatus(
      "❌ Ошибка соединения"
    );
  }
}


// ===============================
// ROUTING
// ===============================

async function buildRoute(id) {

  const place =
    places.get(String(id));

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

    const carUrl =
      `https://router.project-osrm.org/route/v1/driving/${start};${end}?overview=full&geometries=geojson`;

    const response =
      await fetch(carUrl);

    const data =
      await response.json();

    if (
      data.code !== "Ok" ||
      !data.routes?.length
    ) {

      alert(
        "Маршрут не найден"
      );

      return;
    }

    if (routeLine) {
      map.removeLayer(routeLine);
    }

    const route =
      data.routes[0];

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

    const routePanel =
      document.getElementById(
        "routePanel"
      );

    if (routePanel) {

      routePanel.classList.remove(
        "hidden"
      );
    }

  } catch (e) {

    console.error(e);

    alert(
      "Не удалось построить маршрут"
    );
  }
}


// ===============================
// MY PLACES
// ===============================

async function loadMyPlaces() {

  setStatus(
    "⭐ Загружаю мои места..."
  );

  try {

    const r =
      await fetch(
        `${API}/api/visits?user_id=${encodeURIComponent(
          user.id
        )}`
      );

    if (!r.ok) {

      setStatus(
        "❌ Не удалось загрузить места"
      );

      return;
    }

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

        category:
          v.category,

        icon:
          v.sold
            ? "💰"
            : "📍"
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

      setStatus(
        `⭐ Мест: ${list.length}`
      );

    } else {

      setStatus(
        "У тебя пока нет сохранённых мест"
      );
    }

  } catch (e) {

    console.error(e);

    setStatus(
      "❌ Ошибка загрузки мест"
    );
  }
}


// ===============================
// CLEAR
// ===============================

function clearMarkers() {

  markers.forEach(
    marker =>
      map.removeLayer(marker)
  );

  markers.clear();
}


// ===============================
// EVENTS
// ===============================

document
  .getElementById("searchBtn")
  ?.addEventListener(
    "click",
    searchPlaces
  );


document
  .getElementById("search")
  ?.addEventListener(
    "keydown",
    e => {

      if (e.key === "Enter") {
        searchPlaces();
      }

    }
  );


document
  .getElementById("locationBtn")
  ?.addEventListener(
    "click",
    locateUser
  );


document
  .getElementById("allBtn")
  ?.addEventListener(
    "click",
    loadMyPlaces
  );


document
  .getElementById("closeResults")
  ?.addEventListener(
    "click",
    () => {

      document
        .getElementById(
          "resultsPanel"
        )
        ?.classList.add(
          "hidden"
        );
    }
  );


document
  .getElementById("closePlace")
  ?.addEventListener(
    "click",
    () => {

      document
        .getElementById(
          "placeModal"
        )
        ?.classList.add(
          "hidden"
        );
    }
  );


document
  .getElementById("closeNote")
  ?.addEventListener(
    "click",
    () => {

      document
        .getElementById(
          "noteModal"
        )
        ?.classList.add(
          "hidden"
        );
    }
  );


document
  .getElementById("saveNote")
  ?.addEventListener(
    "click",
    async () => {

      if (!selectedPlace) {
        return;
      }

      const note =
        document
          .getElementById("note")
          .value
          .trim();

      const oldVisit =
        await getVisit(
          selectedPlace.id
        );

      await saveVisit(
        selectedPlace,
        oldVisit?.sold || false,
        note
      );

      document
        .getElementById("noteModal")
        ?.classList.add(
          "hidden"
        );

      document
        .getElementById("placeModal")
        ?.classList.add(
          "hidden"
        );
    }
  );


// ===============================
// START
// ===============================

locateUser();