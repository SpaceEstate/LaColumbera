import asyncio
import base64
import copy
import hmac
import os
import re
import secrets
import uuid
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import httpx
import jwt
from dotenv import load_dotenv
from fastapi import FastAPI, APIRouter, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr, Field
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from lib.db import client, db, ensure_indexes

UPLOAD_DIR = ROOT_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
DATAURL_RE = re.compile(r"^data:(image/(?:jpeg|png|webp));base64,(.+)$", re.S)
EXT_FOR_MIME = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}

CORTE_FOTO = [
    "/img/corte/Copia%20di%20Soggiorno%201.jpg",
    "/img/corte/Copia%20di%20Soggiorno%202.jpg",
    "/img/corte/Copia%20di%20Soggiorno%203.jpg",
    "/img/corte/Copia%20di%20Soggiorno%204.jpg",
    "/img/corte/Copia%20di%20Soggiorno%205.jpg",
    "/img/corte/Copia%20di%20Soggiorno%206.jpg",
    "/img/corte/Copia%20di%20Bagno%201.jpg",
    "/img/corte/Copia%20di%20Bagno%202.jpg",
    "/img/corte/Copia%20di%20Bagno%203.jpg",
    "/img/corte/Copia%20di%20Bagno%204.jpg",
    "/img/corte/Copia%20di%20Bagno%205.jpg",
    "/img/corte/Copia%20di%20Camera%201.jpg",
    "/img/corte/Copia%20di%20Camera%202.jpg",
    "/img/corte/Copia%20di%20Camera%203.jpg",
    "/img/corte/Copia%20di%20Camera%204.jpg",
    "/img/corte/Copia%20di%20Corridoio.jpg",
    "/img/corte/Copia%20di%20Letto%201.jpg",
    "/img/corte/Copia%20di%20Letto%202.jpg",
    "/img/corte/Copia%20di%20Letto%203.jpg",
]

TORRE_FOTO = [
    "/img/torre/Copia%20di%20Soggiorno%201.jpg",
    "/img/torre/Copia%20di%20Soggiorno%202.jpg",
    "/img/torre/Copia%20di%20Soggiorno%203.jpg",
    "/img/torre/Copia%20di%20Soggiorno%204.jpg",
    "/img/torre/Copia%20di%20Bagno%201.jpg",
    "/img/torre/Copia%20di%20Bagno%202.jpg",
    "/img/torre/Copia%20di%20Bagno%203.jpg",
    "/img/torre/Copia%20di%20Bagno%204.jpg",
    "/img/torre/Copia%20di%20Bagno%205.jpg",
    "/img/torre/Copia%20di%20Bagno%206.jpg",
    "/img/torre/Copia%20di%20Corridoio.jpg",
    "/img/torre/Copia%20di%20Cucina%201.jpg",
    "/img/torre/Copia%20di%20Cucina%202.jpg",
    "/img/torre/Copia%20di%20Cucina%203.jpg",
    "/img/torre/Copia%20di%20Cucina%204.jpg",
    "/img/torre/Copia%20di%20Divanetto%201.jpg",
    "/img/torre/Copia%20di%20Divanetto%202.jpg",
    "/img/torre/Copia%20di%20Divanetto%203.jpg",
    "/img/torre/Copia%20di%20Doppia%201.jpg",
    "/img/torre/Copia%20di%20Matrimoniale%201.jpg",
    "/img/torre/Copia%20di%20Matrimoniale%202.jpg",
    "/img/torre/Copia%20di%20Matrimoniale%203.jpg",
    "/img/torre/Copia%20di%20Matrimoniale%204.jpg",
    "/img/torre/Copia%20di%20Terzo%20letto.jpg",
]

DEFAULT_CONFIG = {
    "id": "site",
    "chi": "La Columbera è una dimora storica del XV secolo nel borgo di Ravina, alle porte di Trento. Due appartamenti indipendenti, Torre e Corte, con cucina attrezzata, bagno privato, zona living e tutti i comfort per soggiorni brevi o più prolungati.",
    "apts": [
        {
            "id": "torre",
            "nome": "La Columbera Torre",
            "sotto": "Su due livelli · fino a 5 ospiti",
            "testo": "Sviluppato su due piani nella dimora quattrocentesca, l'appartamento Torre è la scelta ideale per famiglie e piccoli gruppi che vogliono vivere la dimora in autonomia.\n\nAmpio soggiorno con travi a vista, cucina attrezzata, camere confortevoli distribuite su due livelli e bagni completi. Biancheria, WiFi e check-in autonomo inclusi.\n\nIl borgo di Ravina è a due passi, il centro di Trento a pochi minuti: la base perfetta per scoprire il territorio trentino.",
            "base": 180,
            "inclusi": 2,
            "extra": 20,
            "max": 5,
            "min": 2,
            "foto": TORRE_FOTO,
            "periodi": [],
        },
        {
            "id": "corte",
            "nome": "La Columbera Corte",
            "sotto": "Piano terra · fino a 4 ospiti",
            "testo": "Al piano terra della dimora, con accesso indipendente, l'appartamento Corte accoglie coppie, famiglie e piccoli gruppi di amici in ambienti curati.\n\nSoggiorno accogliente, cucina attrezzata, camere rifinite e bagno privato. Biancheria, WiFi e check-in autonomo inclusi, per sentirsi subito a casa.\n\nFuori, il borgo di Ravina con i suoi scorci storici; il centro di Trento è a pochi minuti.",
            "base": 120,
            "inclusi": 2,
            "extra": 20,
            "max": 4,
            "min": 2,
            "foto": CORTE_FOTO,
            "periodi": [],
        },
    ],
}


