const tg =
  window.Telegram?.WebApp;

if (tg) {

  tg.ready();

  tg.expand();
}


const API =
  window.APP_CONFIG.API_BASE_URL
    .replace(/\/$/, "");


const user =
  tg?.initDataUnsafe?.user || {
    id: 0,
    first_name: "Web User"
  };


let allNotes = [];


// =====================================================
// ESCAPE
// =====================================================

function esc(value) {

  return String(
    value ?? ""
  ).replace(
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


// =====================================================
// DATE
// =====================================================

function formatDate(value) {

  if (!value) {
    return "";
  }


  const date =
    new Date(value);


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "";
  }


  return date.toLocaleString(
    "ru-RU",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",

      hour: "2-digit",
      minute: "2-digit"
    }
  );
}


// =====================================================
// LOAD
// =====================================================

async function loadNotes() {

  const box =
    document.getElementById(
      "notesList"
    );


  try {

    const response =
      await fetch(
        `${API}/api/visits?user_id=${encodeURIComponent(
          user.id
        )}`
      );


    if (!response.ok) {

      throw new Error(
        `HTTP ${response.status}`
      );
    }


    allNotes =
      await response.json();


    updateStats();

    renderNotes();

  } catch (error) {

    console.error(
      error
    );


    box.innerHTML = `

      <div class="empty-state">

        <div class="empty-icon">
          ⚠️
        </div>

        <h2>
          Не удалось загрузить места
        </h2>

        <p>
          Проверь соединение с сервером.
        </p>

      </div>

    `;
  }
}


// =====================================================
// STATS
// =====================================================

function updateStats() {

  document.getElementById(
    "total"
  ).textContent =
    allNotes.length;


  document.getElementById(
    "sold"
  ).textContent =
    allNotes.filter(
      x => x.sold === true
    ).length;


  document.getElementById(
    "notSold"
  ).textContent =
    allNotes.filter(
      x => x.sold !== true
    ).length;
}


// =====================================================
// FILTER
// =====================================================

function getFilteredNotes() {

  const search =
    document
      .getElementById(
        "notesSearch"
      )
      .value
      .trim()
      .toLowerCase();


  const filter =
    document
      .getElementById(
        "notesFilter"
      )
      .value;


  return allNotes.filter(
    item => {

      const text =
        `${item.name || ""} ${
          item.address || ""
        } ${
          item.note || ""
        }`.toLowerCase();


      if (
        search &&
        !text.includes(search)
      ) {
        return false;
      }


      if (
        filter === "sold" &&
        item.sold !== true
      ) {
        return false;
      }


      if (
        filter === "notSold" &&
        item.sold === true
      ) {
        return false;
      }


      if (
        filter === "notes" &&
        !item.note
      ) {
        return false;
      }


      return true;
    }
  );
}


// =====================================================
// RENDER
// =====================================================

function renderNotes() {

  const box =
    document.getElementById(
      "notesList"
    );


  const data =
    getFilteredNotes();


  if (!data.length) {

    box.innerHTML = `

      <div class="empty-state">

        <div class="empty-icon">
          📝
        </div>

        <h2>
          Ничего не найдено
        </h2>

        <p>
          Сохрани место на карте,
          чтобы оно появилось здесь.
        </p>

        <a
          href="index.html"
          class="map-button"
        >
          🗺️ Открыть карту
        </a>

      </div>

    `;

    return;
  }


  box.innerHTML =
    data.map(
      createNoteCard
    ).join("");
}


// =====================================================
// CARD
// =====================================================

function createNoteCard(item) {

  const status =
    item.sold === true
      ? "Продано"
      : "Не продано";


  const statusClass =
    item.sold === true
      ? "sold"
      : "not-sold";


  return `

    <article
      class="note-card"
      data-id="${esc(
        item.place_id
      )}"
    >

      <div class="note-card-top">

        <div class="place-icon">
          📍
        </div>


        <div class="place-main">

          <h2>
            ${esc(
              item.name ||
              "Место"
            )}
          </h2>

          <p>
            ${esc(
              item.address ||
              "Адрес не указан"
            )}
          </p>

        </div>


        <span
          class="sale-status ${statusClass}"
        >
          ${
            item.sold
              ? "💰"
              : "❌"
          }

          ${status}
        </span>

      </div>


      <div class="note-body">

        ${
          item.note
            ? `
              <div class="saved-note">

                <div class="saved-note-title">
                  📝 Моя заметка
                </div>

                <div class="saved-note-text">
                  ${esc(
                    item.note
                  )}
                </div>

              </div>
            `
            : `
              <div class="no-note">
                📝 Заметки нет
              </div>
            `
        }

      </div>


      <div class="note-card-bottom">

        <span class="date">
          ${
            formatDate(
              item.updated_at ||
              item.created_at
            )
          }
        </span>


        <div class="note-actions">

          <a
            href="index.html?place=${encodeURIComponent(
              item.place_id
            )}"
            class="small-button"
          >
            🗺️ На карте
          </a>

        </div>

      </div>

    </article>

  `;
}


// =====================================================
// EVENTS
// =====================================================

document
  .getElementById(
    "notesSearch"
  )
  ?.addEventListener(
    "input",
    renderNotes
  );


document
  .getElementById(
    "notesFilter"
  )
  ?.addEventListener(
    "change",
    renderNotes
  );


// =====================================================
// START
// =====================================================

loadNotes();