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

let map = null;

let markers = new Map();

let places = new Map();

let currentPosition = null;

let userMarker = null;

let selectedPlace = null;

let selectedVisit = null;

let route = null;

let walkRoute = null;

let carRoute = null;

let activeRouteType = "auto";


// =====================================================
// HELPERS
// =====================================================

function setStatus(text) {

  const el = document.getElementById("status");

  if (el) {
    el.textContent = text || "";
  }
}


function escapeHtml(value) {

  return String(value ?? "").replace(
    /[&<>"']/g,
    char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[char]
  );
}


function formatDistance(meters) {

  if (!meters) {
    return "—";
  }

  if (meters < 1000) {
    return `${Math.round(meters)} м`;
  }

  return `${(meters / 1000).toFixed(1)} км`;
}


function formatTime(seconds) {

  if (!seconds) {
    return "—";
  }

  const minutes = Math.round(seconds / 60);

  if (minutes < 60) {
    return `${minutes} мин`;
  }

  const hours = Math.floor(minutes / 60);

  const mins = minutes % 60;

  if (mins === 0) {
    return `${hours} ч`;
  }

  return `${hours} ч ${mins} мин`;
}


// =====================================================
// MAP
// =====================================================

function initMap() {

  map = new ymaps.Map(
    "map",
    {
      center: [41.2995, 69.2401],
      zoom: 12
    },
    {
      searchControlProvider: "yandex#search"
    }
  );

  map.controls.remove("searchControl");

  map.controls.remove("trafficControl");

  map.controls.remove("rulerControl");

  locateUser();
}


// =====================================================
// LOCATION
// =====================================================

function locateUser() {

  if (!navigator.geolocation) {

    setStatus(
      "⚠️ Геолокация не поддерживается"
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


      const coords = [
        currentPosition.lat,
        currentPosition.lon
      ];


      if (userMarker) {

        map.geoObjects.remove(
          userMarker
        );
      }


      userMarker =
        new ymaps.Placemark(
          coords,
          {
            balloonContent:
              "📍 Ваше местоположение"
          },
          {
            preset:
              "islands#blueCircleDotIcon"
          }
        );


      map.geoObjects.add(
        userMarker
      );


      map.setCenter(
        coords,
        15,
        {
          duration: 400
        }
      );


      setStatus(
        "📍 Местоположение определено"
      );
    },

    error => {

      console.error(error);

      setStatus(
        "⚠️ Не удалось определить местоположение"
      );
    },

    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 30000
    }
  );
}


// =====================================================
// MARKER ICON
// =====================================================

function getIcon(place) {

  if (
    place.category === "shop"
  ) {
    return "🛒";
  }

  if (
    place.category === "pharmacy" ||
    place.type === "pharmacy"
  ) {
    return "💊";
  }

  if (
    place.category === "dentist" ||
    place.type === "dentist"
  ) {
    return "🦷";
  }

  if (
    place.category === "restaurant" ||
    place.type === "restaurant"
  ) {
    return "🍽️";
  }

  if (
    place.category === "cafe"
  ) {
    return "☕";
  }

  if (
    place.category === "hotel"
  ) {
    return "🏨";
  }

  return "📍";
}


// =====================================================
// MARKER
// =====================================================

function createMarker(place, visit = null) {

  const marker =
    new ymaps.Placemark(
      [place.lat, place.lon],
      {
        hintContent:
          place.name,

        balloonContent:
          createBalloon(place, visit)
      },
      {
        iconLayout: "default#imageWithContent",

        iconImageHref:
          "data:image/svg+xml;charset=UTF-8," +
          encodeURIComponent(`
            <svg xmlns="http://www.w3.org/2000/svg"
                 width="46"
                 height="46">

              <circle
                cx="23"
                cy="23"
                r="20"
                fill="white"
                stroke="#172033"
                stroke-width="3"
              />

              <text
                x="23"
                y="31"
                text-anchor="middle"
                font-size="22"
              >
                ${getIcon(place)}
              </text>

            </svg>
          `),

        iconImageSize: [
          46,
          46
        ],

        iconImageOffset: [
          -23,
          -23
        ]
      }
    );


  marker.events.add(
    "balloonopen",
    () => {

      setTimeout(() => {

        const openBtn =
          document.querySelector(
            `[data-open-place="${CSS.escape(String(place.id))}"]`
          );

        if (openBtn) {

          openBtn.onclick =
            () => openPlace(place.id);
        }


        const routeBtn =
          document.querySelector(
            `[data-route-place="${CSS.escape(String(place.id))}"]`
          );

        if (routeBtn) {

          routeBtn.onclick =
            () => buildRoute(place.id);
        }


        const noteBtn =
          document.querySelector(
            `[data-note-place="${CSS.escape(String(place.id))}"]`
          );

        if (noteBtn) {

          noteBtn.onclick =
            () => openNote(place.id);
        }

      }, 50);
    }
  );


  map.geoObjects.add(marker);

  markers.set(
    String(place.id),
    marker
  );

  places.set(
    String(place.id),
    place
  );

  return marker;
}


