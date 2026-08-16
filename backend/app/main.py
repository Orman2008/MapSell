import os
import hashlib
import hmac
import json
import time
import math
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

origins = [
    x.strip()
    for x in os.getenv("CORS_ORIGINS", "*").split(",")
    if x.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# -------------------------
# MODELS
# -------------------------

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


# -------------------------
# TELEGRAM
# -------------------------

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


# -------------------------
# HEALTH
# -------------------------

@app.get("/health")
def health():
    return {"ok": True}


# -------------------------
# PLACE SEARCH
# -------------------------

CATEGORY_MAP = {
    "shop": {
        "emoji": "🛒",
        "label": "Магазин",
        "query": '["shop"]'
    },
    "магазин": {
        "emoji": "🛒",
        "label": "Магазин",
        "query": '["shop"]'
    },
    "аптека": {
        "emoji": "💊",
        "label": "Аптека",
        "query": '["amenity"="pharmacy"]'
    },
    "aptek": {
        "emoji": "💊",
        "label": "Аптека",
        "query": '["amenity"="pharmacy"]'
    },
    "pharmacy": {
        "emoji": "💊",
        "label": "Аптека",
        "query": '["amenity"="pharmacy"]'
    },
    "dental": {
        "emoji": "🦷",
        "label": "Стоматология",
        "query": '["amenity"="dentist"]'
    },
    "dentist": {
        "emoji": "🦷",
        "label": "Стоматология",
        "query": '["amenity"="dentist"]'
    },
    "ресторан": {
        "emoji": "🍴",
        "label": "Ресторан",
        "query": '["amenity"="restaurant"]'
    },
    "restaurant": {
        "emoji": "🍴",
        "label": "Ресторан",
        "query": '["amenity"="restaurant"]'
    },
    "hotel": {
        "emoji": "🏨",
        "label": "Отель",
        "query": '["tourism"="hotel"]'
    },
    "отель": {
        "emoji": "🏨",
        "label": "Отель",
        "query": '["tourism"="hotel"]'
    },
    "beauty": {
        "emoji": "💄",
        "label": "Салон",
        "query": '["shop"="beauty"]'
    },
    "салон": {
        "emoji": "💄",
        "label": "Салон",
        "query": '["shop"="beauty"]'
    },
    "market": {
        "emoji": "🛒",
        "label": "Маркет",
        "query": '["shop"="supermarket"]'
    },
    "supermarket": {
        "emoji": "🛒",
        "label": "Супермаркет",
        "query": '["shop"="supermarket"]'
    },
}


def get_category(q: str):
    value = q.strip().lower()

    if value in CATEGORY_MAP:
        return CATEGORY_MAP[value]

    if "аптек" in value or "pharm" in value:
        return CATEGORY_MAP["pharmacy"]

    if "dent" in value or "стомат" in value:
        return CATEGORY_MAP["dental"]

    if "shop" in value or "магаз" in value:
        return CATEGORY_MAP["shop"]

    if "restaurant" in value or "ресторан" in value:
        return CATEGORY_MAP["restaurant"]

    if "hotel" in value or "отел" in value:
        return CATEGORY_MAP["hotel"]

    return None


def haversine(lat1, lon1, lat2, lon2):
    R = 6371000

    p1 = math.radians(lat1)
    p2 = math.radians(lat2)

    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)

    a = (
        math.sin(dp / 2) ** 2
        + math.cos(p1)
        * math.cos(p2)
        * math.sin(dl / 2) ** 2
    )

    return R * 2 * math.atan2(
        math.sqrt(a),
        math.sqrt(1 - a)
    )


