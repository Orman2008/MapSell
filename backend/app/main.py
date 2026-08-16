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

app = FastAPI(title="Tashkent Map API")

origins = [
    x.strip()
    for x in os.getenv("CORS_ORIGINS", "*").split(",")
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class VisitIn(BaseModel):
    place_id: str
    name: str
    address: str = ""
    lat: float
    lon: float
    visited: bool = True
    sold: bool = False
    note: str | None = Field(default=None, max_length=2000)
    user_id: str
    user_name: str = "User"


def verify_telegram_init_data(init_data: str) -> dict:
    token = os.getenv("TELEGRAM_BOT_TOKEN")

    if not token:
        return {}

    pairs = dict(parse_qsl(init_data, keep_blank_values=True))

    received = pairs.pop("hash", None)

    if not received:
        raise HTTPException(401, "Invalid Telegram data")

    data_check = "\n".join(
        f"{k}={pairs[k]}"
        for k in sorted(pairs)
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

    if not hmac.compare_digest(expected, received):
        raise HTTPException(401, "Invalid Telegram signature")

    auth_date = int(pairs.get("auth_date", "0"))

    if time.time() - auth_date > 86400:
        raise HTTPException(401, "Telegram data expired")

    return json.loads(pairs.get("user", "{}"))


@app.get("/health")
def health():
    return {"ok": True}


# ---------------------------------------------------------
# SEARCH
# ---------------------------------------------------------

CATEGORY_MAP = {
    "shop": "shop",
    "магазин": "shop",
    "магазины": "shop",

    "aptek": "pharmacy",
    "аптек": "pharmacy",
    "аптека": "pharmacy",
    "аптеки": "pharmacy",
    "pharmacy": "pharmacy",

    "dental": "dentist",
    "dentist": "dentist",
    "стоматолог": "dentist",
    "стоматология": "dentist",
    "стоматологии": "dentist",

    "butik": "clothes",
    "бутик": "clothes",
    "бутики": "clothes",
    "boutique": "clothes",
}


@app.get("/api/places/search")
async def search_places(
    q: str = Query(min_length=2),
    lat: float = 41.2995,
    lon: float = 69.2401
):
    search = q.strip().lower()

    # Если введена категория
    category = CATEGORY_MAP.get(search)

    if category:
        query = f"""
        [out:json][timeout:20];

        (
          node["{category}"](around:5000,{lat},{lon});
          way["{category}"](around:5000,{lat},{lon});
          relation["{category}"](around:5000,{lat},{lon});
        );

        out center tags;
        """

        async with httpx.AsyncClient(
            timeout=30,
            headers={
                "User-Agent": "TashkentMap/1.0"
            }
        ) as client:

            r = await client.post(
                "https://overpass-api.de/api/interpreter",
                data=query
            )

            r.raise_for_status()

            data = r.json()

        result = []

        for x in data.get("elements", []):

            tags = x.get("tags", {})

            if x.get("type") == "node":
                item_lat = x.get("lat")
                item_lon = x.get("lon")
            else:
                center = x.get("center", {})
                item_lat = center.get("lat")
                item_lon = center.get("lon")

            if item_lat is None or item_lon is None:
                continue

            name = (
                tags.get("name")
                or tags.get("brand")
                or tags.get("operator")
                or "Без названия"
            )

            address_parts = [
                tags.get("addr:street"),
                tags.get("addr:housenumber"),
                tags.get("addr:city"),
            ]

            address = ", ".join(
                x for x in address_parts if x
            )

            result.append({
                "id": f"{x.get('type')}_{x.get('id')}",
                "name": name,
                "address": address,
                "lat": float(item_lat),
                "lon": float(item_lon),
                "category": category,
                "icon": {
                    "shop": "🛒",
                    "pharmacy": "💊",
                    "dentist": "🦷",
                    "clothes": "👗"
                }.get(category, "📍")
            })

        return result[:100]


    # Обычный поиск конкретного места
    params = {
        "q": f"{q}, Tashkent, Uzbekistan",
        "format": "jsonv2",
        "limit": 50,
        "accept-language": "ru"
    }

    async with httpx.AsyncClient(
        timeout=15,
        headers={
            "User-Agent": "TashkentMap/1.0"
        }
    ) as client:

        r = await client.get(
            "https://nominatim.openstreetmap.org/search",
            params=params
        )

        r.raise_for_status()

        data = r.json()

    return [
        {
            "id": (
                x.get("osm_type", "")
                + "_"
                + str(x.get("osm_id", ""))
            ),
            "name": x.get(
                "display_name",
                ""
            ).split(",")[0],

            "address": x.get(
                "display_name",
                ""
            ),

            "lat": float(x["lat"]),
            "lon": float(x["lon"]),

            "category": "place",
            "icon": "📍"
        }

        for x in data
    ]


# ---------------------------------------------------------
# VISITS
# ---------------------------------------------------------

@app.get("/api/visits/{place_id}")
def get_visit(
    place_id: str,
    user_id: str,
    db: Session = Depends(get_db)
):

    v = db.scalar(
        select(Visit).where(
            Visit.place_id == place_id,
            Visit.user_id == user_id
        )
    )

    if not v:
        return None

    return {
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
        "updated_at": v.updated_at,
    }


@app.post("/api/visits")
def upsert_visit(
    payload: VisitIn,
    db: Session = Depends(get_db)
):

    v = db.scalar(
        select(Visit).where(
            Visit.place_id == payload.place_id,
            Visit.user_id == payload.user_id
        )
    )

    if not v:
        v = Visit(**payload.model_dump())
        db.add(v)

    else:
        for k, val in payload.model_dump().items():
            setattr(v, k, val)

    db.commit()
    db.refresh(v)

    return {
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
        "updated_at": v.updated_at,
    }


@app.get("/api/visits")
def my_visits(
    user_id: str,
    db: Session = Depends(get_db)
):

    vs = db.scalars(
        select(Visit)
        .where(Visit.user_id == user_id)
        .order_by(desc(Visit.updated_at))
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
            "updated_at": v.updated_at,
        }
        for v in vs
    ]


@app.get("/api/visits/all")
def all_shared_visits(
    user_id: str,
    db: Session = Depends(get_db)
):

    vs = db.scalars(
        select(Visit)
        .where(Visit.visited == True)
        .order_by(desc(Visit.updated_at))
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
            "updated_at": v.updated_at,
        }
        for v in vs
    ]