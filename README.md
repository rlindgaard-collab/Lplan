# Læringsplan-assistent (MVP)

En simpel, selvhostet webapp der omdanner en læringsplan til 3 konkrete tiltag med OpenAI
og lader dig gemme valgte forslag i browserens Local Storage.

## Hurtig start

1) **Hent afhængigheder**
```bash
npm install
```

2) **Lav `.env` ud fra `.env.example`**
```bash
cp .env.example .env
# indsæt din OPENAI_API_KEY
```

3) **Kør**
```bash
npm run dev
```

4) Åbn: http://localhost:3000

## Funktioner

- Indsæt/pastet læringsplan (tekst)
- Generér 3 tiltag via `/api/generate` (Chat Completions med JSON-mode)
- Gem valgte tiltag (Local Storage). Eksportér/Importér som JSON

## Omkostningskontrol

- Per-IP **dagligt loft** via `express-rate-limit` (`DAILY_REQ_LIMIT` i `.env`)
- Sæt **projekt-loft** i OpenAI dashboardet for ekstra sikkerhed

## Model & API

Kører som standard `gpt-4o-mini`. Du kan ændre modellen via `OPENAI_MODEL`.
Endepunkt: `POST /api/generate` med body `{ planText: string }`.

## Deploy

- Kan køre hvor som helst, der kan køre Node.js (Render, Fly.io, Railway, Vercel (as serverless), m.fl.).
- Sørg for at sætte `OPENAI_API_KEY` som **hemmelighed** i din hosting.

## Licens

MIT
