Feature 3: NLP-Driven Work Categorization & Category-Mismatch Detection recovers a usable, structured category taxonomy from the raw, free-text `Work Description` fields.Because over 97%
of the dataset's declared `Work Category` values are unhelpfully logged as "Normal/Others," this feature uses a multilingual
AI pipeline (Sentence Transformers + UMAP + HDBSCAN + LightGBM) to automatically assign every project to one of 11 distinct
physical infrastructure categories (e.g., *Roads*, *Drinking Water*, *Schools*), leaving ambiguous projects as
*Unclassified*.

How does it analyze risk?1

It detects risk through Category-Mismatch Detection. The pipeline compares the AI-derived category (category_nlp) against the original declared category (category_raw). If the model confidently predicts a work is a “Road,” but the official record filed it under “Trust and Society” or “Repair and Renovation,” it raises a category_mismatch_flag. This surfaces potential clerical errors, deliberate miscoding, or attempts to obscure the true nature of an asset.3. How does it contribute to other features?1

Feature 3 is a foundational prerequisite for the entire ML architecture.

Feature 1 (Disbursement Shortfall) & Feature 2 (Cost Benchmarking): Both rely on comparing a project’s cost and progress against its “peers.” Without Feature 3's category_nlp, these models couldn't compare a road to other roads; they would be forced to compare it to the national average of all generic “Normal/Others” projects, completely invalidating the statistical baselines.

Feature 4 (Duplicate Work Detection): Directly reuses the dense text embeddings generated in this feature to calculate cosine similarity and flag duplicate billing or structuring.

The 11 distinct physical infrastructure categories were meant to be field expert input providing the "Human in loop" we 
needed but as it is not possible in this timeframe i have resided to predefine the categories ,this does effect practical
accuracy of risk analysis but it is the best option for now.

PROVISIONAL_CATEGORIES:

    "Road & Pathway Infrastructure":
        "prototype": "construction and repair of roads pathways paver blocks bridges culverts and approach roads",
        "keywords": ["road", "pathway", "paver", "culvert", "bridge", "cc road", "cement road"],

    "Street Lighting & Solar Energy":
        "prototype": "street lights solar lights high mast lights LED lights and public lighting",
        "keywords": ["light", "lighting", "solar", "led", "high mast", "street lamp"],
 
    "Drinking Water Infrastructure":
        "prototype": "drinking water supply hand pumps bore wells pipelines pumping machinery and water distribution",
        "keywords": ["drinking water", "water supply", "hand pump","borewell", "bore well", "pipeline", "pumping"],
   
    "Sanitation & Drainage":
        "prototype": "drainage sewer sanitation toilets and waste management infrastructure",
        "keywords": ["drain", "drainage", "sewer", "toilet", "sanitation", "waste"],
   
    "School & Education Infrastructure":
        "prototype": "school classroom education college library laboratory and educational infrastructure",
        "keywords": ["school", "classroom", "college", "library", "laboratory", "education"],
  
    "Healthcare & Ambulance Services":
        "prototype": "hospital health centre medical equipment ambulance and healthcare infrastructure",
        "keywords": ["hospital", "health", "medical", "ambulance", "clinic", "healthcare"],
   
    "Community & Public Buildings":
        "prototype": "community hall public building shelter office and civic infrastructure",
        "keywords": ["community hall", "community center", "building", "shelter", "public hall", "anganwadi"],
    
    "Agriculture & Irrigation": 
        "prototype": "irrigation agriculture farm water harvesting and rural agricultural infrastructure",
        "keywords": ["irrigation", "agriculture", "farm", "canal", "check dam", "harvesting"],
   
    "Sports & Recreation": 
        "prototype": "sports ground playground stadium and recreation facilities",
        "keywords": ["sport", "playground", "stadium", "gym", "recreation", "ground"],
    
    "Religious & Cultural Infrastructure":
        "prototype": "religious cultural heritage and public cultural facilities",
        "keywords": ["temple", "mandir", "mosque", "church", "cultural", "heritage"],
   
    "Other Public Infrastructure": 
        "prototype": "other eligible public infrastructure and civic works",
        "keywords": ["public", "civic", "infrastructure"],
  

