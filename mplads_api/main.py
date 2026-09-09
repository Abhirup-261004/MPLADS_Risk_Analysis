import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from mplads_api.config import settings
from mplads_api.core.feature_store import FeatureStore
from mplads_api.routers import categorize, disbursement, cost, vendor, mp_risk, dashboard

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
logger = logging.getLogger("mplads_api")

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up MPLADS Risk Analytics API...")
    store = FeatureStore.get_instance()
    store.load_all()
    yield
    logger.info("Shutting down MPLADS Risk Analytics API.")

app = FastAPI(
    title=settings.API_TITLE,
    version=settings.API_VERSION,
    description="AI-powered anomaly, fraud & inefficiency detection API for the MPLAD Scheme",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(categorize.router)
app.include_router(disbursement.router)
app.include_router(cost.router)
app.include_router(vendor.router)
app.include_router(mp_risk.router)
app.include_router(dashboard.router)

@app.get("/")
def root():
    return {
        "title": settings.API_TITLE,
        "version": settings.API_VERSION,
        "docs_url": "/docs",
        "health_url": "/health"
    }
