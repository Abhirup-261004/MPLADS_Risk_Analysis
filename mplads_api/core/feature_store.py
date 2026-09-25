import gc
import logging
import json
import math
import re
import os
import joblib
import numpy as np
import pandas as pd
from pathlib import Path
from typing import Dict, Any, Optional, List, Tuple
from mplads_api.config import settings

logger = logging.getLogger("mplads_api.feature_store")

def sanitize_record(record: Dict[str, Any]) -> Dict[str, Any]:
    clean = {}
    for k, v in record.items():
        if v is None or pd.isna(v):
            clean[k] = None
        elif isinstance(v, (np.integer, int)):
            clean[k] = int(v)
        elif isinstance(v, (np.floating, float)):
            if math.isnan(v) or math.isinf(v):
                clean[k] = None
            else:
                clean[k] = float(v)
        elif isinstance(v, (np.bool_, bool)):
            clean[k] = bool(v)
        else:
            clean[k] = str(v)
    return clean

def normalize_text(text: str) -> str:
    if not text:
        return ""
    return re.sub(r"[^A-Z0-9]", "", str(text).upper().strip())

class FeatureStore:
    _instance = None

    def __init__(self):
        self.nlp_classifier: Optional[Any] = None
        self.nlp_taxonomy: Optional[Dict[str, Any]] = None
        
        self.work_index: Dict[str, Dict[str, Any]] = {}
        self.mp_index: Dict[str, Dict[str, Any]] = {}
        self.vendor_index: Dict[str, Dict[str, Any]] = {}
        self.state_index: Dict[str, Dict[str, Any]] = {}
        self.mp_top20: List[Dict[str, Any]] = []

        self.name_to_keys_index: Dict[str, List[str]] = {}
        self.normalized_key_index: Dict[str, str] = {}

    @classmethod
    def get_instance(cls) -> "FeatureStore":
        if cls._instance is None:
            cls._instance = FeatureStore()
        return cls._instance

    def load_all(self):
        logger.info("--- Initializing FeatureStore & Model Registry ---")

        f1_path = settings.FEATURE1_ARTIFACT_DIR / "feature1_fact_work_disbursement_risk.parquet"
        if not f1_path.exists():
            f1_path = settings.SHARED_ARTIFACT_DIR / "fact_work_feature7.parquet"
            
        if f1_path.exists():
            logger.info("Loading Feature 1 work table from %s", f1_path)
            f1_df = pd.read_parquet(f1_path)
            for row in f1_df.to_dict(orient="records"):
                clean_dict = sanitize_record(row)
                w_id = str(clean_dict.get("work_id", ""))
                w_key = str(clean_dict.get("work_key", ""))
                if w_id and w_id != "None":
                    self.work_index[w_id] = clean_dict
                if w_key and w_key != "None":
                    self.work_index[w_key] = clean_dict
            del f1_df
        else:
            logger.error("Required parquet missing: %s", f1_path)

        f2_path = settings.FEATURE2_ARTIFACT_DIR / "feature2_fact_work_cost_risk.parquet"
        if f2_path.exists():
            logger.info("Merging Feature 2 work table from %s", f2_path)
            f2_df = pd.read_parquet(f2_path)
            for row in f2_df.to_dict(orient="records"):
                clean_dict = sanitize_record(row)
                w_id = str(clean_dict.get("work_id", ""))
                w_key = str(clean_dict.get("work_key", ""))
                target_keys = [k for k in [w_id, w_key] if k and k != "None"]
                for k in target_keys:
                    if k in self.work_index:
                        self.work_index[k].update(clean_dict)
                    else:
                        self.work_index[k] = clean_dict
            del f2_df
        else:
            logger.error("Required parquet missing: %s", f2_path)

        gc.collect()
        logger.info("Indexed %d combined work records.", len(self.work_index))

        mp_path = settings.FEATURE7_ARTIFACT_DIR / "feature7_mp_composite_risk.parquet"
        if mp_path.exists():
            logger.info("Loading MP composite scorecard from %s", mp_path)
            mp_df = pd.read_parquet(mp_path)
            for row in mp_df.to_dict(orient="records"):
                clean_dict = sanitize_record(row)
                mp_k = str(clean_dict.get("mp_key", ""))
                mp_name = str(clean_dict.get("mp_name_clean", ""))

                if mp_k and mp_k != "None":
                    self.mp_index[mp_k] = clean_dict

                    norm_k = normalize_text(mp_k)
                    if norm_k:
                        self.normalized_key_index[norm_k] = mp_k

                    norm_name = normalize_text(mp_name)
                    if norm_name:
                        if norm_name not in self.name_to_keys_index:
                            self.name_to_keys_index[norm_name] = []
                        if mp_k not in self.name_to_keys_index[norm_name]:
                            self.name_to_keys_index[norm_name].append(mp_k)

            logger.info("Indexed %d MP composite scorecards (%d clean names).", len(self.mp_index), len(self.name_to_keys_index))

            sort_col = "ml_augmented_composite_risk_score" if "ml_augmented_composite_risk_score" in mp_df.columns else "composite_risk_score"
            top20 = mp_df.sort_values(by=sort_col, ascending=False).head(20)
            self.mp_top20 = [sanitize_record(r) for r in top20.to_dict(orient="records")]

            state_groups = mp_df.groupby("state")
            for state_name, group in state_groups:
                st_str = str(state_name).upper().strip()
                record_dict = {
                    "state": str(state_name),
                    "mp_count": int(len(group)),
                    "mean_composite_risk_score": float(group["ml_augmented_composite_risk_score"].mean()) if "ml_augmented_composite_risk_score" in group else float(group["composite_risk_score"].mean()),
                    "mean_allocation_utilization_pct": float(group["allocation_utilization_pct"].mean()) if "allocation_utilization_pct" in group.columns else 0.0,
                    "critical_mp_count": int((group["ml_augmented_risk_tier"] == "Critical").sum()) if "ml_augmented_risk_tier" in group else int((group["composite_risk_tier"] == "Critical").sum()),
                    "high_mp_count": int((group["ml_augmented_risk_tier"] == "High").sum()) if "ml_augmented_risk_tier" in group else int((group["composite_risk_tier"] == "High").sum()),
                    "medium_mp_count": int((group["ml_augmented_risk_tier"] == "Medium").sum()) if "ml_augmented_risk_tier" in group else int((group["composite_risk_tier"] == "Medium").sum()),
                    "low_mp_count": int((group["ml_augmented_risk_tier"] == "Low").sum()) if "ml_augmented_risk_tier" in group else int((group["composite_risk_tier"] == "Low").sum()),
                }
                self.state_index[st_str] = sanitize_record(record_dict)

            del mp_df
            gc.collect()
        else:
            logger.error("Required parquet missing: %s", mp_path)

        vendor_path = settings.FEATURE5_ARTIFACT_DIR / "feature5_vendor_risk.parquet"
        if vendor_path.exists():
            logger.info("Loading vendor risk table from %s", vendor_path)
            vendor_df = pd.read_parquet(vendor_path)
            for row in vendor_df.to_dict(orient="records"):
                clean_dict = sanitize_record(row)
                v_id = str(clean_dict.get("vendor_id", ""))
                if v_id and v_id != "None":
                    self.vendor_index[v_id] = clean_dict
            del vendor_df
            gc.collect()
            logger.info("Indexed %d vendor risk records.", len(self.vendor_index))
        else:
            logger.error("Required parquet missing: %s", vendor_path)

        clf_path = settings.FEATURE3_ARTIFACT_DIR / "feature3_tfidf_lightgbm_classifier.joblib"
        if clf_path.exists():
            try:
                logger.info("Loading Feature 3 TF-IDF + LightGBM classifier from %s", clf_path)
                self.nlp_classifier = joblib.load(clf_path)
            except Exception as e:
                logger.error("Failed to load NLP classifier: %s", e)

        cfg_path = settings.FEATURE3_ARTIFACT_DIR / "feature3_taxonomy_config.json"
        if cfg_path.exists():
            try:
                with open(cfg_path, "r", encoding="utf-8") as f:
                    self.nlp_taxonomy = json.load(f)
            except Exception as e:
                logger.error("Failed to load taxonomy config: %s", e)

        try:
            import psutil
            rss_mb = psutil.Process().memory_info().rss // (1024 * 1024)
        except ImportError:
            rss_mb = 0
        logger.info("--- FeatureStore Load Complete (works=%d, mps=%d, vendors=%d, rss=%dMB) ---",
                     len(self.work_index), len(self.mp_index), len(self.vendor_index), rss_mb)

    def resolve_mp(self, identifier: str, house: Optional[str] = None, state: Optional[str] = None) -> Tuple[Optional[Dict[str, Any]], List[Dict[str, Any]]]:
        if not identifier or not identifier.strip():
            return None, []

        raw_input = identifier.strip()
        norm_input = normalize_text(raw_input)

        if raw_input in self.mp_index:
            return self.mp_index[raw_input], []

        if norm_input in self.normalized_key_index:
            canonical_key = self.normalized_key_index[norm_input]
            return self.mp_index[canonical_key], []

        if norm_input.startswith("LS") or norm_input.startswith("RS"):
            prefix = norm_input[:2]
            rest = norm_input[2:]
            if rest in self.name_to_keys_index:
                for k in self.name_to_keys_index[rest]:
                    if k.startswith(prefix + "_"):
                        return self.mp_index[k], []

        candidate_keys = list(self.name_to_keys_index.get(norm_input, []))

        if not candidate_keys:
            for norm_name, keys in self.name_to_keys_index.items():
                if norm_input in norm_name or norm_name in norm_input:
                    candidate_keys.extend(keys)

        candidate_keys = list(dict.fromkeys(candidate_keys))

        if not candidate_keys:
            return None, []

        candidate_records = [self.mp_index[k] for k in candidate_keys if k in self.mp_index]

        filtered = candidate_records
        if house:
            h_upper = house.upper().strip()
            filtered = [c for c in filtered if str(c.get("house", "")).upper().strip() == h_upper]
        if state:
            st_norm = normalize_text(state)
            filtered = [c for c in filtered if st_norm in normalize_text(c.get("state", ""))]

        if len(filtered) == 1:
            return filtered[0], []

        return None, filtered if filtered else candidate_records