class Periodo(BaseModel):
    da: str
    a: str
    prezzo: float


class Apartment(BaseModel):
    id: str
    nome: str
    sotto: str = ""
    testo: str = ""
    base: float = 0
    inclusi: int = 1
    extra: float = 0
    max: int = 1
    min: int = 1
    foto: list[str] = Field(default_factory=list)
    periodi: list[Periodo] = Field(default_factory=list)


class SiteConfig(BaseModel):
    id: str = "site"
    chi: str = ""
    apts: list[Apartment] = Field(default_factory=list)


class Booking(BaseModel):
    code: str
    id: str
    da: str
    a: str
    ospiti: int
    nome: str
    email: str
    tel: str = ""
    totale: float
    stato: str = "richiesta"
    creato: str = ""


class BookRequest(BaseModel):
    id: str
    da: str
    a: str
    ospiti: int = 1
    nome: str = Field(min_length=1, max_length=80)
    email: EmailStr
    tel: str = ""


class MieRequest(BaseModel):
    email: EmailStr
    code: str


class LoginRequest(BaseModel):
    u: str
    p: str


class StatusRequest(BaseModel):
    code: str
    stato: str


class UploadRequest(BaseModel):
    id: str
    img: str


class ExtEvent(BaseModel):
    id: str
    da: str
    a: str
    src: str


class AdminData(BaseModel):
    bk: list[Booking]
    ext: list[ExtEvent]


def list_days(da: str, a: str) -> list[str]:
    d = date.fromisoformat(da)
    end = date.fromisoformat(a)
    out = []
    while d < end:
        out.append(d.isoformat())
        d += timedelta(days=1)
    return out


def night_price(apt: dict, day: str) -> float:
    for q in apt.get("periodi", []):
        if q["da"] <= day <= q["a"]:
            return float(q["prezzo"])
    return float(apt["base"])


def total_price(apt: dict, da: str, a: str, ospiti: int) -> float:
    return sum(
        night_price(apt, d) + max(0, ospiti - int(apt["inclusi"])) * float(apt["extra"])
        for d in list_days(da, a)
    )


async def get_config_doc() -> dict:
    doc = await db.config.find_one({"id": "site"}, {"_id": 0})
    if not doc:
        doc = copy.deepcopy(DEFAULT_CONFIG)
        await db.config.insert_one(copy.deepcopy(DEFAULT_CONFIG))
    return doc


async def external_events(apt_id: str) -> list[dict]:
    raw = os.environ.get(f"ICAL_{apt_id.upper()}", "")
    urls = [u.strip() for u in raw.split(",") if u.strip()]
    events: list[dict] = []
    if not urls:
        return events
    async with httpx.AsyncClient(timeout=10, follow_redirects=True) as http:
        for u in urls:
            try:
                text = (await http.get(u)).text
            except Exception:
                continue
            low = u.lower()
            src = "Booking" if "booking" in low else "Airbnb" if "airbnb" in low else "Altro"
            for ev in text.split("BEGIN:VEVENT")[1:]:
                m1 = re.search(r"DTSTART[^:]*:(\d{8})", ev)
                m2 = re.search(r"DTEND[^:]*:(\d{8})", ev)
                if m1 and m2:
                    s, e = m1.group(1), m2.group(1)
                    events.append({"da": f"{s[:4]}-{s[4:6]}-{s[6:]}", "a": f"{e[:4]}-{e[4:6]}-{e[6:]}", "src": src})
    return events


async def busy_days(apt_id: str) -> set:
    days: set = set()
    for ev in await external_events(apt_id):
        days.update(list_days(ev["da"], ev["a"]))
    async for b in db.bookings.find({"id": apt_id, "stato": {"$ne": "annullata"}}, {"_id": 0, "da": 1, "a": 1}):
        days.update(list_days(b["da"], b["a"]))
    return days


def create_admin_token() -> str:
    exp = datetime.now(timezone.utc) + timedelta(hours=12)
    return jwt.encode({"sub": "admin", "exp": exp}, os.environ["JWT_SECRET"], algorithm="HS256")


