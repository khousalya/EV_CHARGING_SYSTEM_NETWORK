// server.js
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json());

// UPDATE these credentials to match your local MySQL
const db = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'sql@123', // replace
  database: 'ev_charging_station_network', // replace if needed
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Helper: run query with Promise
function q(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });
}

/* --- Generic endpoints for tables --- 
   We expose: GET /api/<table>, GET /api/<table>/:id, POST /api/<table>, PUT /api/<table>/:id, DELETE /api/<table>/:id
   For tables with composite or different PKs, we'll treat id as primary numeric column name guessed.
   Note: you may need to adjust field lists for certain tables in production.
*/

const tables = [
  'user', 'user_payment', 'vehicle', 'charging_station',
  'station_facility', 'charger', 'maintenance',
  'charging_session', 'services', 'userinformation', 'uservehiclestation'
];

// Helper to safely get columns of a table
async function getColumns(table) {
  const results = await q(`SHOW COLUMNS FROM \`${table}\``);
  return results.map(r => r.Field);
}

// Bulk create generic routes for simple CRUD (works if primary key is single numeric PK named *_ID or id)
tables.forEach(table => {
  // GET all
  app.get(`/api/${table}`, async (req, res) => {
    try {
      const rows = await q(`SELECT * FROM \`${table}\``);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET by id (attempts to use first column as identifier)
  app.get(`/api/${table}/:id`, async (req, res) => {
    try {
      const cols = await getColumns(table);
      const pk = cols[0]; // naive but often User_ID etc.
      const rows = await q(`SELECT * FROM \`${table}\` WHERE \`${pk}\` = ?`, [req.params.id]);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // CREATE
  app.post(`/api/${table}`, async (req, res) => {
    try {
      const data = req.body;
      const cols = Object.keys(data);
      const placeholders = cols.map(_ => '?').join(', ');
      const sql = `INSERT INTO \`${table}\` (${cols.map(c => `\`${c}\``).join(', ')}) VALUES (${placeholders})`;
      const result = await q(sql, cols.map(c => data[c]));
      res.json({ ok: true, insertId: result.insertId });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // UPDATE (by first column)
  app.put(`/api/${table}/:id`, async (req, res) => {
    try {
      const data = req.body;
      const cols = Object.keys(data);
      const set = cols.map(c => `\`${c}\` = ?`).join(', ');
      const tableCols = await getColumns(table);
      const pk = tableCols[0];
      const sql = `UPDATE \`${table}\` SET ${set} WHERE \`${pk}\` = ?`;
      const params = cols.map(c => data[c]).concat([req.params.id]);
      const result = await q(sql, params);
      res.json({ ok: true, affectedRows: result.affectedRows });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE (by first column)
  app.delete(`/api/${table}/:id`, async (req, res) => {
    try {
      const tableCols = await getColumns(table);
      const pk = tableCols[0];
      const result = await q(`DELETE FROM \`${table}\` WHERE \`${pk}\` = ?`, [req.params.id]);
      res.json({ ok: true, affectedRows: result.affectedRows });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
});

/* --- Special endpoints for your stored PROC and FUNC and session-insert (trigger-aware) --- */

// Function: get_total_spent(uid)
app.get('/api/total_spent/:uid', async (req, res) => {
  try {
    const uid = req.params.uid;
    const rows = await q('SELECT get_total_spent(?) AS total', [uid]);
    res.json(rows[0] || { total: 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Procedure: get_user_history(uid) -> returns rows
app.get('/api/user_history/:uid', async (req, res) => {
  try {
    const uid = req.params.uid;
    // CALL returns an array where first element is resultset
    db.getConnection((err, conn) => {
      if (err) return res.status(500).json({ error: err.message });
      conn.query('CALL get_user_history(?)', [uid], (e, results) => {
        conn.release();
        if (e) return res.status(500).json({ error: e.message });
        res.json(results[0]); // first resultset
      });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Insert charging_session (trigger in DB will auto-calc Cost from Energy_Consumed)
app.post('/api/charging_session_insert', async (req, res) => {
  try {
    const { User_ID, Veh_ID, StartTime, EndTime, Energy_Consumed, Charger_ID } = req.body;
    const sql = `INSERT INTO charging_session (User_ID, Veh_ID, StartTime, EndTime, Energy_Consumed, Charger_ID)
                 VALUES (?, ?, ?, ?, ?, ?)`;
    const result = await q(sql, [User_ID, Veh_ID, StartTime, EndTime, Energy_Consumed, Charger_ID]);
    res.json({ ok: true, insertId: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* --- Helpful endpoint to get column names for a table (frontend will use this) --- */
app.get('/api/schema/:table', async (req, res) => {
  try {
    const table = req.params.table;
    const cols = await getColumns(table);
    res.json(cols);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
