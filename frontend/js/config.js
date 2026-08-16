window.APP_CONFIG = {
  API_BASE_URL: "https://mapsell-production-d438.up.railway.app"
};

const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();
}