def require_admin(request: Request) -> None:
    auth = request.headers.get("Authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else auth
    try:
        jwt.decode(token, os.environ["JWT_SECRET"], algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Non autorizzato")


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.index_task = asyncio.create_task(ensure_indexes())
    await get_config_doc()
    yield
    client.close()


app = FastAPI(lifespan=lifespan)
api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root():
    return {"message": "La Columbera API"}


@api_router.get("/config", response_model=SiteConfig)
async def get_site_config():
    doc = await get_config_doc()
    return SiteConfig(**doc)


@api_router.get("/busy", response_model=list[str])
async def get_busy(id: str):
    return sorted(await busy_days(id))


@api_router.post("/book", response_model=Booking)
async def create_booking(input: BookRequest):
    cfg = await get_config_doc()
    apt = next((p for p in cfg["apts"] if p["id"] == input.id), None)
    today = datetime.now(timezone.utc).date().isoformat()
    if not apt or not DATE_RE.match(input.da) or not DATE_RE.match(input.a) or input.a <= input.da or input.da < today:
        raise HTTPException(status_code=400, detail="Dati non validi")
    nights = list_days(input.da, input.a)
    if len(nights) < int(apt["min"]) or len(nights) > 60:
        raise HTTPException(status_code=400, detail=f"Durata non valida (minimo {apt['min']} notti)")
    ospiti = min(max(input.ospiti, 1), int(apt["max"]))
    occupied = await busy_days(apt["id"])
    if any(d in occupied for d in nights):
        raise HTTPException(status_code=409, detail="Date non più disponibili")
    booking = Booking(
        code=secrets.token_hex(3).upper(),
        id=apt["id"],
        da=input.da,
        a=input.a,
        ospiti=ospiti,
        nome=input.nome.strip()[:80],
        email=str(input.email).lower()[:120],
        tel=(input.tel or "")[:30],
        totale=total_price(apt, input.da, input.a, ospiti),
        stato="richiesta",
        creato=datetime.now(timezone.utc).isoformat(),
    )
    await db.bookings.insert_one(booking.model_dump())
    return booking


@api_router.post("/mie", response_model=list[Booking])
async def my_bookings(input: MieRequest):
    email = str(input.email).lower()
    code = input.code.strip().upper()
    rows = await db.bookings.find({"email": email}, {"_id": 0}).to_list(200)
    if not any(hmac.compare_digest(r["code"], code) for r in rows):
        raise HTTPException(status_code=404, detail="Nessuna prenotazione trovata con questi dati")
    return [Booking(**r) for r in rows]


@api_router.post("/admin/login")
async def admin_login(input: LoginRequest):
    au = os.environ.get("ADMIN_USER", "")
    ap = os.environ.get("ADMIN_PASSWORD", "")
    if not au or not ap:
        raise HTTPException(status_code=500, detail="Credenziali admin non configurate")
    if hmac.compare_digest(input.u, au) and hmac.compare_digest(input.p, ap):
        return {"t": create_admin_token()}
    await asyncio.sleep(1.2)
    raise HTTPException(status_code=401, detail="Credenziali errate")


@api_router.get("/admin/data", response_model=AdminData)
async def admin_data(request: Request):
    require_admin(request)
    cfg = await get_config_doc()
    bk = await db.bookings.find({}, {"_id": 0}).sort("creato", -1).to_list(1000)
    today = datetime.now(timezone.utc).date().isoformat()
    ext: list[dict] = []
    for p in cfg["apts"]:
        for ev in await external_events(p["id"]):
            ext.append({"id": p["id"], **ev})
    ext = sorted([e for e in ext if e["a"] >= today], key=lambda e: e["da"])
    return AdminData(bk=[Booking(**b) for b in bk], ext=[ExtEvent(**e) for e in ext])


@api_router.post("/admin/status")
async def set_booking_status(input: StatusRequest, request: Request):
    require_admin(request)
    if input.stato not in ("richiesta", "confermata", "annullata"):
        raise HTTPException(status_code=400, detail="Stato non valido")
    await db.bookings.update_one({"code": input.code}, {"$set": {"stato": input.stato}})
    return {"ok": 1}


@api_router.post("/admin/upload")
async def upload_photo(input: UploadRequest, request: Request):
    require_admin(request)
    m = DATAURL_RE.match(input.img or "")
    if not m:
        raise HTTPException(status_code=400, detail="Immagine non valida")
    apt = re.sub(r"\W", "", input.id) or "misc"
    try:
        raw = base64.b64decode(m.group(2))
    except Exception:
        raise HTTPException(status_code=400, detail="Immagine non valida")
    if len(raw) > 8 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Immagine troppo grande")
    folder = UPLOAD_DIR / apt
    folder.mkdir(exist_ok=True)
    name = f"{uuid.uuid4().hex}{EXT_FOR_MIME[m.group(1)]}"
    (folder / name).write_bytes(raw)
    return {"url": f"/api/uploads/{apt}/{name}"}


@api_router.post("/admin/save")
async def save_config(input: SiteConfig, request: Request):
    require_admin(request)
    cfg = input.model_dump()
    cfg["id"] = "site"
    old = await get_config_doc()
    keep = {u for p in cfg["apts"] for u in p["foto"]}
    for p in old["apts"]:
        for u in p["foto"]:
            if u not in keep and u.startswith("/api/uploads/"):
                try:
                    (UPLOAD_DIR / u.removeprefix("/api/uploads/")).unlink()
                except OSError:
                    pass
    await db.config.replace_one({"id": "site"}, cfg, upsert=True)
    return {"ok": 1}


app.include_router(api_router)
app.mount("/api/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)
