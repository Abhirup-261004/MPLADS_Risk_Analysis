# MPLADS source data

These CSV files are the version-controlled source data used by PRAHARI.

To load the full source set into MongoDB and rebuild the website's work data, run:

```bash
cd backend
npm run import:data -- --replace
```

The importer stores every CSV row in the `datasetrecords` collection. It also converts completed and recommended work records into the `works` collection used by the dashboard, works explorer, risk, map, AI analyst, and reports APIs.