@app.get("/api/places/search")
async def search_places(
    q: str = Query(min_length=2),
    lat: float = 41.2995,
    lon: float = 69.2401,
    radius: int = Query(default=10000, ge=500, le=30000)
):

    category = get_category(q)

    if category:
        selector = category["query"]
        category_emoji = category["emoji"]
        category_label = category["label"]

        overpass_query = f"""
        [out:json][timeout:25];

        (
          node{selector}(around:{radius},{lat},{lon});
          way{selector}(around:{radius},{lat},{lon});
        );

        out center tags;
        """

    else:
        # For normal text search, use Nominatim.
        params = {
            "q": f"{q}, Tashkent, Uzbekistan",
            "format": "jsonv2",
            "limit": 50,
            "accept-language": "ru"
        }

        async with httpx.AsyncClient(
            timeout=20,
            headers={"User-Agent": "MapSell/1.0"}
        ) as client:

            r = await client.get(
                "https://nominatim.openstreetmap.org/search",
                params=params
            )

            r.raise_for_status()

            data = r.json()

        result = []

        for x in data:
            result.append({
                "id": f"{x.get('osm_type','')}_{x.get('osm_id','')}",
                "name": x.get("display_name", "").split(",")[0],
                "address": x.get("display_name", ""),
                "lat": float(x["lat"]),
                "lon": float(x["lon"]),
                "category": "📍",
                "category_name": "Место"
            })

        return result

    async with httpx.AsyncClient(
        timeout=35,
        headers={"User-Agent": "MapSell/1.0"}
    ) as client:

        r = await client.post(
            "https://overpass-api.de/api/interpreter",
            data={"data": overpass_query}
        )

        r.raise_for_status()

        data = r.json()

    result = []

    for element in data.get("elements", []):

        tags = element.get("tags", {})

        if element["type"] == "node":
            p_lat = element.get("lat")
            p_lon = element.get("lon")
        else:
            center = element.get("center", {})
            p_lat = center.get("lat")
            p_lon = center.get("lon")

        if p_lat is None or p_lon is None:
            continue

        name = tags.get("name")

        if not name:
            name = tags.get("brand") or category_label

        address_parts = []

        for key in [
            "addr:street",
            "addr:housenumber",
            "addr:district"
        ]:
            if tags.get(key):
                address_parts.append(tags[key])

        address = ", ".join(address_parts)

        distance = haversine(
            lat,
            lon,
            float(p_lat),
            float(p_lon)
        )

        result.append({
            "id": f"{element['type']}_{element['id']}",
            "name": name,
            "address": address,
            "lat": float(p_lat),
            "lon": float(p_lon),
            "category": category_emoji,
            "category_name": category_label,
            "distance_straight": round(distance)
        })

    result.sort(
        key=lambda x: x.get("distance_straight", 999999999)
    )

    return result[:100]


# -------------------------
# ROUTING
# -------------------------

VALHALLA_URL = os.getenv(
    "VALHALLA_URL",
    "https://valhalla1.openstreetmap.de/route"
)


@app.get("/api/route")
async def route(
    from_lat: float,
    from_lon: float,
    to_lat: float,
    to_lon: float,
    mode: str = "pedestrian"
):

    if mode not in ["pedestrian", "auto"]:
        raise HTTPException(
            400,
            "mode must be pedestrian or auto"
        )

    payload = {
        "locations": [
            {
                "lat": from_lat,
                "lon": from_lon
            },
            {
                "lat": to_lat,
                "lon": to_lon
            }
        ],
        "costing": mode,
        "units": "kilometers",
        "directions_options": {
            "units": "kilometers"
        }
    }

    async with httpx.AsyncClient(
        timeout=30,
        headers={
            "User-Agent": "MapSell/1.0",
            "X-Client-Id": "mapsell"
        }
    ) as client:

        r = await client.post(
            VALHALLA_URL,
            json=payload
        )

        r.raise_for_status()

        data = r.json()

    trip = data.get("trip", {})
    summary = trip.get("summary", {})

    maneuvers = trip.get("legs", [{}])[0].get(
        "maneuvers",
        []
    )

    shape = trip.get("legs", [{}])[0].get(
        "shape"
    )

    return {
        "distance_km": round(
            float(summary.get("length", 0)),
            2
        ),
        "duration_min": round(
            float(summary.get("time", 0)) / 60
        ),
        "shape": shape,
        "maneuvers": [
            {
                "instruction": x.get(
                    "instruction",
                    ""
                ),
                "length_km": round(
                    float(x.get("length", 0)),
                    2
                )
            }
            for x in maneuvers
        ]
    }


# -------------------------
# VISITS
# -------------------------

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
        c.name: getattr(v, c.name)
        for c in Visit.__table__.columns
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
        for key, value in payload.model_dump().items():
            setattr(v, key, value)

    db.commit()
    db.refresh(v)

    return {
        c.name: getattr(v, c.name)
        for c in Visit.__table__.columns
    }


@app.get("/api/visits")
def my_visits(
    user_id: str,
    db: Session = Depends(get_db)
):

    visits = db.scalars(
        select(Visit)
        .where(Visit.user_id == user_id)
        .order_by(desc(Visit.updated_at))
    ).all()

    return [
        {
            c.name: getattr(v, c.name)
            for c in Visit.__table__.columns
        }
        for v in visits
    ]


@app.get("/api/visits/all")
def all_shared_visits(
    user_id: str,
    db: Session = Depends(get_db)
):

    visits = db.scalars(
        select(Visit)
        .where(Visit.visited == True)
        .order_by(desc(Visit.updated_at))
    ).all()

    return [
        {
            c.name: getattr(v, c.name)
            for c in Visit.__table__.columns
        }
        for v in visits
    ]