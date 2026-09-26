FROM python:3.11-slim AS builder
RUN apt-get update && apt-get install -y --no-install-recommends build-essential libgomp1 && rm -rf /var/lib/apt/lists/*
WORKDIR /build
COPY requirements.txt .
RUN python -m venv /opt/venv && /opt/venv/bin/pip install --no-cache-dir --upgrade pip && /opt/venv/bin/pip install --no-cache-dir -r requirements.txt

FROM python:3.11-slim AS production
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 curl && rm -rf /var/lib/apt/lists/*
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
ENV PYTHONUNBUFFERED=1
RUN groupadd --gid 1001 appuser && useradd --uid 1001 --gid appuser --shell /bin/bash appuser
WORKDIR /app
COPY mplads_api/ ./mplads_api/
COPY requirements.txt .
COPY shared_preprocessing_artifacts/fact_work_feature7.parquet ./shared_preprocessing_artifacts/fact_work_feature7.parquet
COPY feature1_artifacts/feature1_fact_work_disbursement_risk.parquet ./feature1_artifacts/feature1_fact_work_disbursement_risk.parquet
COPY feature2_artifacts/feature2_fact_work_cost_risk.parquet ./feature2_artifacts/feature2_fact_work_cost_risk.parquet
COPY feature5_artifacts/feature5_vendor_risk.parquet ./feature5_artifacts/feature5_vendor_risk.parquet
COPY feature7_artifacts/feature7_mp_composite_risk.parquet ./feature7_artifacts/feature7_mp_composite_risk.parquet
COPY feature3_artifacts/feature3_tfidf_lightgbm_classifier.joblib ./feature3_artifacts/feature3_tfidf_lightgbm_classifier.joblib
COPY feature3_artifacts/feature3_taxonomy_config.json ./feature3_artifacts/feature3_taxonomy_config.json

USER appuser
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=3 CMD curl -f http://localhost:8000/health || exit 1
CMD ["sh", "-c", "uvicorn mplads_api.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1 --timeout-keep-alive 120"]
