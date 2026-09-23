/* ═══════════════════════════════════════════════════════════════════════════
   BharatBot – ROSBridge WebSocket Client
   Connects to rosbridge_suite via roslibjs and fires callbacks with real data.
   Topics: /imu · /scan · /cmd_vel · /odom · /battery_state
   ═══════════════════════════════════════════════════════════════════════════ */

class RosBridge {
    constructor() {
        this._ros = null;
        this._subs = {};        // topic → ROSLIB.Topic
        this._callbacks = {};        // event name → [fn]
        this._connected = false;
        this._url = 'ws://localhost:9090';
        this._retryTimer = null;
        this._retryDelay = 3000;
    }

    /* ─────────────────────────────────────── public API ─────────────────── */

    get isConnected() { return this._connected; }
    get url() { return this._url; }

    /**
     * Connect to a rosbridge_websocket server.
     * @param {string} url  e.g. 'ws://192.168.1.10:9090'
     */
    connect(url) {
        if (url) this._url = url;
        if (this._ros) { try { this._ros.close(); } catch (e) { } }

        this._ros = new ROSLIB.Ros({ url: this._url });

        this._ros.on('connection', () => {
            this._connected = true;
            clearTimeout(this._retryTimer);
            this._emit('connected');
            this._subscribeAll();
        });

        this._ros.on('error', (err) => {
            console.warn('[ROSBridge] error:', err);
            this._emit('error', err);
        });

        this._ros.on('close', () => {
            this._connected = false;
            this._emit('disconnected');
            // Auto-retry
            this._retryTimer = setTimeout(() => {
                console.log('[ROSBridge] Attempting reconnect to', this._url);
                this.connect(this._url);
            }, this._retryDelay);
        });
    }

    disconnect() {
        clearTimeout(this._retryTimer);
        if (this._ros) { try { this._ros.close(); } catch (e) { } }
        this._connected = false;
        this._subs = {};
    }

    /** Register a named callback for data events or connection events. */
    on(event, fn) {
        if (!this._callbacks[event]) this._callbacks[event] = [];
        this._callbacks[event].push(fn);
    }

    /* ─────────────────────────────────────── internals ──────────────────── */

    _emit(event, data) {
        (this._callbacks[event] || []).forEach(fn => fn(data));
    }

    _sub(topic, type, cb) {
        if (!this._ros) return;
        const existing = this._subs[topic];
        if (existing) { try { existing.unsubscribe(); } catch (e) { } }
        const s = new ROSLIB.Topic({ ros: this._ros, name: topic, messageType: type });
        s.subscribe(msg => cb(msg));
        this._subs[topic] = s;
    }

    _subscribeAll() {
        /* ── /imu  ─────────────────────────────────────────────────────────── */
        this._sub('/imu', 'sensor_msgs/Imu', msg => {
            const q = msg.orientation;
            const rpy = quatToRPY(q.x, q.y, q.z, q.w);
            const av = msg.angular_velocity;
            const la = msg.linear_acceleration;
            this._emit('imu', {
                roll: rpy.roll * (180 / Math.PI),
                pitch: rpy.pitch * (180 / Math.PI),
                yaw: rpy.yaw * (180 / Math.PI),
                angVelX: av.x, angVelY: av.y, angVelZ: av.z,
                linAccX: la.x, linAccY: la.y, linAccZ: la.z,
            });
        });

        /* ── /scan  ─────────────────────────────────────────────────────────── */
        this._sub('/scan', 'sensor_msgs/LaserScan', msg => {
            this._emit('scan', {
                ranges: msg.ranges,
                angleMin: msg.angle_min,
                angleIncrement: msg.angle_increment,
                rangeMin: msg.range_min,
                rangeMax: msg.range_max,
            });
        });

        /* ── /cmd_vel  ──────────────────────────────────────────────────────── */
        this._sub('/cmd_vel', 'geometry_msgs/Twist', msg => {
            this._emit('cmdvel', {
                linearX: msg.linear.x,
                linearY: msg.linear.y,
                angularZ: msg.angular.z,
            });
        });

        /* ── /odom  ─────────────────────────────────────────────────────────── */
        this._sub('/odom', 'nav_msgs/Odometry', msg => {
            const p = msg.pose.pose;
            const tv = msg.twist.twist;
            const q = p.orientation;
            const rpy = quatToRPY(q.x, q.y, q.z, q.w);
            this._emit('odom', {
                x: p.position.x,
                y: p.position.y,
                z: p.position.z,
                yaw: rpy.yaw * (180 / Math.PI),
                linearX: tv.linear.x,
                linearY: tv.linear.y,
                angularZ: tv.angular.z,
            });
        });

        /* ── /battery_state  ────────────────────────────────────────────────── */
        this._sub('/battery_state', 'sensor_msgs/BatteryState', msg => {
            // percentage 0.0–1.0 in ROS, multiply by 100
            const pct = (msg.percentage !== undefined && msg.percentage >= 0)
                ? msg.percentage * 100
                : null;
            if (pct !== null) this._emit('battery', { percentage: pct });
        });
    }
}

/* ─────────────────────────────────────── Helpers ────────────────────────── */

/**
 * Convert quaternion to Roll/Pitch/Yaw (radians).
 */
function quatToRPY(x, y, z, w) {
    // Roll (x-axis)
    const sinrCosp = 2 * (w * x + y * z);
    const cosrCosp = 1 - 2 * (x * x + y * y);
    const roll = Math.atan2(sinrCosp, cosrCosp);

    // Pitch (y-axis)
    const sinp = 2 * (w * y - z * x);
    const pitch = Math.abs(sinp) >= 1
        ? Math.sign(sinp) * Math.PI / 2
        : Math.asin(sinp);

    // Yaw (z-axis)
    const sinyCosp = 2 * (w * z + x * y);
    const cosyCosp = 1 - 2 * (y * y + z * z);
    const yaw = Math.atan2(sinyCosp, cosyCosp);

    return { roll, pitch, yaw };
}

/* Export singleton */
const rosBridge = new RosBridge();
