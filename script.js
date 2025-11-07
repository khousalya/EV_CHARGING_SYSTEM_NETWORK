// script.js - EV ChargeNet Dashboard SPA
const API = 'http://localhost:3000/api';

// auth state
let currentUserId = localStorage.getItem('ev_user_id') || null;

function setCurrentUser(id){
  currentUserId = Number(id);
  localStorage.setItem('ev_user_id', String(id));
}

function clearCurrentUser(){
  currentUserId = null; localStorage.removeItem('ev_user_id');
}

// View elements
const navItems = document.querySelectorAll('.nav li[data-view]');
const views = document.querySelectorAll('.view');

// debug helper: capture errors and show them on-page
function escapeHTML(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function showDebug(msg){
  let dbg = document.getElementById('debugConsole');
  if(!dbg){ dbg = document.createElement('div'); dbg.id = 'debugConsole'; document.body.appendChild(dbg); }
  dbg.classList.remove('hidden');
  dbg.innerHTML += `<div>${escapeHTML(msg)}</div>`;
}
window.addEventListener('error', (ev)=>{
  showDebug(`Error: ${ev.message} at ${ev.filename}:${ev.lineno}:${ev.colno}`);
});
window.addEventListener('unhandledrejection', (ev)=>{
  showDebug(`UnhandledRejection: ${ev.reason}`);
});

// Dashboard elements
const totalEnergyEl = document.getElementById('totalEnergy');
const totalCostEl = document.getElementById('totalCost');
const activeVehiclesEl = document.getElementById('activeVehicles');
const numSessionsEl = document.getElementById('numSessions');
const energyChartCanvas = document.getElementById('energyChart');
const energyChartCtx = energyChartCanvas ? energyChartCanvas.getContext('2d') : null;
let energyChart = null;
const recentSessionsTbody = document.querySelector('#recentSessionsTable tbody');

// Vehicles
const vehiclesList = document.getElementById('vehiclesList');

// Sessions view
const filterVehicle = document.getElementById('filterVehicle');
const applyFiltersBtn = document.getElementById('applyFilters');
const sessionsTable = document.getElementById('sessionsTable');

// Stations
const stationsGrid = document.getElementById('stationsGrid');

// Payments
const paymentSummary = document.getElementById('paymentSummary');

// Maintenance & facilities
const maintenanceTable = document.getElementById('maintenanceTable');
const facilitiesTable = document.getElementById('facilitiesTable');

// Profile
const profileForm = document.getElementById('profileForm');
const userNameEl = document.getElementById('userName');
const saveProfileBtn = document.getElementById('saveProfile');

// Modals
const modalReceipt = document.getElementById('modalReceipt');
const receiptBody = document.getElementById('receiptBody');

// Misc
const btnNewSession = document.getElementById('btnNewSession');
const appShell = document.querySelector('.app-shell');
const loginView = document.getElementById('view-login');

// login/signup elements
const btnLogin = document.getElementById('btnLogin');
const btnShowSignup = document.getElementById('btnShowSignup');
const signupArea = document.getElementById('signupArea');
const btnSignup = document.getElementById('btnSignup');
const btnCancelSignup = document.getElementById('btnCancelSignup');

// form fields
const loginEmail = document.getElementById('loginEmail');
const loginMessage = document.getElementById('loginMessage');

// helper to get current user id (throws if not set)
function requireUser(){ if(!currentUserId) throw new Error('Not authenticated'); return currentUserId; }

function showView(viewId) {
  views.forEach(v => v.classList.add('hidden'));
  const el = document.getElementById('view-' + viewId);
  if (el) el.classList.remove('hidden');
  // mark active nav
  navItems.forEach(n => n.classList.toggle('active', n.dataset.view === viewId));
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function loadDashboard() {
  try {
    const [sessions, vehicles, totalObj] = await Promise.all([
      fetchJson(`${API}/charging_session`),
      fetchJson(`${API}/vehicle`),
      fetchJson(`${API}/total_spent/${requireUser()}`)
    ]);

    // total energy across sessions for this user
  const userSessions = sessions.filter(s => +s.User_ID === +requireUser());
    const totalEnergy = userSessions.reduce((s, it) => s + (parseFloat(it.Energy_Consumed) || 0), 0);
    const totalCost = totalObj.total || 0;
    totalEnergyEl.textContent = totalEnergy.toFixed(2) + ' kWh';
    totalCostEl.textContent = '₹' + parseFloat(totalCost).toFixed(2);
  activeVehiclesEl.textContent = vehicles.filter(v => +v.User_ID === +requireUser()).map(v => v.Model).join(', ') || '—';
    numSessionsEl.textContent = userSessions.length;

  // recent sessions table
  if (recentSessionsTbody) recentSessionsTbody.innerHTML = '';
    const recent = userSessions.sort((a,b)=> new Date(b.StartTime) - new Date(a.StartTime)).slice(0,6);
    recent.forEach(s => {
      const tr = document.createElement('tr');
      const dt = new Date(s.StartTime).toLocaleString();
      tr.innerHTML = `<td>${dt}</td><td>${s.Veh_ID}</td><td>${s.Charger_ID}</td><td>${s.Energy_Consumed}</td><td>₹${s.Cost}</td>`;
      recentSessionsTbody.appendChild(tr);
    });

    // build chart: energy per session (last 8)
    const labels = recent.map(s => new Date(s.StartTime).toLocaleDateString());
    const data = recent.map(s => parseFloat(s.Energy_Consumed) || 0);
  if (energyChart) energyChart.destroy();
    if (energyChartCtx && typeof Chart !== 'undefined') {
      energyChart = new Chart(energyChartCtx, {
      type: 'bar',
      data: { labels, datasets:[{ label:'Energy (kWh)', data, backgroundColor: 'rgba(33,136,56,0.8)'}] },
      options: { responsive:true, plugins:{legend:{display:false}} }
      });
    } else {
      console.warn('Chart.js not available or canvas missing');
    }
  } catch (err) {
    console.error('loadDashboard', err);
    showDebug('loadDashboard error: ' + (err && err.message ? err.message : String(err)));
  }
}

async function loadVehicles() {
  try {
    const vehicles = await fetchJson(`${API}/vehicle`);
    vehiclesList.innerHTML = '';
  vehicles.filter(v => +v.User_ID === +requireUser()).forEach(v => {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `<div style="font-weight:700">${v.Model}</div>
                        <div style="color:var(--muted)">Type: ${v.Type} | Battery: ${v.Battery_Capacity}</div>
                        <div style="margin-top:8px"><button data-edit='${v.Veh_ID}'>Edit Vehicle Info</button></div>`;
      vehiclesList.appendChild(card);
      const btn = card.querySelector('button');
      btn.onclick = () => {
        const newModel = prompt('Model', v.Model);
        if (!newModel) return;
        fetch(`${API}/vehicle/${v.Veh_ID}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({...v, Model: newModel}) })
          .then(r=>r.json()).then(() => loadVehicles());
      };
    });
  } catch (err) { console.error(err); }
}

async function loadSessions() {
  try {
    const sessions = await fetchJson(`${API}/charging_session`);
    const vehicles = await fetchJson(`${API}/vehicle`);
    // restrict vehicles dropdown and sessions to the current signed-in user
    const uid = requireUser();
    const myVehicles = vehicles.filter(v => String(v.User_ID) === String(uid));
    filterVehicle.innerHTML = '<option value="">All</option>' + myVehicles.map(v=>`<option value="${v.Veh_ID}">${(v.Model||'').trim()} — ${v.Veh_ID}</option>`).join('');

    // apply filters
    // start with only this user's sessions
    let filtered = sessions.filter(s => String(s.User_ID) === String(uid));
    if (filterVehicle.value) {
      // filter by selected vehicle id (option value = Veh_ID)
      const selVehId = String(filterVehicle.value);
      filtered = filtered.filter(s => String(s.Veh_ID) === selVehId);
    }
  // date filters removed — sessions already restricted to current user and optional vehicle

    // render table
    const cols = ['Session_ID','StartTime','EndTime','Energy_Consumed','Cost','Charger_ID','Veh_ID','User_ID'];
    sessionsTable.querySelector('thead').innerHTML = '<tr>' + cols.map(c=>`<th>${c}</th>`).join('') + '<th></th></tr>';
    const tbody = sessionsTable.querySelector('tbody'); tbody.innerHTML = '';
    filtered.forEach(s=>{
      const tr = document.createElement('tr');
      tr.innerHTML = cols.map(c=>`<td>${s[c]===null? '': s[c]}</td>`).join('') + `<td><button data-id='${s.Session_ID}'>View Receipt</button></td>`;
      tbody.appendChild(tr);
      tr.querySelector('button').onclick = ()=> showReceipt(s);
    });
  } catch (err) { console.error(err); }
}

function showReceipt(s) {
  receiptBody.innerHTML = `<h3>Session ${s.Session_ID}</h3><pre>${JSON.stringify(s,null,2)}</pre>`;
  modalReceipt.classList.remove('hidden');
}

async function loadStations() {
  try {
    const [stations, chargers, facilities] = await Promise.all([
      fetchJson(`${API}/charging_station`),
      fetchJson(`${API}/charger`),
      fetchJson(`${API}/station_facility`)
    ]);
    stationsGrid.innerHTML = '';
    stations.forEach(st => {
      const chs = chargers.filter(c=>+c.Station_ID===+st.Station_ID).map(c=>`${c.Charger_Type} (${c.Power_Rating})`).join(', ');
      const fac = facilities.find(f=>+f.Station_ID===+st.Station_ID) || {};
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `<div style="font-weight:700">${st.Station_Name}</div>
                        <div style="color:var(--muted)">${st.Address}, ${st.City}</div>
                        <div style="margin-top:8px">⚡ ${chs}</div>
                        <div style="margin-top:8px">${fac.Parking? '🅿️ Parking':''} ${fac.Cafe? '☕ Cafe':''} ${fac.Restroom? '🚻 Restroom':''} ${fac.Wifi? '📶 Wifi':''}</div>`;
      stationsGrid.appendChild(card);
    });
  } catch (err) { console.error(err); }
}

async function loadPayments() {
  try {
    const payments = await fetchJson(`${API}/user_payment`);
  const myPayment = payments.find(p=>+p.User_ID===+requireUser()) || {};
  const total = await fetchJson(`${API}/total_spent/${requireUser()}`);

    // header card with preference and total
    // normalize payment flags (DB may return 0/1, '0'/'1', true/false)
    const cashFlag = (myPayment.Cash === 1 || myPayment.Cash === '1' || myPayment.Cash === true || myPayment.Cash === 'true');
    const onlineFlag = (myPayment.Online === 1 || myPayment.Online === '1' || myPayment.Online === true || myPayment.Online === 'true');
    // ensure mutual exclusivity for display: if cash is set, show cash tick and online cross; if online set, show online tick
    const showCash = cashFlag ? true : (onlineFlag ? false : false);
    const showOnline = onlineFlag ? true : (cashFlag ? false : false);
    let html = `<div class='card'><div class='card-title'>Payment Preferences</div>
      <div>Cash: ${showCash? '✅':'❌'} | Online: ${showOnline? '✅':'❌'}</div>
      <div style='margin-top:8px'>Total Spent: ₹${parseFloat(total.total||0).toFixed(2)}</div></div>`;

    // Also show per-session breakdown (reads charging_session table for this user)
    try{
      const sessions = await fetchJson(`${API}/charging_session`);
      const uid = requireUser();
      const mySessions = sessions.filter(s => String(s.User_ID) === String(uid)).sort((a,b)=> new Date(b.StartTime)-new Date(a.StartTime));
      html += `<div class='card' style='margin-top:12px'><div class='card-title'>Per-session payments</div>`;
      if(mySessions.length===0){
        html += `<div>No sessions yet</div>`;
      } else {
  html += `<table class='table'><thead><tr><th>Session</th><th>Date</th><th>Vehicle</th><th>Energy (kWh)</th><th>Cost (₹)</th></tr></thead><tbody>`;
        mySessions.forEach(s=>{
          const dt = new Date(s.StartTime).toLocaleString();
          html += `<tr><td>${s.Session_ID}</td><td>${dt}</td><td>${s.Veh_ID}</td><td>${s.Energy_Consumed}</td><td>₹${s.Cost}</td></tr>`;
        });
        html += `</tbody></table>`;
      }
      html += `</div>`;
    } catch(e){
      showDebug('Failed to load sessions for payments view: ' + (e && e.message? e.message: String(e)));
    }

    paymentSummary.innerHTML = html;
  } catch (err) { console.error(err); }
}

async function loadMaintenance() {
  try {
    const maintenance = await fetchJson(`${API}/maintenance`);
    const services = await fetchJson(`${API}/services`);
    maintenanceTable.querySelector('thead').innerHTML = '<tr><th>Main_ID</th><th>Duration</th><th>Cost</th><th>Date</th><th>Charger_ID</th><th>Contact</th></tr>';
    const tbody = maintenanceTable.querySelector('tbody'); tbody.innerHTML = '';
    maintenance.forEach(m=>{
      const svc = services.find(s=>+s.Main_ID===+m.Main_ID);
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${m.Main_ID}</td><td>${m.Duration}</td><td>₹${m.Cost}</td><td>${m.Main_Date}</td><td>${m.Charge_ID}</td><td>${svc?svc.Contact_No:''}</td>`;
      tbody.appendChild(tr);
    });
  } catch (err) { console.error(err); }
}

async function loadFacilities() {
  try {
    const facilities = await fetchJson(`${API}/station_facility`);
    facilitiesTable.querySelector('thead').innerHTML = '<tr><th>Station_ID</th><th>Parking</th><th>Wifi</th><th>Cafe</th><th>Restroom</th></tr>';
    const tbody = facilitiesTable.querySelector('tbody'); tbody.innerHTML = '';
    facilities.forEach(f=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${f.Station_ID}</td><td>${f.Parking? '✅':'❌'}</td><td>${f.Wifi? '✅':'❌'}</td><td>${f.Cafe? '✅':'❌'}</td><td>${f.Restroom? '✅':'❌'}</td>`;
      tbody.appendChild(tr);
    });
  } catch (err) { console.error(err); }
}

async function loadProfile() {
  try {
  const user = (await fetchJson(`${API}/user/${requireUser()}`))[0];
    userNameEl.textContent = user.Name;
    profileForm.innerHTML = `
      <label>Name <input name='Name' value='${user.Name||''}'></label>
      <label>Email <input name='Email' value='${user.Email||''}'></label>
      <label>Phone <input name='Phone' value='${user.Phone||''}'></label>
      <label>Street <input name='Street' value='${user.Street||''}'></label>
      <label>City <input name='City' value='${user.City||''}'></label>
      <label>PinCode <input name='PinCode' value='${user.PinCode||''}'></label>
      <label>DOB <input name='DOB' value='${user.DOB||''}' type='date'></label>
    `;
    saveProfileBtn.onclick = async () => {
      try {
        // gather inputs from the generated form to ensure names/values are captured
        const inputs = profileForm.querySelectorAll('input');
        const obj = {};
        inputs.forEach(i => { if (i.name) obj[i.name] = i.value; });
        saveProfileBtn.disabled = true;
        const res = await fetch(`${API}/user/${requireUser()}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(obj) });
        const j = await res.json();
        if (res.ok && j && j.ok) {
          // update UI and reload profile
          alert('Profile saved');
          if (obj.Name) userNameEl.textContent = obj.Name;
          await loadProfile();
        } else {
          const msg = (j && j.error) ? j.error : (j && j.message) ? j.message : 'Unknown error';
          showDebug('saveProfile failed: ' + msg);
          alert('Save failed: ' + msg);
        }
      } catch (err) {
        showDebug('saveProfile exception: ' + (err && err.message ? err.message : String(err)));
        alert('Save failed: ' + (err && err.message ? err.message : String(err)));
      } finally {
        saveProfileBtn.disabled = false;
      }
    };
  } catch (err) { console.error(err); }
}

// attach nav handlers
navItems.forEach(n=> n.addEventListener('click', ()=>{
  const v = n.dataset.view; showView(v);
  // load view data
  if (v==='dashboard') loadDashboard();
  if (v==='vehicles') loadVehicles();
  if (v==='sessions') loadSessions();
  if (v==='stations') loadStations();
  if (v==='payments') loadPayments();
  if (v==='maintenance') loadMaintenance();
  if (v==='facilities') loadFacilities();
  if (v==='profile') loadProfile();
}));

// logout handler (nav item with data-action)
document.querySelectorAll('.nav li[data-action]').forEach(li=> li.addEventListener('click', ()=>{
  const action = li.dataset.action;
  if(action==='logout'){
    clearCurrentUser();
    // show login view
    appShell.classList.add('hidden');
    loginView.classList.remove('hidden');
  }
}));

// modal close
document.querySelectorAll('[data-close]').forEach(b=> b.onclick = ()=> document.querySelectorAll('.modal').forEach(m=>m.classList.add('hidden')));
modalReceipt.onclick = (e)=> { if (e.target===modalReceipt) modalReceipt.classList.add('hidden'); };

// close modals with Escape key for convenience
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
  }
});

