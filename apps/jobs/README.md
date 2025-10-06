# Gridiron Edge ETL Jobs

Python ETL pipeline for data ingestion and processing.

## Tech Stack
- Python 3.11+
- SQLAlchemy for database operations
- Requests for API calls
- Pandas for data processing

## Development
```bash
pip install -r requirements.txt
python -m jobs.etl.main
```

## Deployment
Runs via GitHub Actions on schedule or Render/Fly cron jobs.
