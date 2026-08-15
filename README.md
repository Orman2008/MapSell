# Tashkent Map — shared places tracker

Full-stack starter for a Telegram Mini App / web app:
- interactive OpenStreetMap + Leaflet map
- place search through the backend
- shared PostgreSQL data for visits, sales and notes
- two pages: Map and Notes
- Telegram Mini App user detection
- Railway-ready backend
- GitHub Pages-ready frontend

## Architecture
GitHub Pages -> frontend static files
Railway -> FastAPI API + PostgreSQL
Telegram -> opens the frontend as a Mini App

## Local development
1. Start PostgreSQL and set `DATABASE_URL`.
2. In `backend/` install requirements and run:
   `uvicorn app.main:app --reload --port 8000`
3. Serve `frontend/` with any static server.
4. Set `API_BASE_URL` in `frontend/js/config.js`.

## Production
Use GitHub Pages for the frontend and Railway for API/PostgreSQL. GitHub Pages is static; the shared data must live on the Railway backend/database.