// =====================================================
// BALLOON
// =====================================================

function createBalloon(place, visit) {

  const sold =
    visit?.sold === true;


  return `
    <div class="popup">

      <h3>
        ${escapeHtml(
          place.name || "Место"
        )}
      </h3>

      <p>
        📍 ${escapeHtml(
          place.address || ""
        )}
      </p>

      <div class="popup-status">
        ${
          sold
            ? "🟢 Продано"
            : "🔴 Не продано"
        }
      </div>


      ${
        visit?.note
          ? `
            <div class="note-preview">
              📝 ${escapeHtml(
                visit.note
              )}
            </div>
          `
          : `
            <div class="muted">
              📝 Заметок пока нет
            </div>
          `
      }


      <div class="popup-actions">

        <button
          data-open-place="${escapeHtml(String(place.id))}"
        >
          Открыть
        </button>

        <button
          class="secondary"
          data-note-place="${escapeHtml(String(place.id))}"
        >
          📝 Заметка
        </button>

        <button
          class="route-btn"
          data-route-place="${escapeHtml(String(place.id))}"
        >
          🧭 Маршрут
        </button>

      </div>

    </div>
  `;
}


// =====================================================
// GET VISIT
// =====================================================

async function getVisit(placeId) {

  try {

    const response =
      await fetch(
        `${API}/api/visits/${encodeURIComponent(
          placeId
        )}?user_id=${encodeURIComponent(
          user.id
        )}`
      );


    if (!response.ok) {
      return null;
    }


    return await response.json();

  } catch (error) {

    console.error(
      "getVisit:",
      error
    );

    return null;
  }
}


// =====================================================
// OPEN PLACE
// =====================================================

async function openPlace(id) {

  const place =
    places.get(String(id));

  if (!place) {
    return;
  }


  selectedPlace = place;

  selectedVisit =
    await getVisit(place.id);


  const modal =
    document.getElementById(
      "placeModal"
    );

  const content =
    document.getElementById(
      "placeContent"
    );


  content.innerHTML = `

    <h2>
      ${escapeHtml(
        place.name
      )}
    </h2>


    <p class="modal-address">
      📍 ${escapeHtml(
        place.address || ""
      )}
    </p>


    <div class="sale-box">

      <b>
        Статус продажи
      </b>

      <div class="sale-buttons">

        <button
          id="soldYes"
          class="${
            selectedVisit?.sold
              ? "selected"
              : ""
          }"
        >
          💰 Продал
        </button>

        <button
          id="soldNo"
          class="${
            !selectedVisit?.sold
              ? "selected secondary"
              : "secondary"
          }"
        >
          ❌ Не продал
        </button>

      </div>

    </div>


    ${
      selectedVisit?.note
        ? `
          <div class="existing-note">

            <b>📝 Заметка</b>

            <p>
              ${escapeHtml(
                selectedVisit.note
              )}
            </p>

          </div>
        `
        : ""
    }


    <div class="modal-actions">

      <button
        id="modalNote"
      >
        📝 ${
          selectedVisit?.note
            ? "Изменить заметку"
            : "Добавить заметку"
        }
      </button>


      <button
        id="modalRoute"
        class="secondary"
      >
        🧭 Построить маршрут
      </button>

    </div>

  `;


  modal.classList.remove(
    "hidden"
  );


  document.getElementById(
    "soldYes"
  ).onclick = async () => {

    await saveVisit(
      place,
      true,
      selectedVisit?.note || ""
    );

    selectedVisit =
      await getVisit(place.id);

    openPlace(place.id);
  };


  document.getElementById(
    "soldNo"
  ).onclick = async () => {

    await saveVisit(
      place,
      false,
      selectedVisit?.note || ""
    );

    selectedVisit =
      await getVisit(place.id);

    openPlace(place.id);
  };


  document.getElementById(
    "modalNote"
  ).onclick = () => {

    openNote(place.id);
  };


  document.getElementById(
    "modalRoute"
  ).onclick = () => {

    modal.classList.add(
      "hidden"
    );

    buildRoute(place.id);
  };
}


