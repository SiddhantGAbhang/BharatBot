/* ═══════════════════════════════════════════════════════════════════════════
   BharatBot - Autonomous Servicing robot for lunar and martian habitats · Main Script
   
   DATA POLICY:
   • When NOT connected to ROS2 → all KPI / sensor values show "--"
                                 → canvas panels animate with SIMULATION label
   • When CONNECTED to ROS2     → real data from /odom /imu /scan /cmd_vel
                                 → canvas panels show "● LIVE" label
   ═══════════════════════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────── State ──────────────────────────── */
const LIVE = {
  connected: false,
  imu: null,
  scan: null,
  cmdvel: null,
  odom: null,
  battery: null,
};

/* ─────────────────────────────────────── Stars Canvas ───────────────────── */
function initStars(canvasId, count = 300) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let stars = [];

  function resize() {
    canvas.width = canvas.offsetWidth || window.innerWidth;
    canvas.height = canvas.offsetHeight || window.innerHeight;
    stars = Array.from({ length: count }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 1.5 + 0.3,
      a: Math.random(),
      da: (Math.random() - 0.5) * 0.005,
    }));
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    stars.forEach(s => {
      s.a = Math.max(0.1, Math.min(1, s.a + s.da));
      if (s.a <= 0.1 || s.a >= 1) s.da *= -1;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200,215,255,${s.a})`;
      ctx.fill();
    });
    requestAnimationFrame(draw);
  }
  resize();
  window.addEventListener('resize', resize);
  draw();
}

/* ─────────────────────────────────────── Launch Sequence ────────────────── */
(function launchSequence() {
  const screen = document.getElementById('launch-screen');
  const bar = document.getElementById('launch-progress-bar');
  const status = document.getElementById('launch-status-text');
  const lander = document.getElementById('lander');
  const moonSurf = document.getElementById('moon-surface-wrap');
  const skipBtn = document.getElementById('skip-btn');
  const dash = document.getElementById('dashboard');

  initStars('star-canvas', 350);

  const steps = [
    { pct: 10, text: 'Booting ROS2 nodes…', delay: 800 },
    { pct: 25, text: 'Connecting to hardware interface…', delay: 1400 },
    { pct: 42, text: 'Loading habitat_classic.world…', delay: 1800 },
    { pct: 60, text: 'Spawning BharatBot entity…', delay: 2200 },
    { pct: 75, text: 'Initialising Cartographer SLAM…', delay: 2800 },
    { pct: 88, text: 'Calibrating IMU & LiDAR sensors…', delay: 3400 },
    { pct: 100, text: 'Mission Control ready ✓', delay: 4000 },
  ];

  let activated = false;
  function activateDashboard() {
    if (activated) return;
    activated = true;
    screen.classList.add('fade-out');
    dash.classList.remove('hidden');
    setTimeout(() => { dash.classList.add('visible'); }, 50);
    setTimeout(() => { screen.style.display = 'none'; }, 900);
    initDashboard();
  }

  skipBtn.addEventListener('click', activateDashboard);
  steps.forEach(({ pct, text, delay }) => {
    setTimeout(() => { bar.style.width = pct + '%'; status.textContent = text; }, delay);
  });

  setTimeout(() => {
    lander.classList.add('landed');
    setTimeout(() => { moonSurf.classList.add('dust-puff'); }, 2800);
  }, 1000);

  setTimeout(activateDashboard, 4700);
})();

/* ─────────────────────────────────────── Dashboard init ─────────────────── */
function initDashboard() {
  initStars('hero-canvas', 200);
  initNavHighlight();
  initROSBridge();
  startTelemetryLoop();
  initLidar();
  initJoystick();
  initSlamMap();
  initCompass();
}

/* ─────────────────────────────────────── Nav Highlight ─────────────────── */
function initNavHighlight() {
  const links = document.querySelectorAll('.nav-link');
  const sections = [...links].map(l => document.querySelector(l.getAttribute('href')));
  window.addEventListener('scroll', () => {
    let cur = 0;
    sections.forEach((s, i) => { if (s && s.getBoundingClientRect().top <= 120) cur = i; });
    links.forEach((l, i) => l.classList.toggle('active', i === cur));
  });
}

/* ─────────────────────────────────────── ROSBridge wiring ──────────────── */
function initROSBridge() {
  const connectBtn = document.getElementById('ros-connect-btn');
  const urlInput = document.getElementById('ros-url-input');
  const connDot = document.getElementById('conn-dot');
  const connLabel = document.getElementById('conn-label');

  // Cache original system node states
  let originalNodeStates = null;
  const nodeCards = document.querySelectorAll('.node-card');

  function setStatus(state) {
    LIVE.connected = (state === 'live');
    connDot.className = 'status-dot ' + state;

    // Initialize cache on first run
    if (!originalNodeStates) {
      originalNodeStates = Array.from(nodeCards).map(card => {
        const badge = card.querySelector('.node-badge');
        return {
          cardClass: card.className,
          badgeClass: badge ? badge.className : '',
          badgeText: badge ? badge.textContent : ''
        };
      });
    }

    if (state === 'live') {
      connLabel.textContent = 'LIVE';
      connLabel.style.color = 'var(--online)';
      connectBtn.textContent = 'Disconnect';
      connectBtn.classList.add('connected');
    } else if (state === 'connecting') {
      connLabel.textContent = 'CONNECTING…';
      connLabel.style.color = 'var(--warn)';
      connectBtn.textContent = 'Connecting…';
      connectBtn.classList.remove('connected');
    } else if (state === 'error') {
      connLabel.textContent = 'ERROR';
      connLabel.style.color = 'var(--danger)';
      connectBtn.textContent = 'Connect';
      connectBtn.classList.remove('connected');
      clearAllDisplays();
    } else {
      // 'sim' / 'disconnected'
      connLabel.textContent = 'OFFLINE';
      connLabel.style.color = 'var(--text-dim)';
      connectBtn.textContent = 'Connect';
      connectBtn.classList.remove('connected');
    }

    // Toggle system node cards based on connection
    nodeCards.forEach((card, i) => {
      const badge = card.querySelector('.node-badge');
      if (!badge) return;

      if (state === 'live') {
        // Restore original state (online / sim / idle)
        card.className = originalNodeStates[i].cardClass;
        badge.className = originalNodeStates[i].badgeClass;
        badge.textContent = originalNodeStates[i].badgeText;
      } else {
        // Force offline state
        card.className = 'node-card inactive';
        badge.className = 'node-badge idle';
        badge.textContent = 'OFFLINE';
      }
    });
  }

  setStatus('sim');
  clearAllDisplays();

  rosBridge.on('connected', () => setStatus('live'));
  rosBridge.on('disconnected', () => { setStatus('sim'); clearAllDisplays(); resetLiveData(); });
  rosBridge.on('error', () => { setStatus('error'); clearAllDisplays(); resetLiveData(); });

  rosBridge.on('imu', data => { LIVE.imu = data; });
  rosBridge.on('scan', data => { LIVE.scan = data; });
  rosBridge.on('cmdvel', data => { LIVE.cmdvel = data; });
  rosBridge.on('odom', data => { LIVE.odom = data; });
  rosBridge.on('battery', data => { LIVE.battery = data; });

  connectBtn.addEventListener('click', () => {
    if (rosBridge.isConnected) {
      rosBridge.disconnect();
      setStatus('sim');
      clearAllDisplays();
      resetLiveData();
    } else {
      setStatus('connecting');
      rosBridge.connect(urlInput.value.trim() || 'ws://localhost:9090');
    }
  });
}

/** Set all numerical displays to -- (N/A for non-ROS values) */
function clearAllDisplays() {
  const ids = [
    'val-battery', 'val-speed', 'val-angular', 'val-distance',
    'imu-roll', 'imu-pitch', 'imu-yaw', 'imu-ax', 'imu-ay',
    'cv-lx', 'cv-ly', 'cv-az',
    'pose-x', 'pose-y', 'pose-z', 'pose-h',
    'lidar-min', 'lidar-max', 'lidar-pts',
  ];
  ids.forEach(id => setVal(id, '--'));
  setVal('val-uptime', '--:--:--');
  // Temperature has no ROS topic — always show N/A
  setVal('val-temp', 'N/A');

  // Reset all KPI bars to zero
  ['bar-battery', 'bar-speed', 'bar-angular', 'bar-temp', 'bar-distance'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.width = '0%';
  });
}

function resetLiveData() {
  LIVE.imu = LIVE.scan = LIVE.cmdvel = LIVE.odom = LIVE.battery = null;
}

/* ─────────────────────────────────────── Helpers ────────────────────────── */
function lerp(a, b, t) { return a + (b - a) * t; }
function setVal(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }
function formatUptime(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600).toString().padStart(2, '0');
  const m = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
  const sc = (s % 60).toString().padStart(2, '0');
  return `${h}:${m}:${sc}`;
}
function updateKPI(valId, barId, val, max, decimals = 1) {
  const el = document.getElementById(valId);
  const bar = document.getElementById(barId);
  if (el) el.textContent = isFinite(val) ? Number(val).toFixed(decimals) : '--';
  if (bar) bar.style.width = Math.min(100, (Math.abs(val) / max) * 100) + '%';
}

/* ─────────────────────────────────────── Telemetry Loop ─────────────────── */
const missionStart = Date.now();
let totalDist = 0;
let jsLx = 0, jsAz = 0;

function startTelemetryLoop() {
  setInterval(tick, 100);
}

function tick() {
  if (!LIVE.connected) {
    // Generate random mock data to show the website UI when offline
    setVal('val-uptime', formatUptime(Date.now() - missionStart));
    updateKPI('val-battery', 'bar-battery', 85 + Math.sin(Date.now() * 0.001) * 3, 100, 1);
    updateKPI('val-speed', 'bar-speed', Math.abs(Math.sin(Date.now() * 0.002)) * 0.8, 1.5, 3);
    updateKPI('val-angular', 'bar-angular', Math.cos(Date.now() * 0.001) * 0.4, 1.0, 3);
    setVal('val-temp', (35 + Math.random() * 2).toFixed(1));
    
    let roll = Math.sin(Date.now() * 0.001) * 12;
    let pitch = Math.cos(Date.now() * 0.0008) * 8;
    let yaw = (Date.now() * 0.02) % 360;
    
    setVal('imu-roll', roll.toFixed(1));
    setVal('imu-pitch', pitch.toFixed(1));
    setVal('imu-yaw', yaw.toFixed(1));
    setVal('imu-ax', (Math.random() * 0.1).toFixed(3));
    setVal('imu-ay', (Math.random() * 0.1).toFixed(3));
    
    setVal('pose-x', (Math.sin(Date.now() * 0.0005) * 5).toFixed(3));
    setVal('pose-y', (Math.cos(Date.now() * 0.0005) * 5).toFixed(3));
    setVal('pose-h', yaw.toFixed(1));

    drawIMU(roll, pitch, yaw);
    drawJoystick(Math.sin(Date.now() * 0.002) * 0.7, Math.cos(Date.now() * 0.001) * 0.5);
    drawCompass(yaw);
    return;
  }

  /* ── Mission uptime ── */
  setVal('val-uptime', formatUptime(Date.now() - missionStart));

  /* ── Temperature: no ROS topic, always N/A ── */
  setVal('val-temp', 'N/A');

  /* ── Battery ── */
  if (LIVE.battery !== null) {
    updateKPI('val-battery', 'bar-battery', LIVE.battery, 100, 1);
  }

  /* ── Speed / Angular from odom or cmd_vel ── */
  let speed = 0, angular = 0;
  if (LIVE.odom) {
    speed = LIVE.odom.linearX;
    angular = LIVE.odom.angularZ;
    totalDist += Math.abs(speed) * 0.1;
    updateKPI('val-distance', 'bar-distance', totalDist, 500, 1);
  }
  if (LIVE.cmdvel) {
    speed = LIVE.cmdvel.linearX;
    angular = LIVE.cmdvel.angularZ;
  }
  updateKPI('val-speed', 'bar-speed', Math.abs(speed), 1.5, 3);
  updateKPI('val-angular', 'bar-angular', Math.abs(angular), 1.0, 3);

  /* ── cmd_vel display & joystick ── */
  const cvLx = LIVE.cmdvel ? LIVE.cmdvel.linearX : 0;
  const cvLy = LIVE.cmdvel ? LIVE.cmdvel.linearY : 0;
  const cvAz = LIVE.cmdvel ? LIVE.cmdvel.angularZ : 0;
  setVal('cv-lx', cvLx.toFixed(3));
  setVal('cv-ly', cvLy.toFixed(3));
  setVal('cv-az', cvAz.toFixed(3));
  const jLx = Math.max(-1, Math.min(1, cvLx / 1.5));
  const jAz = Math.max(-1, Math.min(1, cvAz / 1.0));
  drawJoystick(jLx, jAz);

  /* ── IMU ── */
  if (LIVE.imu) {
    const { roll, pitch, yaw, linAccX, linAccY } = LIVE.imu;
    setVal('imu-roll', roll.toFixed(1));
    setVal('imu-pitch', pitch.toFixed(1));
    setVal('imu-yaw', (((yaw % 360) + 360) % 360).toFixed(1));
    setVal('imu-ax', linAccX.toFixed(3));
    setVal('imu-ay', linAccY.toFixed(3));
    drawIMU(roll, pitch, yaw);
  }

  /* ── Pose from odom ── */
  if (LIVE.odom) {
    const yawDeg = (((LIVE.odom.yaw % 360) + 360) % 360);
    setVal('pose-x', LIVE.odom.x.toFixed(3));
    setVal('pose-y', LIVE.odom.y.toFixed(3));
    setVal('pose-z', LIVE.odom.z.toFixed(3));
    setVal('pose-h', yawDeg.toFixed(1));
    drawCompass(yawDeg);
  }
}


/* ─────────────────────────────────────── IMU Horizon ────────────────────── */
function drawIMU(roll, pitch, yaw) {
  const cv = document.getElementById('imu-canvas');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height, cx = W / 2, cy = H / 2;
  const r = roll * Math.PI / 180;
  const p = (pitch / 90) * (H * 0.3);

  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.translate(cx, cy + p);
  ctx.rotate(r);
  ctx.fillStyle = '#1a2035'; ctx.fillRect(-W, 0, W * 2, H * 2);
  ctx.fillStyle = '#060d20'; ctx.fillRect(-W, -H * 2, W * 2, H * 2);
  ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-W, 0); ctx.lineTo(W, 0); ctx.stroke();
  ctx.restore();

  // Crosshair
  ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - 40, cy); ctx.lineTo(cx - 10, cy);
  ctx.moveTo(cx + 10, cy); ctx.lineTo(cx + 40, cy);
  ctx.stroke();

  // Horizon tick marks
  ctx.strokeStyle = 'rgba(0,229,255,0.08)'; ctx.lineWidth = 1;
  for (let i = 1; i <= 3; i++) {
    [cy - i * 20, cy + i * 20].forEach(y => {
      ctx.beginPath(); ctx.moveTo(cx - 30, y); ctx.lineTo(cx + 30, y); ctx.stroke();
    });
  }

  // Roll arc + pointer
  ctx.strokeStyle = 'rgba(0,229,255,0.35)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, 65, -Math.PI * 0.7, Math.PI * 0.7 + Math.PI); ctx.stroke();
  ctx.save();
  ctx.translate(cx, cy); ctx.rotate(r - Math.PI / 2);
  ctx.fillStyle = '#00e5ff';
  ctx.beginPath(); ctx.moveTo(0, -65); ctx.lineTo(-6, -55); ctx.lineTo(6, -55);
  ctx.closePath(); ctx.fill();
  ctx.restore();

  // Sky/Ground labels
  ctx.font = '10px Exo 2, sans-serif';
  ctx.fillStyle = 'rgba(0,229,255,0.6)'; ctx.fillText('SKY', 8, 20);
  ctx.fillStyle = 'rgba(100,120,180,0.8)'; ctx.fillText('GND', 8, H - 8);

  // Mode badge
  if (!LIVE.connected) {
    ctx.fillStyle = 'rgba(255,193,7,0.7)';
    ctx.font = 'bold 9px Orbitron, sans-serif';
    ctx.fillText('◌ OFFLINE', 8, H - 20);
  } else {
    ctx.fillStyle = 'rgba(86,240,160,0.85)';
    ctx.font = 'bold 9px Orbitron, sans-serif';
    ctx.fillText('● LIVE', 8, H - 20);
  }
}

/* ─────────────────────────────────────── LiDAR Canvas ───────────────────── */
let lidarAngle = 0;
let liveRanges = null;

function initLidar() {
  // Simulated obstacle map for offline visual only
  const obstacles = [
    { cx: 0.7, cy: 0.2, r: 0.15 },
    { cx: -0.5, cy: 0.6, r: 0.10 },
    { cx: 0.1, cy: -0.7, r: 0.12 },
    { cx: -0.8, cy: -0.2, r: 0.08 },
  ];
  function simRay(angle) {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    let d = 1.0;
    obstacles.forEach(o => {
      const fx = o.cx, fy = o.cy;
      const b = fx * dx + fy * dy;
      const disc = b * b - (fx * fx + fy * fy - o.r * o.r);
      if (disc >= 0) { const t = b - Math.sqrt(disc); if (t > 0 && t < d) d = t; }
    });
    return d;
  }

  rosBridge.on('scan', data => { liveRanges = data; });

  function drawLidar() {
    const cv = document.getElementById('lidar-canvas');
    if (!cv) { requestAnimationFrame(drawLidar); return; }
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height, cx = W / 2, cy = H / 2;
    const scale = Math.min(W, H) * 0.42;

    lidarAngle += 0.02;

    ctx.clearRect(0, 0, W, H);

    // Background rings
    ctx.strokeStyle = 'rgba(0,229,255,0.06)'; ctx.lineWidth = 1;
    for (let r = 0.25; r <= 1; r += 0.25) {
      ctx.beginPath(); ctx.arc(cx, cy, r * scale, 0, Math.PI * 2); ctx.stroke();
    }
    // Grid spokes
    ctx.strokeStyle = 'rgba(0,229,255,0.04)';
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * scale, cy + Math.sin(a) * scale); ctx.stroke();
    }

    let points = [];
    let minR = Infinity, maxR = 0;

    if (LIVE.connected && liveRanges) {
      /* ── Real LiDAR data ── */
      const { ranges, angleMin, angleIncrement, rangeMin, rangeMax } = liveRanges;
      const usableMax = rangeMax > 0 ? rangeMax : 20;
      ranges.forEach((r, i) => {
        if (!isFinite(r) || r <= rangeMin || r >= rangeMax) return;
        const a = angleMin + i * angleIncrement;
        points.push({ angle: a, dist: Math.min(r, usableMax) / usableMax });
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
      });
      setVal('lidar-min', isFinite(minR) ? minR.toFixed(2) : '--');
      setVal('lidar-max', isFinite(maxR) ? maxR.toFixed(2) : '--');
      setVal('lidar-pts', ranges.length.toString());
    } else {
      /* ── Offline visual animation (no numbers) ── */
      const N = 360;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2;
        points.push({ angle: a, dist: Math.max(0.05, simRay(a) + (Math.random() - 0.5) * 0.02) });
      }
      // Do NOT update lidar stat values — they stay '--'
    }

    // Sweep beam (offline only, cosmetic)
    if (!LIVE.connected || !liveRanges) {
      ctx.fillStyle = 'rgba(0,229,255,0.06)';
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, scale, lidarAngle - 0.3, lidarAngle); ctx.closePath(); ctx.fill();
    }

    // Point cloud polygon
    if (points.length > 0) {
      const rot = LIVE.connected ? 0 : lidarAngle;
      ctx.beginPath();
      points.forEach(({ angle, dist }, i) => {
        const px = cx + Math.cos(angle + rot) * dist * scale;
        const py = cy + Math.sin(angle + rot) * dist * scale;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      });
      ctx.closePath();
      ctx.fillStyle = 'rgba(0,229,255,0.05)'; ctx.fill();
      ctx.strokeStyle = 'rgba(0,229,255,0.25)'; ctx.lineWidth = 1; ctx.stroke();

      ctx.fillStyle = LIVE.connected ? '#56f0a0' : 'rgba(0,229,255,0.4)';
      points.forEach(({ angle, dist }) => {
        const px = cx + Math.cos(angle + (LIVE.connected ? 0 : lidarAngle)) * dist * scale;
        const py = cy + Math.sin(angle + (LIVE.connected ? 0 : lidarAngle)) * dist * scale;
        ctx.beginPath(); ctx.arc(px, py, LIVE.connected ? 2 : 1.2, 0, Math.PI * 2); ctx.fill();
      });
    }

    // Robot dot
    ctx.fillStyle = '#00e5ff';
    ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(0,229,255,0.12)';
    ctx.beginPath(); ctx.arc(cx, cy, 12, 0, Math.PI * 2); ctx.fill();

    // Status badge
    ctx.font = 'bold 9px Orbitron, sans-serif';
    if (LIVE.connected && liveRanges) {
      ctx.fillStyle = 'rgba(86,240,160,0.9)';
      ctx.fillText('● LIVE /scan', 8, 16);
    } else {
      ctx.fillStyle = 'rgba(255,193,7,0.7)';
      ctx.fillText('◌ SIMULATION', 8, 16);
    }

    requestAnimationFrame(drawLidar);
  }
  drawLidar();
}

/* ─────────────────────────────────────── Joystick Canvas ────────────────── */
function initJoystick() { drawJoystick(0, 0); }

function drawJoystick(lx, az) {
  jsLx = lerp(jsLx, lx, 0.3);
  jsAz = lerp(jsAz, az, 0.3);
  const cv = document.getElementById('joystick-canvas');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height, cx = W / 2, cy = H / 2;
  const R = Math.min(W, H) / 2 - 20;

  ctx.clearRect(0, 0, W, H);

  // Outer ring
  ctx.strokeStyle = 'rgba(0,229,255,0.2)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();

  // Crosshair
  ctx.strokeStyle = 'rgba(0,229,255,0.06)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();

  const tx = cx + jsAz * R;
  const ty = cy - jsLx * R;

  // Glow
  const grad = ctx.createRadialGradient(tx, ty, 0, tx, ty, R * 0.5);
  grad.addColorStop(0, 'rgba(0,229,255,0.1)');
  grad.addColorStop(1, 'transparent');
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();

  // Line
  ctx.strokeStyle = 'rgba(0,229,255,0.35)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(tx, ty); ctx.stroke();

  // Thumb
  ctx.fillStyle = 'rgba(0,229,255,0.12)';
  ctx.beginPath(); ctx.arc(tx, ty, 18, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = LIVE.connected ? '#00e5ff' : 'rgba(0,229,255,0.3)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(tx, ty, 18, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = LIVE.connected ? '#00e5ff' : 'rgba(0,229,255,0.35)';
  ctx.beginPath(); ctx.arc(tx, ty, 6, 0, Math.PI * 2); ctx.fill();
}

/* ─────────────────────────────────────── SLAM Map ──────────────────────── */
let mapGrid = null;

function initSlamMap() {
  const cv = document.getElementById('map-canvas');
  if (!cv) return;
  const W = cv.width, H = cv.height;
  const COLS = 70, ROWS = 34;
  const cw = W / COLS, ch = H / ROWS;

  // Generate a static terrain for visual only
  mapGrid = Array.from({ length: ROWS }, (_, r) =>
    Array.from({ length: COLS }, (_, c) => {
      const dx = c - COLS / 2, dy = r - ROWS / 2;
      if (Math.sqrt(dx * dx + dy * dy) > 14) return 0;
      if (Math.random() < 0.04) return 2;
      return 1;
    })
  );
  [[12, 8], [55, 20], [38, 28], [22, 25], [60, 10]].forEach(([cc, rc]) => {
    for (let dr = -3; dr <= 3; dr++) for (let dc = -3; dc <= 3; dc++)
      if (rc + dr >= 0 && rc + dr < ROWS && cc + dc >= 0 && cc + dc < COLS && Math.sqrt(dr * dr + dc * dc) < 3.5)
        mapGrid[rc + dr][cc + dc] = 2;
  });

  let robotC = Math.floor(COLS / 2), robotR = Math.floor(ROWS / 2);
  let simAngle = 0;

  function drawMap() {
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, W, H);

    // Cells
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const cell = mapGrid[r][c];
      ctx.fillStyle = cell === 0 ? 'rgba(255,255,255,0.03)'
        : cell === 1 ? 'rgba(86,240,160,0.08)'
          : 'rgba(255,92,119,0.35)';
      ctx.fillRect(c * cw, r * ch, cw - 0.5, ch - 0.5);
    }

    // Grid lines
    ctx.strokeStyle = 'rgba(0,229,255,0.04)'; ctx.lineWidth = 0.5;
    for (let c = 0; c <= COLS; c++) { ctx.beginPath(); ctx.moveTo(c * cw, 0); ctx.lineTo(c * cw, H); ctx.stroke(); }
    for (let r = 0; r <= ROWS; r++) { ctx.beginPath(); ctx.moveTo(0, r * ch); ctx.lineTo(W, r * ch); ctx.stroke(); }

    // Robot position
    let heading = 0;
    if (LIVE.connected && LIVE.odom) {
      robotC = Math.max(0, Math.min(COLS - 1, Math.round(COLS / 2 + LIVE.odom.x)));
      robotR = Math.max(0, Math.min(ROWS - 1, Math.round(ROWS / 2 - LIVE.odom.y)));
      if (mapGrid[robotR][robotC] !== 2) mapGrid[robotR][robotC] = 1;
      heading = LIVE.odom.yaw * Math.PI / 180;
    } else {
      // Offline: animate robot on a demo path (visual only)
      simAngle += 0.012;
      const newC = Math.floor(COLS / 2 + Math.cos(simAngle) * 10);
      const newR = Math.floor(ROWS / 2 + Math.sin(simAngle * 0.7) * 7);
      if (newC >= 0 && newC < COLS && newR >= 0 && newR < ROWS && mapGrid[newR][newC] !== 2) {
        robotC = newC; robotR = newR;
      }
      heading = simAngle;
    }

    const rx = robotC * cw + cw / 2, ry = robotR * ch + ch / 2;

    // Glow
    const grd = ctx.createRadialGradient(rx, ry, 0, rx, ry, 20);
    grd.addColorStop(0, 'rgba(0,229,255,0.25)'); grd.addColorStop(1, 'transparent');
    ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(rx, ry, 20, 0, Math.PI * 2); ctx.fill();

    // Robot dot
    ctx.fillStyle = '#00e5ff';
    ctx.beginPath(); ctx.arc(rx, ry, 5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(rx, ry, 9, 0, Math.PI * 2); ctx.stroke();

    // Direction arrow
    ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(rx, ry);
    ctx.lineTo(rx + Math.cos(heading) * 14, ry + Math.sin(heading) * 14); ctx.stroke();

    // Scan arc
    ctx.fillStyle = 'rgba(0,229,255,0.04)';
    ctx.beginPath(); ctx.moveTo(rx, ry);
    ctx.arc(rx, ry, 40, heading - 0.5, heading + 0.5); ctx.closePath(); ctx.fill();

    // Status badge
    ctx.font = 'bold 9px Orbitron, sans-serif';
    if (LIVE.connected && LIVE.odom) {
      ctx.fillStyle = 'rgba(86,240,160,0.9)';
      ctx.fillText('● LIVE ODOM', 8, 16);
    } else {
      ctx.fillStyle = 'rgba(255,193,7,0.7)';
      ctx.fillText('◌ SIMULATION', 8, 16);
    }

    requestAnimationFrame(drawMap);
  }
  drawMap();
}

/* ─────────────────────────────────────── Compass ───────────────────────── */
function initCompass() { drawCompass(0); }

function drawCompass(headingDeg) {
  const cv = document.getElementById('compass-canvas');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height, cx = W / 2, cy = H / 2;
  const R = Math.min(W, H) / 2 - 10;

  ctx.clearRect(0, 0, W, H);

  // Background
  const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  bg.addColorStop(0, '#0a1228'); bg.addColorStop(1, '#060b18');
  ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();

  // Border
  ctx.strokeStyle = 'rgba(0,229,255,0.25)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();

  // Tick marks + cardinal labels
  const dirs = ['N', 'E', 'S', 'W'];
  ctx.fillStyle = 'rgba(0,229,255,0.6)'; ctx.font = '9px Orbitron, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    const isMaj = i % 9 === 0;
    const r1 = isMaj ? R - 12 : R - 7;
    ctx.strokeStyle = 'rgba(0,229,255,0.3)'; ctx.lineWidth = isMaj ? 2 : 1;
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.stroke();
    if (isMaj) ctx.fillText(dirs[i / 9], cx + Math.cos(a) * (R - 22), cy + Math.sin(a) * (R - 22));
  }

  // Needle
  const na = (headingDeg - 90) * Math.PI / 180;
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(na);
  ctx.fillStyle = '#ff5c77';
  ctx.beginPath(); ctx.moveTo(0, -(R - 18)); ctx.lineTo(-7, 0); ctx.lineTo(7, 0);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#00e5ff';
  ctx.beginPath(); ctx.moveTo(0, R - 18); ctx.lineTo(-7, 0); ctx.lineTo(7, 0);
  ctx.closePath(); ctx.fill();
  ctx.restore();

  // Centre dot
  ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.stroke();
}
