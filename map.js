let map;
let directionsService;
let directionsRenderer;
let schedule = [];
let stops = [];

function initMap() {
  map = new google.maps.Map(document.getElementById("map"), {
    zoom: 12,
    center: { lat: 37.7749, lng: -122.4194 },
  });

  directionsService = new google.maps.DirectionsService();
  directionsRenderer = new google.maps.DirectionsRenderer();
  directionsRenderer.setMap(map);

  const addrInput = document.getElementById("address-input");
  if (addrInput) {
    new google.maps.places.Autocomplete(addrInput);
  }

  enableDragReorder();
  const savedSchedule = sessionStorage.getItem("schedule_data");
  const savedStops = sessionStorage.getItem("stops_data");

  if (savedSchedule && savedStops) {
  try {
    schedule = JSON.parse(savedSchedule);
    stops = JSON.parse(savedStops);
    updateScheduleTable();  // re-render table
  } catch (e) {
    console.error("Error parsing session data:", e);
  }
}
if (stops.length >= 2) {
  calculateRoute();  
}


  importAISchedule();
}

function importAISchedule() {
  const aiRaw = localStorage.getItem("ai_schedule");
  if (!aiRaw) return;

  const lines = aiRaw.split("\n").filter(Boolean);
  for (let line of lines) {
    const match = line.match(/^\s*(\d{1,2}:\d{2}(?:am|pm))\s*-\s*(.+?)\s+at\s+(.+)$/i);
    if (match) {
      const time = match[1];
      const name = match[2];
      const location = match[3];
      stops.push(location);
      addEventToSchedule(name, time, location, 60);
    }
  }
  localStorage.removeItem("ai_schedule");
}

function addStop() {
  const input = document.getElementById("address-input");
  const address = input.value.trim();
  if (!address) return alert("Please enter a location.");

  stops.push(address);
  addEventToSchedule("Stop", "—", address, 0);
  input.value = "";
}

function addEventToSchedule(name, time, location, duration) {
  const event = { name, time, location, duration };
  schedule.push(event);
  updateScheduleTable();
}

function updateScheduleTable() {
  const table = document.getElementById("schedule");
  const oldRows = table.querySelectorAll("tr:not(:first-child)");
  oldRows.forEach(row => row.remove());

  schedule.forEach((e, idx) => {
    const endTime = suggestEndTime(e.time, e.duration);
    const row = table.insertRow();
    row.setAttribute("draggable", true);
    row.dataset.index = idx;

    const priorityColor = e.priority === "high" ? "#ff4d4d" :
                          e.priority === "medium" ? "#ffc107" : "#5cb85c";

    row.innerHTML = `
      <td id="num">${idx + 1}</td>
      <td contenteditable="true" oninput="schedule[${idx}].name = this.textContent" id="event">${e.name}</td>
      <td contenteditable="true" oninput="schedule[${idx}].time = this.textContent" id="start_time">${e.time}</td>
      <td contenteditable="true" oninput="schedule[${idx}].time = this.textContent" id="end_time">${endTime} </td>
      <td contenteditable="true" oninput="schedule[${idx}].location = this.textContent" id="location">${e.location}</td>
      <td id="notes"><textarea placeholder="Notes" onchange="schedule[${idx}].note = this.value">${e.note || ''}</textarea></td>
      <td id="priority">
        <select onchange="schedule[${idx}].priority = this.value" style="background:${priorityColor}">
          <option value="low" ${e.priority === "low" ? "selected" : ""}>Low</option>
          <option value="medium" ${e.priority === "medium" ? "selected" : ""}>Medium</option>
          <option value="high" ${e.priority === "high" ? "selected" : ""}>High</option>
        </select>
      </td>
      <td id="visual"><div style="width:${e.duration}px; height:10px; background:#007bff"></div></td>
      <td id="gap"><span id="gap-${idx}" style="color: gray"></span></td>
      <td id="actions">
        <button onclick="schedule.splice(${idx},1); updateScheduleTable()">🗑</button>
        <button onclick="schedule.splice(${idx}+1,0,{...schedule[${idx}]}); updateScheduleTable()">📄</button>
      </td>
    `;
  });
  sessionStorage.setItem("schedule_data", JSON.stringify(schedule));
  sessionStorage.setItem("stops_data", JSON.stringify(stops));

  showGaps();
  calculateRoute(); 
}


function suggestEndTime(startTime, duration) {
  if (!startTime.includes(":")) return "?";
  let [hour, min] = startTime.replace(/(am|pm)/i, "").split(":".trim());
  let ampm = startTime.toLowerCase().includes("pm") ? "pm" : "am";
  hour = parseInt(hour);
  min = parseInt(min);

  if (ampm === "pm" && hour !== 12) hour += 12;
  const end = new Date();
  end.setHours(hour);
  end.setMinutes(min + duration);

  let h = end.getHours();
  let m = end.getMinutes();
  const suffix = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  m = m.toString().padStart(2, "0");
  return `${h}:${m}${suffix}`;
}