// =====================================================
// NOTE
// =====================================================

async function openNote(id) {

  const place =
    places.get(String(id));

  if (!place) {
    return;
  }


  selectedPlace = place;


  const visit =
    await getVisit(place.id);


  document.getElementById(
    "note"
  ).value =
    visit?.note || "";


  document.getElementById(
    "noteModal"
  ).classList.remove(
    "hidden"
  );
}


// =====================================================
// SAVE VISIT
// =====================================================

async function saveVisit(
  place,
  sold,
  note
) {

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
      user.first_name ||
      "User"
  };


  try {

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

      console.error(
        await response.text()
      );

      alert(
        "Не удалось сохранить"
      );

      return null;
    }


    const result =
      await response.json();


    const marker =
      markers.get(
        String(place.id)
      );


    if (marker) {

      marker.properties.set(
        "balloonContent",
        createBalloon(
          place,
          result
        )
      );
    }


    return result;

  } catch (error) {

    console.error(error);

    alert(
      "Ошибка соединения с сервером"
    );

    return null;
  }
}


// =====================================================
// SEARCH
// =====================================================

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


    const response =
      await fetch(
        `${API}/api/places/search?q=${encodeURIComponent(
          q
        )}&lat=${lat}&lon=${lon}`
      );


    if (!response.ok) {

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


    list.innerHTML = "";


    if (!data.length) {

      setStatus(
        "Ничего не найдено"
      );

      return;
    }


    for (
      const place
      of data
    ) {

      const visit =
        await getVisit(
          place.id
        );


      createMarker(
        place,
        visit
      );


      let distance =
        "";


      if (currentPosition) {

        distance =
          getStraightDistance(
            currentPosition.lat,
            currentPosition.lon,
            place.lat,
            place.lon
          );
      }


      const item =
        document.createElement(
          "div"
        );


      item.className =
        "result-item";


      item.innerHTML = `

        <div class="result-icon">
          ${getIcon(place)}
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


      item.onclick =
        () => {

          map.setCenter(
            [
              place.lat,
              place.lon
            ],
            17,
            {
              duration: 400
            }
          );


          const marker =
            markers.get(
              String(place.id)
            );


          if (marker) {
            marker.balloon.open();
          }
        };


      list.appendChild(
        item
      );
    }


    document
      .getElementById(
        "resultsPanel"
      )
      .classList.remove(
        "hidden"
      );


    setStatus(
      `Найдено: ${data.length}`
    );


  } catch (error) {

    console.error(
      error
    );

    setStatus(
      "❌ Ошибка соединения"
    );
  }
}


// =====================================================
// STRAIGHT DISTANCE
// =====================================================

function getStraightDistance(
  lat1,
  lon1,
  lat2,
  lon2
) {

  const R = 6371;


  const dLat =
    (lat2 - lat1)
    * Math.PI / 180;


  const dLon =
    (lon2 - lon1)
    * Math.PI / 180;


  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(
      lat1 * Math.PI / 180
    ) *
    Math.cos(
      lat2 * Math.PI / 180
    ) *
    Math.sin(dLon / 2) ** 2;


  const km =
    R *
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    );


  if (km < 1) {
    return `${Math.round(km * 1000)} м`;
  }


  return `${km.toFixed(1)} км`;
}


// =====================================================
// ROUTING
// =====================================================

function buildRoute(id) {

  const place =
    places.get(String(id));


  if (!place) {
    return;
  }


  if (!currentPosition) {

    alert(
      "Сначала разреши доступ к местоположению."
    );

    locateUser();

    return;
  }


  selectedPlace =
    place;


  document.getElementById(
    "routePanel"
  ).classList.remove(
    "hidden"
  );


  document.getElementById(
    "routePlace"
  ).textContent =
    place.name;


  document.getElementById(
    "walkInfo"
  ).textContent =
    "Расчёт...";


  document.getElementById(
    "carInfo"
  ).textContent =
    "Расчёт...";


  buildYandexRoute(
    "pedestrian",
    place
  );


  buildYandexRoute(
    "auto",
    place
  );
}


// =====================================================
// YANDEX ROUTE
// =====================================================

function buildYandexRoute(
  type,
  place
) {

  const referencePoints = [

    [
      currentPosition.lat,
      currentPosition.lon
    ],

    [
      Number(place.lat),
      Number(place.lon)
    ]

  ];


  const multiRoute =
    new ymaps.multiRouter.MultiRoute(
      {
        referencePoints:
          referencePoints,

        params: {

          routingMode:
            type,

          results: 2
        }
      },
      {
        boundsAutoApply:
          false,

        routeActiveStrokeWidth:
          type === "auto"
            ? 6
            : 5,

        routeActiveStrokeColor:
          type === "auto"
            ? "#2979ff"
            : "#20a464",

        routeStrokeWidth:
          4,

        routeStrokeColor:
          type === "auto"
            ? "#2979ff"
            : "#20a464"
      }
    );


  multiRoute.model.events.add(
    "requestsuccess",
    () => {

      const activeRoute =
        multiRoute
          .getActiveRoute();


      if (!activeRoute) {
        return;
      }


      const distance =
        activeRoute.properties.get(
          "distance"
        );


      const duration =
        activeRoute.properties.get(
          "duration"
        );


      const distanceText =
        distance
          ?.text ||
        "—";


      const durationText =
        duration
          ?.text ||
        "—";


      if (
        type === "pedestrian"
      ) {

        document.getElementById(
          "walkInfo"
        ).textContent =
          `${distanceText} · ${durationText}`;

      } else {

        document.getElementById(
          "carInfo"
        ).textContent =
          `${distanceText} · ${durationText}`;
      }

    }
  );


  multiRoute.model.events.add(
    "requestfail",
    error => {

      console.error(
        "Yandex route error:",
        error
      );


      if (
        type === "pedestrian"
      ) {

        document.getElementById(
          "walkInfo"
        ).textContent =
          "Не удалось построить";

      } else {

        document.getElementById(
          "carInfo"
        ).textContent =
          "Не удалось построить";
      }
    }
  );


  if (
    type === "pedestrian"
  ) {

    if (walkRoute) {

      map.geoObjects.remove(
        walkRoute
      );
    }


    walkRoute =
      multiRoute;


    map.geoObjects.add(
      walkRoute
    );

  } else {

    if (carRoute) {

      map.geoObjects.remove(
        carRoute
      );
    }


    carRoute =
      multiRoute;


    map.geoObjects.add(
      carRoute
    );
  }
}


// =====================================================
// NAVIGATION
// =====================================================

function openNavigation() {

  if (!selectedPlace) {
    return;
  }


  const lat =
    selectedPlace.lat;


  const lon =
    selectedPlace.lon;


  const url =
    `https://yandex.com/maps/?rtext=~${lat},${lon}&rtt=${activeRouteType === "pedestrian" ? "pedestrian" : "auto"}`;


  window.open(
    url,
    "_blank"
  );
}


// =====================================================
// MY PLACES
// =====================================================

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


    const data =
      await response.json();


    clearMarkers();


    for (
      const visit
      of data
    ) {

      const place = {

        id:
          visit.place_id,

        name:
          visit.name,

        address:
          visit.address,

        lat:
          Number(visit.lat),

        lon:
          Number(visit.lon),

        category:
          "shop"
      };


      createMarker(
        place,
        visit
      );
    }


    if (data.length) {

      setStatus(
        `⭐ Мест: ${data.length}`
      );


      const coords =
        data.map(
          x => [
            Number(x.lat),
            Number(x.lon)
          ]
        );


      map.setBounds(
        ymaps.util.bounds.fromPoints(
          coords
        ),
        {
          checkZoomRange: true,
          zoomMargin: 40
        }
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


// =====================================================
// CLEAR MARKERS
// =====================================================

function clearMarkers() {

  markers.forEach(
    marker => {

      map.geoObjects.remove(
        marker
      );
    }
  );


  markers.clear();

  places.clear();
}


// =====================================================
// EVENTS
// =====================================================

document
  .getElementById(
    "searchBtn"
  )
  ?.addEventListener(
    "click",
    searchPlaces
  );


document
  .getElementById(
    "search"
  )
  ?.addEventListener(
    "keydown",
    event => {

      if (
        event.key === "Enter"
      ) {

        searchPlaces();
      }
    }
  );


document
  .getElementById(
    "locationBtn"
  )
  ?.addEventListener(
    "click",
    locateUser
  );


document
  .getElementById(
    "allBtn"
  )
  ?.addEventListener(
    "click",
    loadMyPlaces
  );


document
  .getElementById(
    "closeResults"
  )
  ?.addEventListener(
    "click",
    () => {

      document
        .getElementById(
          "resultsPanel"
        )
        .classList.add(
          "hidden"
        );
    }
  );


document
  .getElementById(
    "closePlace"
  )
  ?.addEventListener(
    "click",
    () => {

      document
        .getElementById(
          "placeModal"
        )
        .classList.add(
          "hidden"
        );
    }
  );


document
  .getElementById(
    "closeNote"
  )
  ?.addEventListener(
    "click",
    () => {

      document
        .getElementById(
          "noteModal"
        )
        .classList.add(
          "hidden"
        );
    }
  );


document
  .getElementById(
    "saveNote"
  )
  ?.addEventListener(
    "click",
    async () => {

      if (!selectedPlace) {
        return;
      }


      const note =
        document
          .getElementById(
            "note"
          )
          .value
          .trim();


      const oldVisit =
        await getVisit(
          selectedPlace.id
        );


      await saveVisit(
        selectedPlace,

        oldVisit?.sold ||
          false,

        note
      );


      document
        .getElementById(
          "noteModal"
        )
        .classList.add(
          "hidden"
        );


      document
        .getElementById(
          "placeModal"
        )
        .classList.add(
          "hidden"
        );


      setStatus(
        "✅ Заметка сохранена"
      );
    }
  );


document
  .getElementById(
    "closeRoute"
  )
  ?.addEventListener(
    "click",
    () => {

      document
        .getElementById(
          "routePanel"
        )
        .classList.add(
          "hidden"
        );


      if (walkRoute) {

        map.geoObjects.remove(
          walkRoute
        );

        walkRoute =
          null;
      }


      if (carRoute) {

        map.geoObjects.remove(
          carRoute
        );

        carRoute =
          null;
      }
    }
  );


document
  .getElementById(
    "walkRoute"
  )
  ?.addEventListener(
    "click",
    () => {

      activeRouteType =
        "pedestrian";


      document
        .getElementById(
          "walkRoute"
        )
        .classList.add(
          "active"
        );


      document
        .getElementById(
          "carRoute"
        )
        .classList.remove(
          "active"
        );


      if (walkRoute) {

        map.setBounds(
          walkRoute.getBounds(),
          {
            checkZoomRange: true,
            zoomMargin: 50
          }
        );
      }
    }
  );


document
  .getElementById(
    "carRoute"
  )
  ?.addEventListener(
    "click",
    () => {

      activeRouteType =
        "auto";


      document
        .getElementById(
          "carRoute"
        )
        .classList.add(
          "active"
        );


      document
        .getElementById(
          "walkRoute"
        )
        .classList.remove(
          "active"
        );


      if (carRoute) {

        map.setBounds(
          carRoute.getBounds(),
          {
            checkZoomRange: true,
            zoomMargin: 50
          }
        );
      }
    }
  );


document
  .getElementById(
    "openNavigation"
  )
  ?.addEventListener(
    "click",
    openNavigation
  );


// =====================================================
// START
// =====================================================

ymaps.ready(
  initMap
);