# Toastmaster Speech Evaluation Tool

EvalAssist is a web app that helps Toastmasters structure speech evaluations. The frontend uses draggable feedback buttons, and the prompt text is now stored in a MySQL database exposed through an Express API.

## Features

- Storyboard card interface with drag-and-drop buttons.
- Prompt statements loaded from MySQL instead of hardcoded frontend strings.
- API endpoints to fetch all prompt categories or one category at a time.
- Built-in Prompt Admin panel to edit category statements and save changes to MySQL.
- Seed script to quickly populate the database.

## Tech Stack

- Frontend: HTML, CSS, JavaScript, Vite
- Backend: Node.js, Express
- Database: MySQL

## Project Structure

project/
|
|- index.html
|- styles.css
|- app.js
|- server/
|  |- index.js
|  |- db.js
|  |- promptsSeedData.js
|  |- seed.js
|- sql/
|  |- init.sql
|- .env.example
|- package.json

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env` and update MySQL credentials.

3. Seed the database:

```bash
npm run seed
```

4. Start frontend + backend together:

```bash
npm run dev
```

Frontend runs on `http://localhost:5173` and backend runs on `http://localhost:3001`.

## Single-Service Deployment (Render)

This repo is configured for a single Render Web Service:

- Render builds the frontend with Vite.
- Express serves both API routes and the built frontend from `dist`.

### Option A: Blueprint (recommended)

1. Push this repo to GitHub.
2. In Render, choose **New +** -> **Blueprint**.
3. Select this repository.
4. Render will use `render.yaml`.

### Option B: Manual Web Service

Use these settings:

- **Runtime:** Node
- **Build Command:** `npm install && npm run build`
- **Start Command:** `npm start`

### Required Environment Variables

Set these in Render:

- `DB_HOST`
- `DB_PORT` (usually `3306`)
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`

`PORT` is injected by Render automatically.

### Database Initialization

Run schema creation and seed once against your production MySQL:

- Use `sql/init.sql` to create the table.
- Run `npm run seed` with production DB env vars configured.

### Health Check

After deploy, verify:

- `GET /api/health` returns `{ "ok": true }`.

## API Endpoints

- `GET /api/health` - checks database connectivity.
- `GET /api/prompts` - returns all categories and statements.
- `GET /api/prompts/:category` - returns statements for one category.
- `PUT /api/prompts/:category` - replaces all statements for one category.

## Notes

- The frontend calls `/api/prompts/:category` for each button click.
- The Prompt Admin panel in the main page can refresh, load, and save statements per category.
- Vite is configured to proxy `/api` requests to the backend during development.
- In production, Express serves `dist` and the API from the same origin.
