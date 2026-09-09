import logging
import json
import math
import re
import joblib
import numpy as np
import pandas as pd
from pathlib import Path
from typing import Dict, Any, Optional, List, Tuple
from mplads_api.config import settings

logger = logging.getLogger("mplads_api.feature_store")

def sanitize_record(record: Dict[str, Any]) -> Dict[str, Any]:
    """Clean NaN, Inf, and numpy types for Pydantic JSON compliance."""
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
    """Normalize string by stripping whitespace and non-alphanumeric characters."""
    if not text:
        return ""
    return re.sub(r"[^A-Z0-9]", "", str(text).upper().strip())

class FeatureStore:
    _instance = None

    def __init__(self):
        self.fact_work: Optional[pd.DataFrame] = None
        self.mp_scorecard: Optional[pd.DataFrame] = None
        self.vendor_risk: Optional[pd.DataFrame] = None
        
        # Model Binaries
        self.nlp_classifier: Optional[Any] = None
        self.nlp_taxonomy: Optional[Dict[str, Any]] = None
        self.f1_iforest: Optional[Any] = None
        self.f2_lof: Optional[Any] = None
        self.f5_iforest: Optional[Any] = None
        self.f7_kmeans: Optional[Any] = None
        self.f7_iforest: Optional[Any] = None
        
        # In-Memory Fast Lookup Indexes
        self.work_index: Dict[str, Dict[str, Any]] = {}
        self.mp_index: Dict[str, Dict[str, Any]] = {}
        self.vendor_index: Dict[str, Dict[str, Any]] = {}
        self.state_index: Dict[str, Dict[str, Any]] = {}

        # Name Resolution Indexes
        self.name_to_keys_index: Dict[str, List[str]] = {}
        self.normalized_key_index: Dict[str, str] = {}

    @classmethod
    def get_instance(cls) -> "FeatureStore":
        if cls._instance is None:
            cls._instance = FeatureStore()
        return cls._instance

    def load_all(self):
        logger.info("--- Initializing FeatureStore & Model Registry ---")

        # 1. Load Feature 1 Work Disbursement Risk Table
        f1_path = settings.FEATURE1_ARTIFACT_DIR / "feature1_fact_work_disbursement_risk.parquet"
        if not f1_path.exists():
            f1_path = settings.SHARED_ARTIFACT_DIR / "fact_work_feature7.parquet"
            
        if f1_path.exists():
            logger.info("Loading Feature 1 work table from %s", f1_path)
            f1_df = pd.read_parquet(f1_path) if str(f1_path).endswith(".parquet") else pd.read_csv(f1_path, low_memory=False)
            for row_dict in f1_df.to_dict(orient="records"):
                clean_dict = sanitize_record(row_dict)
                w_id = str(clean_dict.get("work_id", ""))
                w_key = str(clean_dict.get("work_key", ""))
                if w_id and w_id != "None":
                    self.work_index[w_id] = clean_dict
                if w_key and w_key != "None":
                    self.work_index[w_key] = clean_dict

        # 2. Merge Feature 2 Work Cost Risk Data
        f2_path = settings.FEATURE2_ARTIFACT_DIR / "feature2_fact_work_cost_risk.parquet"
        if f2_path.exists():
            logger.info("Merging Feature 2 work table from %s", f2_path)
            f2_df = pd.read_parquet(f2_path) if str(f2_path).endswith(".parquet") else pd.read_csv(f2_path, low_memory=False)
            for row_dict in f2_df.to_dict(orient="records"):
                clean_dict = sanitize_record(row_dict)
                w_id = str(clean_dict.get("work_id", ""))
                w_key = str(clean_dict.get("work_key", ""))
                target_keys = [k for k in [w_id, w_key] if k and k != "None"]
                for k in target_keys:
                    if k in self.work_index:
                        self.work_index[k].update(clean_dict)
                    else:
                        self.work_index[k] = clean_dict

        logger.info("Indexed %d combined work records.", len(self.work_index))

        # 3. Load Feature 7 MP Master Scorecard
        mp_path = settings.FEATURE7_ARTIFACT_DIR / "feature7_mp_composite_risk.parquet"
        if not mp_path.exists():
            mp_path = settings.FEATURE7_ARTIFACT_DIR / "feature7_mp_composite_risk.csv"

        if mp_path.exists():
            logger.info("Loading MP composite scorecard from %s", mp_path)
            self.mp_scorecard = pd.read_parquet(mp_path) if str(mp_path).endswith(".parquet") else pd.read_csv(mp_path, low_memory=False)
            for row_dict in self.mp_scorecard.to_dict(orient="records"):
                clean_dict = sanitize_record(row_dict)
                mp_k = str(clean_dict.get("mp_key", ""))
                mp_name = str(clean_dict.get("mp_name_clean", ""))

                if mp_k and mp_k != "None":
                    self.mp_index[mp_k] = clean_dict

                    # Index normalized key
                    norm_k = normalize_text(mp_k)
                    if norm_k:
                        self.normalized_key_index[norm_k] = mp_k

                    # Index clean name
                    norm_name = normalize_text(mp_name)
                    if norm_name:
                        if norm_name not in self.name_to_keys_index:
                            self.name_to_keys_index[norm_name] = []
                        if mp_k not in self.name_to_keys_index[norm_name]:
                            self.name_to_keys_index[norm_name].append(mp_k)

            logger.info("Indexed %d MP composite scorecards (%d clean names).", len(self.mp_index), len(self.name_to_keys_index))

            # Build State Rollup Index from MP Scorecard
            state_groups = self.mp_scorecard.groupby("state")
            for state_name, group in state_groups:
                st_str = str(state_name).upper().strip()
                self.state_index[st_str] = {
                    "state": str(state_name),
                    "mp_count": int(len(group)),
                    "mean_composite_risk_score": float(group["ml_augmented_composite_risk_score"].mean()) if "ml_augmented_composite_risk_score" in group else float(group["composite_risk_score"].mean()),
                    "mean_allocation_utilization_pct": float(group["allocation_utilization_pct"].mean()),
                    "critical_mp_count": int((group["ml_augmented_risk_tier"] == "Critical").sum()) if "ml_augmented_risk_tier" in group else int((group["composite_risk_tier"] == "Critical").sum()),
                    "high_mp_count": int((group["ml_augmented_risk_tier"] == "High").sum()) if "ml_augmented_risk_tier" in group else int((group["composite_risk_tier"] == "High").sum()),
                    "medium_mp_count": int((group["ml_augmented_risk_tier"] == "Medium").sum()) if "ml_augmented_risk_tier" in group else int((group["composite_risk_tier"] == "Medium").sum()),
                    "low_mp_count": int((group["ml_augmented_risk_tier"] == "Low").sum()) if "ml_augmented_risk_tier" in group else int((group["composite_risk_tier"] == "Low").sum()),
                }

        # 4. Load Feature 5 Vendor Master Table
        vendor_path = settings.FEATURE5_ARTIFACT_DIR / "feature5_vendor_risk.parquet"
        if not vendor_path.exists():
            vendor_path = settings.FEATURE5_ARTIFACT_DIR / "feature5_vendor_risk.csv"

        if vendor_path.exists():
            logger.info("Loading vendor risk table from %s", vendor_path)
            self.vendor_risk = pd.read_parquet(vendor_path) if str(vendor_path).endswith(".parquet") else pd.read_csv(vendor_path, low_memory=False)
            for row_dict in self.vendor_risk.to_dict(orient="records"):
                clean_dict = sanitize_record(row_dict)
                v_id = str(clean_dict.get("vendor_id", ""))
                if v_id and v_id != "None":
                    self.vendor_index[v_id] = clean_dict

            logger.info("Indexed %d vendor risk records.", len(self.vendor_index))

        # 5. Load Trained Model Binaries (.joblib)
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

        # Load additional .joblib model binaries for audit/verification
        f1_m = settings.FEATURE1_ARTIFACT_DIR / "feature1_isolation_forest.joblib"
        if f1_m.exists():
            self.f1_iforest = joblib.load(f1_m)

        f2_m = settings.FEATURE2_ARTIFACT_DIR / "feature2_lof_model.joblib"
        if f2_m.exists():
            self.f2_lof = joblib.load(f2_m)

        f5_m = settings.FEATURE5_ARTIFACT_DIR / "feature5_isolation_forest.joblib"
        if f5_m.exists():
            self.f5_iforest = joblib.load(f5_m)

        f7_k = settings.FEATURE7_ARTIFACT_DIR / "feature7_kmeans_model.joblib"
        if f7_k.exists():
            self.f7_kmeans = joblib.load(f7_k)

        f7_i = settings.FEATURE7_ARTIFACT_DIR / "feature7_iforest_model.joblib"
        if f7_i.exists():
            self.f7_iforest = joblib.load(f7_i)

        logger.info("--- FeatureStore Load Complete ---")

    def resolve_mp(self, identifier: str, house: Optional[str] = None, state: Optional[str] = None) -> Tuple[Optional[Dict[str, Any]], List[Dict[str, Any]]]:
        """
        Resolves an MP identifier (plain name, key, or partial string) to a single record or returns candidate matches.
        Returns:
            (single_matching_record, candidate_records_list)
        """
        if not identifier or not identifier.strip():
            return None, []

        raw_input = identifier.strip()
        norm_input = normalize_text(raw_input)

        # Tier 1: Exact key match
        if raw_input in self.mp_index:
            return self.mp_index[raw_input], []

        # Tier 2: Normalized key match (e.g. "RSKARTIKEYASHARMA" or "RS_KARTIKEYA_SHARMA")
        if norm_input in self.normalized_key_index:
            canonical_key = self.normalized_key_index[norm_input]
            return self.mp_index[canonical_key], []

        # Tier 3: Handle user prefixing house (e.g., "RS Kartikeya Sharma" or "LS-Kriti Devi")
        if norm_input.startswith("LS") or norm_input.startswith("RS"):
            prefix = norm_input[:2]
            rest = norm_input[2:]
            if rest in self.name_to_keys_index:
                for k in self.name_to_keys_index[rest]:
                    if k.startswith(prefix + "_"):
                        return self.mp_index[k], []

        # Tier 4: Exact Clean Name Match
        candidate_keys = list(self.name_to_keys_index.get(norm_input, []))

        # Tier 5: Substring / Partial Name Search if clean name match yielded no candidates
        if not candidate_keys:
            for norm_name, keys in self.name_to_keys_index.items():
                if norm_input in norm_name or norm_name in norm_input:
                    candidate_keys.extend(keys)

        # Deduplicate candidate keys while preserving order
        candidate_keys = list(dict.fromkeys(candidate_keys))

        if not candidate_keys:
            return None, []

        # Build list of candidate record dicts
        candidate_records = [self.mp_index[k] for k in candidate_keys if k in self.mp_index]

        # Filter candidates by house / state if supplied in query parameters
        filtered = candidate_records
        if house:
            h_upper = house.upper().strip()
            filtered = [c for c in filtered if str(c.get("house", "")).upper().strip() == h_upper]
        if state:
            st_norm = normalize_text(state)
            filtered = [c for c in filtered if st_norm in normalize_text(c.get("state", ""))]

        # If filtering produces exactly 1 unambiguous match
        if len(filtered) == 1:
            return filtered[0], []

        # If multiple candidates remain or filter returned 0, return candidate list
        return None, filtered if filtered else candidate_records
