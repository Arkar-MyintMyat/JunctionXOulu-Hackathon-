PY ?= python
MATCH ?=

.PHONY: setup data precompute facts stories export api web test

setup:
	$(PY) -m pip install -r requirements.txt
	cd web && npm install

data:
	$(PY) -m engine.loader

precompute:
	$(PY) -m engine.replay $(MATCH)

facts:
	$(PY) -m newsroom.factsheet --match $(MATCH)

stories:
	$(PY) -m newsroom.run --match $(MATCH)

export:
	$(PY) -m api.export

api:
	$(PY) -m uvicorn api.main:app --reload --port 8000

web:
	cd web && npm run dev

test:
	$(PY) -m pytest -q