function showGaps() {
  for (let i = 1; i < schedule.length; i++) {
    const prev = schedule[i - 1];
    const curr = schedule[i];
    const prevEnd = new Date(`1970-01-01T${parseTime(suggestEndTime(prev.time, prev.duration))}`);
    const currStart = new Date(`1970-01-01T${parseTime(curr.time)}`);
    const diff = (currStart - prevEnd) / 60000;
    const msg = diff > 0 ? `+${diff} min gap` : `⚠️ Overlap`;
    const cell = document.getElementById(`gap-${i}`);
    if (cell) cell.textContent = msg;
  }
}

function parseTime(t) {
  const match = t.match(/(\d{1,2}):(\d{2})(am|pm)/);
  if (!match) return "00:00";
  let [_, h, m, suffix] = match;
  h = parseInt(h);
  if (suffix === "pm" && h !== 12) h += 12;
  if (suffix === "am" && h === 12) h = 0;
  return `${h.toString().padStart(2, "0")}:${m}`;
}

function enableDragReorder() {
  const table = document.getElementById("schedule");
  let dragging;

  table.addEventListener("dragstart", e => {
    if (e.target.tagName === "TR") dragging = e.target;
  });

  table.addEventListener("dragover", e => {
    e.preventDefault();
    const target = e.target.closest("tr");
    if (target && target !== dragging) target.style.borderTop = "2px solid red";
  });

  table.addEventListener("dragleave", e => {
    const target = e.target.closest("tr");
    if (target) target.style.borderTop = "";
  });

  table.addEventListener("drop", e => {
    const target = e.target.closest("tr");
    if (!target || target === dragging) return;

    const fromIdx = dragging.dataset.index;
    const toIdx = target.dataset.index;
    const moved = schedule.splice(fromIdx, 1)[0];
    schedule.splice(toIdx, 0, moved);
    updateScheduleTable();
  });
}

function calculateRoute(mode = "DRIVING") {
  if (stops.length < 2) {
    alert("Please add at least two stops.");
    return;
  }

  const origin = stops[0];
  const destination = stops[stops.length - 1];
  const waypoints = stops.slice(1, -1).map(stop => ({ location: stop, stopover: true }));

  const request = {
    origin,
    destination,
    waypoints,
    optimizeWaypoints: false,
    travelMode: google.maps.TravelMode[mode],
    drivingOptions: mode === "DRIVING" ? {
      departureTime: new Date(),
      trafficModel: "bestguess"
    } : undefined
  };

  directionsService.route(request, (result, status) => {
    if (status === google.maps.DirectionsStatus.OK) {
      directionsRenderer.setDirections(result);
      document.getElementById("directions-panel").innerHTML =
   result.routes[0].legs.map((leg, i) => `
    <h3>Segment ${i + 1}: ${leg.start_address} → ${leg.end_address}</h3>
    <ol>
      ${leg.steps.map(step => `<li>${step.instructions} (${step.duration.text})</li>`).join("")}
    </ol>
  `).join("<hr>");
      document.getElementById("gmaps-button-container").style.display = "block";
      checkScheduleConflicts(result);
      showTravelTimes(result);
      checkEventConflicts(result);
      addInfoWindows(result);
      if (mode === "TRANSIT") {
        showTransitDetails(result);
      }
    } else {
      alert("Directions request failed: " + status);
    }
  });
}

function showTransitDetails(result) {
  const legs = result.routes[0].legs;
  let message = "\n🚉 Transit Route Details:";

  legs.forEach((leg, i) => {
    leg.steps.forEach(step => {
      if (step.travel_mode === "TRANSIT") {
        const line = step.transit?.line;
        const vehicle = line?.vehicle?.type;
        const name = line?.name || "Unnamed";
        const departureStop = step.transit?.departure_stop?.name;
        const arrivalStop = step.transit?.arrival_stop?.name;

        message += `\nLeg ${i + 1}: Take ${vehicle || "Transit"} line ${name} from ${departureStop} to ${arrivalStop}`;
      }
    });
  });

  alert(message);
}

