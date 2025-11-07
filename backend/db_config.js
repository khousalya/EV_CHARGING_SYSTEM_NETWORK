const mysql = require('mysql2');

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',       // your MySQL username
  password: 'your_password', // your MySQL password
  database: 'ev_charging_station_network'
});

db.connect(err => {
  if (err) throw err;
  console.log("✅ Connected to MySQL Database");
});

module.exports = db;
