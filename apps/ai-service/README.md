# AI Service

## Setup

```sh
cd apps/ai-service
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## Run the app

```sh
uvicorn src.main:app --reload --port 8000
```

## Run tests

```sh
pytest
```