applyFiltersBtn && (applyFiltersBtn.onclick = loadSessions);

btnNewSession && (btnNewSession.onclick = async ()=>{
  // simple prompt-based create with payment choice
  try {
    // fetch current user's vehicles and force a valid selection to avoid FK errors
    const allVehicles = await fetchJson(`${API}/vehicle`);
    const uid = requireUser();
    const myVehicles = allVehicles.filter(v => String(v.User_ID) === String(uid));
    if (!myVehicles || myVehicles.length === 0) {
      alert('No vehicles found for your account. Please add a vehicle first in My Vehicles.');
      return;
    }
    const vehOptions = myVehicles.map(v => `${v.Veh_ID}: ${v.Model}`).join('\n');
    const veh = prompt('Choose Vehicle ID from the list (enter the numeric ID):\n' + vehOptions, String(myVehicles[0].Veh_ID));
    if (!veh) return;
    // validate selected vehicle belongs to user
    if (!myVehicles.find(v => String(v.Veh_ID) === String(veh))) {
      alert('Invalid vehicle selected. Please use the Vehicle ID shown in My Vehicles.');
      return;
    }
    const charger = prompt('Charger ID (e.g. 1)'); if (!charger) return;
    const energy = prompt('Energy consumed (kWh)'); if (!energy) return;

    // ask for payment method
    let pay = prompt('Payment method (cash / online)').trim().toLowerCase();
    if (!pay) pay = 'cash';
    if (pay !== 'cash' && pay !== 'online') {
      alert('Invalid payment method. Choose either "cash" or "online".');
      return;
    }

    const start = new Date().toISOString().slice(0,19).replace('T',' ');
    const end = start; // quick demo
  const payload = { User_ID: uid, Veh_ID: Number(veh), StartTime: start, EndTime: end, Energy_Consumed: Number(energy), Charger_ID: Number(charger) };
    const res = await fetch(`${API}/charging_session_insert`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    const j = await res.json();
    if (res.ok && j && j.ok) {
      // update or create user_payment record to reflect last-used payment method
      try {
        const payments = await fetchJson(`${API}/user_payment`);
        const uid = requireUser();
        const my = payments.find(p => String(p.User_ID) === String(uid));
        if (my) {
          // find primary key name of the payment row
          const pk = Object.keys(my)[0];
          const payload2 = Object.assign({}, my, { Cash: pay === 'cash' ? 1 : 0, Online: pay === 'online' ? 1 : 0 });
          await fetch(`${API}/user_payment/${my[pk]}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload2) });
        } else {
          await fetch(`${API}/user_payment`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ User_ID: uid, Cash: pay === 'cash' ? 1 : 0, Online: pay === 'online' ? 1 : 0 }) });
        }
      } catch (e) {
        showDebug('user_payment update failed: ' + (e && e.message ? e.message : String(e)));
      }

      // persist per-session payment mapping in localStorage so Payment Summary can display it
      try {
        const map = JSON.parse(localStorage.getItem('ev_session_payments') || '{}');
        if (j.insertId) map[String(j.insertId)] = pay;
        localStorage.setItem('ev_session_payments', JSON.stringify(map));
      } catch(e) { showDebug('persist session payment failed: ' + (e && e.message? e.message: String(e))); }

      alert('Session created'); loadDashboard();
      // if the user is currently viewing payments, refresh that view so the row shows right away
      const paymentsView = document.getElementById('view-payments');
      if (paymentsView && !paymentsView.classList.contains('hidden')) {
        loadPayments();
      }
    } else {
      const msg = (j && j.error) ? j.error : (j && j.message) ? j.message : 'Unknown error';
      alert('Create session failed: ' + msg);
      showDebug('create session failed: ' + msg);
    }
  } catch (err) {
    showDebug('new session exception: ' + (err && err.message ? err.message : String(err)));
    alert('Failed to create session: ' + (err && err.message ? err.message : String(err)));
  }
});

// login/signup wiring
btnShowSignup && btnShowSignup.addEventListener('click', ()=>{ signupArea.classList.remove('hidden'); });
btnCancelSignup && btnCancelSignup.addEventListener('click', ()=>{ signupArea.classList.add('hidden'); });

btnLogin && btnLogin.addEventListener('click', async ()=>{
  const email = (loginEmail && loginEmail.value || '').trim();
  if(!email) return loginMessage.textContent = 'Enter email to login';
  try{
    const users = await fetchJson(`${API}/user`);
    const found = users.find(u => String(u.Email||'').toLowerCase() === email.toLowerCase());
    if(found){
      setCurrentUser(found.User_ID);
      loginMessage.textContent = `Signed in as ${found.Name}`;
      // show app
      loginView.classList.add('hidden');
      appShell.classList.remove('hidden');
      userNameEl.textContent = found.Name;
      showView('dashboard'); loadDashboard();
    } else {
      loginMessage.textContent = 'No user found with that email. Click Create account to sign up.';
    }
  } catch(err){ showDebug('login error: '+err.message); }
});

btnSignup && btnSignup.addEventListener('click', async ()=>{
  const name = document.getElementById('suName').value.trim();
  const email = document.getElementById('suEmail').value.trim();
  if(!name || !email) return alert('Name and Email required');
  const phone = document.getElementById('suPhone').value.trim();
  const street = document.getElementById('suStreet').value.trim();
  const city = document.getElementById('suCity').value.trim();
  const pin = document.getElementById('suPin').value.trim();
  const dob = document.getElementById('suDob').value || null;
  try{
    const ures = await fetch(`${API}/user`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ Name:name, Email:email, Phone:phone, Street:street, City:city, PinCode:pin, DOB:dob }) });
    const uj = await ures.json();
    if(!uj.ok) throw new Error(uj.error||'Create user failed');
    const newId = uj.insertId;
    // optional vehicle
    const vModel = document.getElementById('svModel').value.trim();
    if(vModel){
      const vType = document.getElementById('svType').value.trim();
      const vBat = document.getElementById('svBattery').value.trim();
      await fetch(`${API}/vehicle`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ Model:vModel, Type:vType || '', Battery_Capacity:vBat || '', User_ID:newId }) });
    }
    setCurrentUser(newId);
  // update UI immediately with the new user's name
  userNameEl.textContent = name;
  alert('Account created — signed in');
    loginView.classList.add('hidden'); appShell.classList.remove('hidden');
    showView('dashboard'); loadDashboard();
  } catch(err){ showDebug('signup error: '+err.message); alert('Signup failed: '+err.message); }
});

// initial: if logged in, show app, otherwise show login
window.addEventListener('load', async ()=>{
  if(currentUserId){
    // fetch user name
    try{ const u = (await fetchJson(`${API}/user/${currentUserId}`))[0]; if(u) userNameEl.textContent = u.Name; }catch(e){}
    loginView.classList.add('hidden'); appShell.classList.remove('hidden'); showView('dashboard'); loadDashboard();
  } else {
    // show login
    loginView.classList.remove('hidden'); appShell.classList.add('hidden');
  }
});