function showTravelTimes(result) {
  const table = document.getElementById("travel-time-table");
  if (!table || schedule.length < 2) return;

  const rows = table.querySelectorAll("tr:not(:first-child)");
  rows.forEach(row => row.remove());

  const legs = result.routes[0].legs;
  let totalDuration = 0;

  for (let i = 0; i < legs.length && i + 1 < schedule.length; i++) {
    const fromEvent = schedule[i];
    const toEvent = schedule[i + 1];
    const leg = legs[i];

    const prevEnd = parseTimeToDate(suggestEndTime(fromEvent.time, fromEvent.duration));
    const travelSeconds = leg.duration.value;
    totalDuration += travelSeconds;

    const etaDate = new Date(prevEnd.getTime() + travelSeconds * 1000);
    const etaFormatted = formatTime(etaDate);

    const scheduledArrival = toEvent.time;
    const isLate = etaDate > parseTimeToDate(scheduledArrival);

    const row = table.insertRow();
    row.innerHTML = `
      <td>${fromEvent.name} (${fromEvent.location})</td>
      <td>${toEvent.name} (${toEvent.location})</td>
      <td>${leg.duration.text}</td>
      <td style="color:${isLate ? 'red' : 'black'}">${etaFormatted}${isLate ? " ⚠️ Late" : ""}</td>
    `;
  }

  const summary = table.insertRow();
  summary.innerHTML = `
    <td colspan="2"><strong>Total Trip Duration</strong></td>
    <td colspan="2"><strong>${Math.round(totalDuration / 60)} min</strong></td>
  `;
}

function checkEventConflicts(result) {
  if (!schedule.length || result.routes.length === 0) return;

  const legs = result.routes[0].legs;
  let currentTime = new Date();

  for (let i = 0; i < legs.length; i++) {
    const durationMinutes = legs[i].duration.value / 60;
    currentTime.setMinutes(currentTime.getMinutes() + durationMinutes);

    const eventTime = schedule[i + 1]?.time;
    if (eventTime && /\d{1,2}:\d{2}(am|pm)/i.test(eventTime)) {
      const [eventHourMin, period] = eventTime.split(/(am|pm)/i);
      let [hour, minute] = eventHourMin.split(":".trim()).map(Number);
      if (period.toLowerCase() === "pm" && hour !== 12) hour += 12;

      const eventDateTime = new Date();
      eventDateTime.setHours(hour);
      eventDateTime.setMinutes(minute);

      if (currentTime > eventDateTime) {
        alert(`⚠️ Warning: You may be late to ${schedule[i + 1].name}`);
      }
    }
  }
}

function clearSchedule() {
  schedule = [];
  stops = [];
  updateScheduleTable();
  directionsRenderer.setDirections({ routes: [] });

  const travelTable = document.getElementById("travel-time-table");
  if (travelTable) {
    const rows = travelTable.querySelectorAll("tr:not(:first-child)");
    rows.forEach(row => row.remove());
  }
}

function useGeolocation() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const currentLocation = `${lat},${lng}`;
        if (stops.length > 0) {
          stops[0] = currentLocation;
        } else {
          stops.unshift(currentLocation);
        }
        alert("Your current location was set as the start point.");
        calculateRoute();
      },
      () => alert("Geolocation failed. Please allow location access.")
    );
  } else {
    alert("Geolocation is not supported by this browser.");
  }
}

function addInfoWindows(result) {
  const legs = result.routes[0].legs;
  for (let i = 0; i < legs.length; i++) {
    const marker = new google.maps.Marker({
      position: legs[i].end_location,
      map: map,
    });
    const info = new google.maps.InfoWindow({
      content: `<strong>${schedule[i + 1]?.name || "Stop"}</strong><br>${legs[i].end_address}`,
    });
    marker.addListener("click", () => {
      info.open(map, marker);
    });
  }
}

function updateETAs() {
  if (schedule.length === 0) return;

  let baseTime = parseTimeToDate(schedule[0].time);
  if (!baseTime) {
    console.warn("First event time is invalid or missing.");
    return;
  }

  let current = new Date(baseTime); 

  schedule.forEach((event, i) => {
    if (i > 0) {
      const prev = schedule[i - 1];
      current.setMinutes(current.getMinutes() + (prev.duration || 0));

      const travelTime = 10; 
      current.setMinutes(current.getMinutes() + travelTime);
    }

    const hr = current.getHours() % 12 || 12;
    const min = current.getMinutes().toString().padStart(2, '0');
    const ampm = current.getHours() >= 12 ? 'pm' : 'am';
    const etaCell = document.getElementById(`eta-${i}`);
    if (etaCell) etaCell.textContent = `${hr}:${min}${ampm}`;
  });
}
function parseTimeToDate(timeStr) {
  const match = timeStr?.match(/(\d{1,2}):(\d{2})(am|pm)/i);
  if (!match) return null;
  let [_, h, m, period] = match;
  h = parseInt(h);
  m = parseInt(m);
  if (period.toLowerCase() === "pm" && h !== 12) h += 12;
  if (period.toLowerCase() === "am" && h === 12) h = 0;
  const now = new Date();
  now.setHours(h);
  now.setMinutes(m);
  now.setSeconds(0);
  now.setMilliseconds(0);
  return now;
}

