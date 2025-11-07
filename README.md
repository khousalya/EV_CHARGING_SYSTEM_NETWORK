# EV_CHARGING_SYSTEM_NETWORK

A small web GUI and backend API for managing an EV charging station network. This repository contains a static frontend (HTML/CSS/JS) and a Node.js backend that exposes generic CRUD endpoints for database tables and a few custom endpoints for common operations.

## Contents

- `index.html`, `script.js`, `style.css` — simple frontend UI (static files) located at the repo root.
- `backend/` — Node.js backend that serves JSON APIs and connects to a MySQL database.
	- `server.js` — Express server exposing generic CRUD and special endpoints.
	- `db_config.js` — MySQL connection helper (update credentials as needed).

## Tech stack

- Frontend: plain HTML/CSS/JavaScript
- Backend: Node.js, Express
- Database: MySQL (the server expects a MySQL database named `ev_charging_station_network` by default)

## Features

- Generic CRUD endpoints for common tables (see `server.js` table list).
- Special endpoints:
	- `GET /api/total_spent/:uid` — returns total spent for a user (calls the DB function `get_total_spent`).
	- `GET /api/user_history/:uid` — returns a user's history (calls stored procedure `get_user_history`).
	- `POST /api/charging_session_insert` — convenience insert endpoint for `charging_session` (DB trigger can compute cost).
	- `GET /api/schema/:table` — returns column names for a table (useful for dynamic UIs).

## Prerequisites

- Node.js (v14+ recommended)
- npm (comes with Node.js)
- MySQL server

## Quick start (development)

1. Clone the repo and open the project folder.

2. Install dependencies for the backend:

```powershell
cd backend
npm install
```

3. Configure MySQL credentials:

- Update `backend/db_config.js` (or `backend/server.js` where the pool is created) with your MySQL username/password and database name. Example fields to update:
	- `host`, `user`, `password`, `database`

4. Create the database and tables.

This project assumes a MySQL database named `ev_charging_station_network` (or whatever you set in the config). There is no SQL schema file in this repo; import or create the schema you used when building the system (tables referenced in server code include: `user`, `user_payment`, `vehicle`, `charging_station`, `station_facility`, `charger`, `maintenance`, `charging_session`, `services`, `userinformation`, `uservehiclestation`).

Example to create an empty DB (you'll need to add the proper CREATE TABLE statements separately):

```sql
CREATE DATABASE ev_charging_station_network;
USE ev_charging_station_network;
-- Then create tables and stored procedures/functions used by the backend
```

5. Start the backend server:

```powershell
cd backend
npm start
```

The server listens on port 3000 by default. You should see "🚀 Server running on port 3000" in the console.

6. Open the frontend

- The frontend is static. Open `index.html` in a browser (double-click or use a simple static server). The UI expects the backend API at `http://localhost:3000`.

## API reference (high-level)

The backend implements generic REST-style endpoints for each table listed in `server.js`.

- GET /api/<table> — list all rows
- GET /api/<table>/:id — get row by primary id (server guesses first column as PK)
- POST /api/<table> — insert new row (JSON body)
- PUT /api/<table>/:id — update row by id (JSON body)
- DELETE /api/<table>/:id — delete row by id

Special endpoints:

- GET /api/total_spent/:uid
- GET /api/user_history/:uid
- POST /api/charging_session_insert
- GET /api/schema/:table

Notes:

- The generic CRUD handlers assume a simple primary-key pattern (the first column returned by `SHOW COLUMNS`). If your tables use composite keys or different PK names, adjust `server.js` or add table-specific routes.
- Some behavior depends on stored procedures, functions and/or triggers (e.g., `get_total_spent`, `get_user_history`, and any trigger that computes cost for charging sessions). Ensure those are created in the DB.

## Configuration & security

- Do not keep plaintext credentials in source for production. Use environment variables or a secrets manager.
- For small local testing, the credentials in `backend/db_config.js` or the pool config in `server.js` can be modified directly.

## Contributing

- Feel free to open issues or submit PRs. If you add a DB schema SQL file or seed data, include it under `backend/schema/` and update this README with instructions to import it.

## Troubleshooting

- `ECONNREFUSED` when connecting to MySQL: ensure MySQL is running and credentials in `db_config.js`/`server.js` are correct.
- `CALL get_user_history` or `SELECT get_total_spent` errors: make sure the corresponding stored procedure/function exists in the database.

## License

This project currently has no license file. Add a `LICENSE` if you want to open-source it under a specific license.

---
Contact: repository owner (khousalya)
