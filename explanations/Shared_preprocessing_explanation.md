Shared Preprocessing Explanation:

This document explores the Shared Preprocessing pipeline (verbalized in this session), how it fits into the data architecture, what each function does, why it exists, and what problems we encountered and fixed.1. Overview: What Shared Preprocessing Does1

The shared preprocessing layer is the foundation of the MPL/XSBML architecture. It runs before every downstream model and feature because the raw CSVs are not clean enough to use directly.1

Responsibilities are:1
Ingest all raw CSV files from S3/pS3/local1
Handle border cases like non-ASCII headers1
Remove/nullify dummy and empty values1
Resolve entity keys for MPs, EXR, EXM, Vendors, and Clients1
Assemble canonical fact tables1
Validate tables before they are used downstream1
Export the cleaned/validated tables to intermediate S3/local1
In the architecture, this layer is responsible for the follow-on outputs:1
dim_mp: generic MP metadata and status1
dim_exr: status and non-null level lookup table used by most features1
fact_bill: the main transactional payment table1
fact_work: the canonical work/inventory fact table1
fact_remit: provides the base level authorization response1
master_vendor_map: linking the historical vendor string to Clean Vendor IDs1
master_client_map: providing mapping between client/SBU and Clean ID keys1
This layer exists because the architecture explicitly assumes that the downstream modules should not process any raw data. They should only consume validated, normalized, and resolved fact tables
