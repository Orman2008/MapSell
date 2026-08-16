const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();
}


const API =
  window.APP_CONFIG.API_BASE_URL.replace(/\/$/, '');


const user =
  tg?.initDataUnsafe?.user ||
  {
    id: 0,
    first_name: 'Web User'
  };


let allPlaces = [];

let currentFilter = 'all';

let currentPosition = null;


/* =========================================================
   HELPERS
========================================================= */


function esc(value) {

  return String(value ?? '')
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


function formatDistance(meters) {

  if (!Number.isFinite(meters)) {
    return '—';
  }

  if (meters < 1000) {
    return `${Math.round(meters)} м`;
  }

  return `${(meters / 1000).toFixed(1)} км`;

}


function formatTime(seconds) {

  if (!Number.isFinite(seconds)) {
    return '—';
  }

  const minutes =
    Math.round(seconds / 60);


  if (minutes < 60) {
    return `${minutes} мин`;
  }


  const hours =
    Math.floor(minutes / 60);


  const mins =
    minutes % 60;


  if (mins === 0) {
    return `${hours} ч`;
  }


  return `${hours} ч ${mins} мин`;

}


/* =========================================================
   LOCATION
========================================================= */


function getLocation() {

  return new Promise(resolve => {

    if (!navigator.geolocation) {

      resolve(null);

      return;
    }


    navigator.geolocation.getCurrentPosition(

      position => {

        currentPosition = {

          lat:
            position.coords.latitude,

          lon:
            position.coords.longitude

        };


        document.getElementById(
          'locationStatus'
        ).textContent =
          '📍 Местоположение определено';


        resolve(
          currentPosition
        );

      },


      error => {

        console.log(
          'LOCATION ERROR:',
          error
        );


        document.getElementById(
          'locationStatus'
        ).textContent =
          '⚠️ Разреши доступ к местоположению, чтобы видеть расстояние и время';


        resolve(null);

      },


      {
        enableHighAccuracy: true,

        timeout: 10000,

        maximumAge: 30000

      }

    );

  });

}


/* =========================================================
   ROUTE
========================================================= */


async function getRoute(place, profile) {

  if (!currentPosition) {
    return null;
  }


  try {

    const params =
      new URLSearchParams({

        start_lat:
          currentPosition.lat,

        start_lon:
          currentPosition.lon,

        end_lat:
          place.lat,

        end_lon:
          place.lon,

        profile

      });


    const response =
      await fetch(
        `${API}/api/route?${params.toString()}`
      );


    if (!response.ok) {

      console.log(
        'ROUTE ERROR:',
        profile,
        response.status
      );

      return null;
    }


    return await response.json();

  }

  catch (error) {

    console.error(
      'ROUTE ERROR:',
      error
    );

    return null;

  }

}


/* =========================================================
   LOAD ROUTES
========================================================= */


async function calculateRoutes(place) {

  if (!currentPosition) {

    return {

      walk: null,

      car: null

    };

  }


  const [
    walk,
    car
  ] =
    await Promise.all([

      getRoute(
        place,
        'foot'
      ),

      getRoute(
        place,
        'car'
      )

    ]);


  return {

    walk,

    car

  };

}


/* =========================================================
   CARD
========================================================= */


function createCard(place) {

  const article =
    document.createElement('article');


  article.className =
    'note-card';


  article.dataset.id =
    place.place_id;


  const sold =
    place.sold === true;


  article.innerHTML = `

    <div class="note-card-top">

      <div class="place-icon">

        ${place.icon || '📍'}

      </div>


      <div class="place-main">

        <div class="place-title-row">

          <h2>
            ${esc(place.name)}
          </h2>


          <span class="
            sale-badge
            ${sold ? 'sold' : 'not-sold'}
          ">

            ${sold
              ? '💰 Продано'
              : '❌ Не продано'}

          </span>

        </div>


        <p class="place-address">

          📍 ${esc(place.address || 'Адрес не указан')}

        </p>

      </div>

    </div>


    <div class="route-info">

      <div class="route-item">

        <span class="route-icon">
          🚶
        </span>

        <div>

          <b class="walk-distance">
            —
          </b>

          <small>
            пешком
          </small>

        </div>

      </div>


      <div class="route-item">

        <span class="route-icon">
          🚗
        </span>

        <div>

          <b class="car-distance">
            —
          </b>

          <small>
            на машине
          </small>

        </div>

      </div>

    </div>


    <div class="route-times">

      <div>

        🚶

        <span class="walk-time">
          —
        </span>

      </div>


      <div>

        🚗

        <span class="car-time">
          —
        </span>

      </div>

    </div>


    <div class="note-section">

      <div class="note-label">
        📝 Заметка
      </div>


      ${
        place.note

        ?

        `<div class="note-text">
          ${esc(place.note)}
        </div>`

        :

        `<div class="no-note">
          Нет заметки
        </div>`
      }

    </div>


    <div class="note-footer">

      <small>

        ${
          place.user_name
            ? `Добавил: ${esc(place.user_name)}`
            : ''
        }

      </small>


      <button
        class="route-button"
      >
        🧭 Маршрут
      </button>

    </div>

  `;


  article
    .querySelector('.route-button')
    .onclick = () => {

      openRouteOnMap(place);

    };


  return article;

}


/* =========================================================
   CALCULATE CARD ROUTE
========================================================= */


async function updateCardRoute(
  card,
  place
) {

  if (!currentPosition) {

    return;

  }


  const [
    walk,
    car
  ] =
    await Promise.all([

      getRoute(
        place,
        'foot'
      ),

      getRoute(
        place,
        'car'
      )

    ]);


  if (walk) {

    card.querySelector(
      '.walk-distance'
    ).textContent =
      formatDistance(
        walk.distance
      );


    card.querySelector(
      '.walk-time'
    ).textContent =
      formatTime(
        walk.duration
      );

  }


  if (car) {

    card.querySelector(
      '.car-distance'
    ).textContent =
      formatDistance(
        car.distance
      );


    card.querySelector(
      '.car-time'
    ).textContent =
      formatTime(
        car.duration
      );

  }

}


/* =========================================================
   OPEN MAP
========================================================= */


function openRouteOnMap(place) {

  const params =
    new URLSearchParams({

      routeLat:
        place.lat,

      routeLon:
        place.lon,

      routeName:
        place.name

    });


  window.location.href =
    `index.html?${params.toString()}`;

}


/* =========================================================
   LOAD DATA
========================================================= */


async function load() {

  const loading =
    document.getElementById(
      'loading'
    );


  const empty =
    document.getElementById(
      'empty'
    );


  try {

    loading.classList.remove(
      'hidden'
    );


    const response =
      await fetch(
        `${API}/api/visits?user_id=${encodeURIComponent(user.id)}`
      );


    if (!response.ok) {

      throw new Error(
        `HTTP ${response.status}`
      );

    }


    const data =
      await response.json();


    allPlaces =
      data;


    updateStats(
      data
    );


    render();

  }

  catch (error) {

    console.error(
      'NOTES ERROR:',
      error
    );


    document.getElementById(
      'notesList'
    ).innerHTML = `

      <div class="error-card">

        ❌ Не удалось загрузить заметки.

        <br>

        <small>
          Проверь соединение с сервером.
        </small>

      </div>

    `;

  }

  finally {

    loading.classList.add(
      'hidden'
    );

  }

}


/* =========================================================
   STATS
========================================================= */


function updateStats(data) {

  document.getElementById(
    'total'
  ).textContent =
    data.length;


  document.getElementById(
    'sold'
  ).textContent =
    data.filter(
      x => x.sold
    ).length;


  document.getElementById(
    'notSold'
  ).textContent =
    data.filter(
      x => !x.sold
    ).length;

}


/* =========================================================
   FILTER
========================================================= */


function getFilteredPlaces() {

  const search =
    document.getElementById(
      'notesSearch'
    ).value
      .trim()
      .toLowerCase();


  return allPlaces.filter(
    place => {

      let matchesFilter =
        true;


      if (
        currentFilter ===
        'sold'
      ) {

        matchesFilter =
          place.sold === true;

      }


      if (
        currentFilter ===
        'notSold'
      ) {

        matchesFilter =
          place.sold !== true;

      }


      if (!matchesFilter) {
        return false;
      }


      if (!search) {
        return true;
      }


      const text = `

        ${place.name || ''}

        ${place.address || ''}

        ${place.note || ''}

      `.toLowerCase();


      return text.includes(
        search
      );

    }
  );

}


/* =========================================================
   RENDER
========================================================= */


async function render() {

  const box =
    document.getElementById(
      'notesList'
    );


  const empty =
    document.getElementById(
      'empty'
    );


  box.innerHTML = '';


  const places =
    getFilteredPlaces();


  if (!places.length) {

    empty.classList.remove(
      'hidden'
    );

    return;

  }


  empty.classList.add(
    'hidden'
  );


  for (
    const place
    of places
  ) {

    const card =
      createCard(place);


    box.appendChild(
      card
    );


    if (currentPosition) {

      updateCardRoute(
        card,
        place
      );

    }

  }

}


/* =========================================================
   FILTER BUTTONS
========================================================= */


document
  .querySelectorAll('.filter')
  .forEach(button => {

    button.onclick =
      () => {

        document
          .querySelectorAll('.filter')
          .forEach(
            x =>
              x.classList.remove(
                'active'
              )
          );


        button.classList.add(
          'active'
        );


        currentFilter =
          button.dataset.filter;


        render();

      };

  });


/* =========================================================
   SEARCH
========================================================= */


document
  .getElementById(
    'notesSearch'
  )
  .addEventListener(
    'input',
    render
  );


/* =========================================================
   REFRESH
========================================================= */


document
  .getElementById(
    'refreshBtn'
  )
  .onclick =
    async () => {

      await getLocation();

      await load();

    };


/* =========================================================
   START
========================================================= */


async function start() {

  await getLocation();

  await load();

}


start();