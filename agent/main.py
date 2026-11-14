"""Entry point: `uvicorn main:app --reload --port 8000` from agent/ (or `npm run dev`)."""

import logging

from chief.api import create_app

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

app = create_app()
