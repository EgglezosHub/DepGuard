## Quick start

```bash
# Backend — terminal 1
cd backend
python -m venv .venv
source .venv/bin/activate          # macOS / Linux
# .venv\Scripts\activate           # Windows
pip install -e ".[dev]"
uvicorn app.main:app --reload      # http://127.0.0.1:8000/docs

# Frontend — terminal 2
cd frontend
npm install
npm run dev                        # http://localhost:5173
```