function formatTime(date) {
  const hr = date.getHours() % 12 || 12;
  const min = date.getMinutes().toString().padStart(2, '0');
  const ampm = date.getHours() >= 12 ? 'pm' : 'am';
  return `${hr}:${min}${ampm}`;
}

function checkScheduleConflicts(result) {
  if (!result?.routes?.[0]?.legs || schedule.length < 2) return;

  const legs = result.routes[0].legs;

  for (let i = 1; i < schedule.length; i++) {
    const leg = legs[i - 1];
    const toEvent = schedule[i];
    const fromEvent = schedule[i - 1];

    const toTime = parseTimeToDate(toEvent.time);
    const leaveBy = new Date(toTime.getTime() - leg.duration.value * 1000);
    const fromEnd = parseTimeToDate(suggestEndTime(fromEvent.time, fromEvent.duration));

    const gapCell = document.getElementById(`gap-${i}`);
    if (!gapCell) continue;

    if (leaveBy < fromEnd) {
      gapCell.innerHTML = `⚠️ Not enough travel time`;
      gapCell.style.color = "red";
    } else {
      const minsGap = Math.round((leaveBy - fromEnd) / 60000);
      gapCell.innerHTML = `+${minsGap} min gap`;
      gapCell.style.color = "gray";
    }
  }
}

function autoFixConflicts() {
  if (schedule.length < 2) return;

  calculateRoute(); 
  setTimeout(() => {
    const travelRows = document.querySelectorAll("#travel-time-table tr:not(:first-child):not(:last-child)");
    if (travelRows.length !== schedule.length - 1) return;

    for (let i = 0; i < travelRows.length; i++) {
      const row = travelRows[i];
      const arriveByText = row.children[3].textContent.replace(/⚠️ Late/, "").trim();
      const toEvent = schedule[i + 1];

      if (arriveByText !== "" && toEvent.time !== arriveByText) {
        toEvent.time = arriveByText;
      }
    }

    updateScheduleTable();
  }, 1000); 
}

function handleFixConflicts() {
  const travelTable = document.getElementById("travel-time-table");
  const conflictRows = Array.from(travelTable.querySelectorAll("tr:not(:first-child):not(:last-child)"))
    .filter(row => row.innerHTML.includes("⚠️ Late") || row.innerHTML.includes("Not enough travel time"));

  if (conflictRows.length === 0) {
    alert("✅ No conflicts to fix!");
    return;
  }

  autoFixConflicts();
}


function handleAddEvent() {
  const name = document.getElementById("event-name").value.trim();
  const time = document.getElementById("event-time").value.trim();
  const location = document.getElementById("address-input").value.trim();
  const duration = parseInt(document.getElementById("event-duration").value) || 60;

  if (!name || !time || !location) {
    alert("Please fill out event name, time, and location.");
    return;
  }

  addEventToSchedule(name, time, location, duration);
  stops.push(location);

  document.getElementById("event-name").value = "";
  document.getElementById("event-time").value = "";
  document.getElementById("event-duration").value = "";
  document.getElementById("address-input").value = "";
}

function exportToGoogleCalendar(index) {
  const event = schedule[index];
  if (!event || !event.time) {
    alert("Missing or invalid event time.");
    return;
  }

  const start = parseTimeToDate(event.time);
  const end = parseTimeToDate(suggestEndTime(event.time, event.duration));

  if (!start || !end) {
    alert("Unable to parse start or end time.");
    return;
  }
  const formatLocal = date => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    const ss = "00"; 
    return `${yyyy}${mm}${dd}T${hh}${min}${ss}`;
  };

  const gcalUrl = `https://www.google.com/calendar/render?action=TEMPLATE` +
    `&text=${encodeURIComponent(event.name)}` +
    `&dates=${formatLocal(start)}/${formatLocal(end)}` +
    `&details=${encodeURIComponent(event.note || '')}` +
    `&location=${encodeURIComponent(event.location || '')}` +
    `&sf=true&output=xml`;

  window.open(gcalUrl, "_blank");
}

function openInGoogleMaps() {
  if (stops.length < 2) {
    alert("Please add at least two stops to map a route.");
    return;
  }

  const baseUrl = "https://www.google.com/maps/dir/?api=1";
  const origin = encodeURIComponent(stops[0]);
  const destination = encodeURIComponent(stops[stops.length - 1]);
  const waypoints = stops.slice(1, -1).map(encodeURIComponent).join("|");

  const url = `${baseUrl}&origin=${origin}&destination=${destination}` +
              (waypoints ? `&waypoints=${waypoints}` : "") +
              `&travelmode=${document.getElementById("travel-mode").value.toLowerCase()}`;

  window.open(url, "_blank");
}


