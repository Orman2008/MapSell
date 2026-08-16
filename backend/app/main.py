import os
import hashlib
import hmac
import json
import time
from urllib.parse import parse_qsl

import httpx
from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import select, desc
from pydantic import BaseModel, Field

from .database import Base, engine, get_db
from .models import Visit


Base.metadata.create_all(bind=engine)

app = FastAPI(title="MapSell API")


# =========================================================
# CORS
# =========================================================

cors_value = os.getenv("CORS_ORIGINS", "*")

if cors_value == "*":
    origins = ["*"]
else:
    origins = [
        x.strip()
        for x in cors_value.split(",")
        if x.strip()
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================================================
# MODELS
# =========================================================

class VisitIn(BaseModel):
    place_id: str
    name: str
    address: str = ""
    lat: float
    lon: float

    visited: bool = True
    sold: bool = False

    note: str | None = Field(
        default=None,
        max_length=2000
    )

    user_id: str
    user_name: str = "User"


# =========================================================
# TELEGRAM
# =========================================================

def verify_telegram_init_data(init_data: str) -> dict:

    token = os.getenv("TELEGRAM_BOT_TOKEN")

    if not token:
        return {}

    pairs = dict(
        parse_qsl(
            init_data,
            keep_blank_values=True
        )
    )

    received = pairs.pop("hash", None)

    if not received:
        raise HTTPException(
            status_code=401,
            detail="Invalid Telegram data"
        )

    data_check = "\n".join(
        f"{key}={pairs[key]}"
        for key in sorted(pairs)
    )

    secret = hmac.new(
        b"WebAppData",
        token.encode(),
        hashlib.sha256
    ).digest()

    expected = hmac.new(
        secret,
        data_check.encode(),
        hashlib.sha256
    ).hexdigest()

    if not hmac.compare_digest(
        expected,
        received
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid Telegram signature"
        )

    auth_date = int(
        pairs.get("auth_date", "0")
    )

    if time.time() - auth_date > 86400:
        raise HTTPException(
            status_code=401,
            detail="Telegram data expired"
        )

    try:
        return json.loads(
            pairs.get("user", "{}")
        )
    except Exception:
        return {}


# =========================================================
# HEALTH
# =========================================================

@app.get("/health")
def health():

    return {
        "ok": True,
        "service": "MapSell API"
    }


# =========================================================
# SEARCH PLACES
# =========================================================

@app.get("/api/places/search")
async def search_places(
    q: str = Query(min_length=2),
    lat: float = 41.2995,
    lon: float = 69.2401
):

    q = q.strip()

    if not q:
        return []

    # Поддержка популярных запросов
    aliases = {
        "shop": "shop",
        "магазин": "shop",
        "store": "shop",

        "aptek": "pharmacy",
        "аптека": "pharmacy",
        "pharmacy": "pharmacy",

        "dental": "dentist",
        "стоматология": "dentist",
        "dentist": "dentist",

        "restaurant": "restaurant",
        "ресторан": "restaurant",

        "cafe": "cafe",
        "кафе": "cafe",

        "hotel": "hotel",
        "отель": "hotel",

        "supermarket": "supermarket",
        "супермаркет": "supermarket",

        "bank": "bank",
        "банк": "bank",

        "market": "market",
        "рынок": "market"
    }

    search_query = aliases.get(
        q.lower(),
        q
    )

    params = {
        "q": f"{search_query}, Tashkent, Uzbekistan",
        "format": "jsonv2",
        "limit": 50,
        "addressdetails": 1,
        "accept-language": "ru",
        "dedupe": 1
    }

    headers = {
        "User-Agent": "MapSell/1.0 (Tashkent map application)"
    }

    try:

        async with httpx.AsyncClient(
            timeout=20,
            headers=headers
        ) as client:

            response = await client.get(
                "https://nominatim.openstreetmap.org/search",
                params=params
            )

            response.raise_for_status()

            data = response.json()

    except Exception as e:

        print(
            "NOMINATIM ERROR:",
            repr(e)
        )

        raise HTTPException(
            status_code=502,
            detail="Ошибка сервиса поиска мест"
        )

    result = []

    for x in data:

        try:

            osm_type = str(
                x.get("osm_type", "")
            )

            osm_id = str(
                x.get("osm_id", "")
            )

            place_id = (
                f"{osm_type}_{osm_id}"
            )

            display_name = str(
                x.get(
                    "display_name",
                    "Место"
                )
            )

            name = (
                x.get("name")
                or display_name.split(",")[0]
                or "Место"
            )

            address = display_name

            place_lat = float(
                x["lat"]
            )

            place_lon = float(
                x["lon"]
            )

            result.append(
                {
                    "id": place_id,
                    "name": name,
                    "address": address,
                    "lat": place_lat,
                    "lon": place_lon,
                    "type": x.get(
                        "type",
                        ""
                    ),
                    "category": x.get(
                        "category",
                        ""
                    )
                }
            )

        except Exception as e:

            print(
                "PLACE PARSE ERROR:",
                repr(e)
            )

            continue

    return result


# =========================================================
# GET VISIT
# =========================================================

@app.get("/api/visits/{place_id}")
def get_visit(
    place_id: str,
    user_id: str,
    db: Session = Depends(get_db)
):

    visit = db.scalar(
        select(Visit).where(
            Visit.place_id == place_id,
            Visit.user_id == user_id
        )
    )

    if not visit:
        return None

    return {
        "id": visit.id,
        "place_id": visit.place_id,
        "user_id": visit.user_id,
        "user_name": visit.user_name,
        "name": visit.name,
        "address": visit.address,
        "lat": visit.lat,
        "lon": visit.lon,
        "visited": visit.visited,
        "sold": visit.sold,
        "note": visit.note,
        "created_at": visit.created_at,
        "updated_at": visit.updated_at
    }


# =========================================================
# SAVE / UPDATE VISIT
# =========================================================

@app.post("/api/visits")
def upsert_visit(
    payload: VisitIn,
    db: Session = Depends(get_db)
):

    visit = db.scalar(
        select(Visit).where(
            Visit.place_id == payload.place_id,
            Visit.user_id == payload.user_id
        )
    )

    data = payload.model_dump()

    if not visit:

        visit = Visit(
            **data
        )

        db.add(visit)

    else:

        for key, value in data.items():

            setattr(
                visit,
                key,
                value
            )

    db.commit()
    db.refresh(visit)

    return {
        "id": visit.id,
        "place_id": visit.place_id,
        "user_id": visit.user_id,
        "user_name": visit.user_name,
        "name": visit.name,
        "address": visit.address,
        "lat": visit.lat,
        "lon": visit.lon,
        "visited": visit.visited,
        "sold": visit.sold,
        "note": visit.note,
        "created_at": visit.created_at,
        "updated_at": visit.updated_at
    }


# =========================================================
# MY PLACES
# =========================================================

@app.get("/api/visits")
def my_visits(
    user_id: str,
    db: Session = Depends(get_db)
):

    visits = db.scalars(
        select(Visit)
        .where(
            Visit.user_id == user_id
        )
        .order_by(
            desc(Visit.updated_at)
        )
    ).all()

    return [
        {
            "id": v.id,
            "place_id": v.place_id,
            "user_id": v.user_id,
            "user_name": v.user_name,
            "name": v.name,
            "address": v.address,
            "lat": v.lat,
            "lon": v.lon,
            "visited": v.visited,
            "sold": v.sold,
            "note": v.note,
            "created_at": v.created_at,
            "updated_at": v.updated_at
        }
        for v in visits
    ]


# =========================================================
# ALL SHARED VISITS
# =========================================================

@app.get("/api/visits/all")
def all_shared_visits(
    user_id: str,
    db: Session = Depends(get_db)
):

    visits = db.scalars(
        select(Visit)
        .where(
            Visit.visited == True
        )
        .order_by(
            desc(Visit.updated_at)
        )
    ).all()

    return [
        {
            "id": v.id,
            "place_id": v.place_id,
            "user_id": v.user_id,
            "user_name": v.user_name,
            "name": v.name,
            "address": v.address,
            "lat": v.lat,
            "lon": v.lon,
            "visited": v.visited,
            "sold": v.sold,
            "note": v.note,
            "created_at": v.created_at,
            "updated_at": v.updated_at
        }
        for v in visits
    ]
# =========================================================
# ROUTING
# =========================================================

@app.get("/api/route")
async def get_route(
    start_lat: float,
    start_lon: float,
    end_lat: float,
    end_lon: float,
    profile: str = Query("car")
):
    """
    Построение маршрута.

    profile:
    - car
    - foot
    """

    if profile not in ["car", "foot"]:
        raise HTTPException(
            status_code=400,
            detail="profile должен быть car или foot"
        )

    if profile == "foot":
        router_url = (
            "https://routing.openstreetmap.de/"
            "routed-foot/route/v1/driving/"
            f"{start_lon},{start_lat};{end_lon},{end_lat}"
        )
    else:
        router_url = (
            "https://routing.openstreetmap.de/"
            "routed-car/route/v1/driving/"
            f"{start_lon},{start_lat};{end_lon},{end_lat}"
        )

    params = {
        "overview": "full",
        "geometries": "geojson",
        "steps": "false"
    }

    headers = {
        "User-Agent": "MapSell/1.0"
    }

    try:
        async with httpx.AsyncClient(
            timeout=30,
            headers=headers
        ) as client:

            response = await client.get(
                router_url,
                params=params
            )

            response.raise_for_status()

            data = response.json()

    except Exception as e:

        print(
            "ROUTING ERROR:",
            repr(e)
        )

        raise HTTPException(
            status_code=502,
            detail="Не удалось построить маршрут"
        )

    if data.get("code") != "Ok":
        raise HTTPException(
            status_code=404,
            detail="Маршрут не найден"
        )

    if not data.get("routes"):
        raise HTTPException(
            status_code=404,
            detail="Маршрут не найден"
        )

    route = data["routes"][0]

    return {
        "profile": profile,
        "distance": route.get("distance", 0),
        "duration": route.get("duration", 0),
        "geometry": route.get("geometry")
    }