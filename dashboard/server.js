// server.js
// Standalone OpenClaw Management Dashboard Server (Distribution Version)
// Compatible with any system with node & openclaw installed

const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');

const PORT = 18790;

// Resolve relative paths for distribution
const OPENCLAW_DIR = path.join(__dirname, '..', 'openclaw');
const OPENCLAW_JSON_PATH = path.join(OPENCLAW_DIR, 'openclaw.json');
const LOG_DIR = path.join(process.env.LOCALAPPDATA || 'C:\\Users\\Admin\\AppData\\Local', 'Temp', 'openclaw');

let sseClients = [];

// Helper: Run PowerShell commands and return output
function runPowerShell(command) {
    return new Promise((resolve, reject) => {
        exec(`powershell -Command "${command.replace(/"/g, '\\"')}"`, (error, stdout, stderr) => {
            if (error) {
                resolve({ success: false, error: stderr || error.message });
            } else {
                resolve({ success: true, output: stdout.trim() });
            }
        });
    });
}

// Helper: Check if OpenClaw Gateway is currently running (listening on port 18789)
async function getGatewayStatus() {
    const checkPortCmd = 'Get-NetTCPConnection -LocalPort 18789 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess';
    const res = await runPowerShell(checkPortCmd);
    if (res.success && res.output) {
        const pid = parseInt(res.output, 10);
        if (!isNaN(pid)) {
            return { running: true, pid: pid };
        }
    }
    return { running: false, pid: null };
}

// Helper: Get the latest log file path from OpenClaw temp directory
function getLatestLogFile() {
    try {
        if (!fs.existsSync(LOG_DIR)) return null;
        const files = fs.readdirSync(LOG_DIR);
        const logFiles = files.filter(f => f.startsWith('openclaw-') && f.endsWith('.log'));
        if (logFiles.length === 0) return null;
        
        logFiles.sort();
        return path.join(LOG_DIR, logFiles[logFiles.length - 1]);
    } catch (e) {
        console.error('Error finding log file:', e);
        return null;
    }
}

// Broadcast logs to all connected SSE clients
function broadcastLog(line) {
    const formattedData = `data: ${JSON.stringify({ log: line })}\n\n`;
    sseClients.forEach(client => {
        try {
            client.write(formattedData);
        } catch (e) {
            // Client closed
        }
    });
}

// Tail the latest log file and broadcast additions
let lastSize = 0;
let currentLogPath = getLatestLogFile();

if (currentLogPath && fs.existsSync(currentLogPath)) {
    lastSize = fs.statSync(currentLogPath).size;
}

setInterval(() => {
    const latestLog = getLatestLogFile();
    if (!latestLog) return;

    if (latestLog !== currentLogPath) {
        currentLogPath = latestLog;
        lastSize = fs.existsSync(currentLogPath) ? fs.statSync(currentLogPath).size : 0;
        broadcastLog(`[System] Switched to new log file: ${path.basename(currentLogPath)}`);
    }

    if (fs.existsSync(currentLogPath)) {
        const stats = fs.statSync(currentLogPath);
        if (stats.size > lastSize) {
            const stream = fs.createReadStream(currentLogPath, {
                start: lastSize,
                end: stats.size - 1
            });
            stream.on('data', (chunk) => {
                const lines = chunk.toString().split('\n');
                lines.forEach(line => {
                    const cleanLine = line.trim();
                    if (cleanLine) {
                        broadcastLog(cleanLine);
                    }
                });
            });
            lastSize = stats.size;
        }
    }
}, 500);

// Request Router
const server = http.createServer(async (req, res) => {
    const url = req.url;
    const method = req.method;

    // CORS Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // 1. SSE Endpoint for Realtime Logs
    if (url === '/api/logs' && method === 'GET') {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        });
        
        res.write(`data: ${JSON.stringify({ log: `[System] Connected to Dashboard Realtime Log Server. Listening to: ${currentLogPath ? path.basename(currentLogPath) : 'None'}` })}\n\n`);
        
        sseClients.push(res);
        req.on('close', () => {
            sseClients = sseClients.filter(c => c !== res);
        });
        return;
    }

    // 2. API: Get System Status
    if (url === '/api/status' && method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        const gatewayState = await getGatewayStatus();
        let currentModel = 'unknown';
        let token = '';

        try {
            if (fs.existsSync(OPENCLAW_JSON_PATH)) {
                const config = JSON.parse(fs.readFileSync(OPENCLAW_JSON_PATH, 'utf8'));
                currentModel = config.agents.defaults.model.primary || 'unknown';
                token = config.gateway.auth.token || '';
            }
        } catch (e) {
            console.error('Error reading config:', e);
        }

        res.end(JSON.stringify({
            gateway: gatewayState,
            model: currentModel,
            token: token
        }));
        return;
    }

    // 3. API: Toggle Gateway (Start/Stop)
    if (url === '/api/toggle' && method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            const data = JSON.parse(body || '{}');
            const action = data.action;
            const gatewayState = await getGatewayStatus();

            if (action === 'start') {
                if (gatewayState.running) {
                    res.end(JSON.stringify({ success: true, message: 'Gateway already running.' }));
                    return;
                }

                try {
                    const outLog = fs.openSync(path.join(__dirname, 'gateway.stdout.log'), 'w');
                    const errLog = fs.openSync(path.join(__dirname, 'gateway.stderr.log'), 'w');

                    // Run globally linked openclaw command via shell
                    const child = spawn('openclaw', ['gateway'], {
                        detached: true,
                        shell: true,
                        stdio: ['ignore', outLog, errLog]
                    });
                    child.unref();

                    broadcastLog('[System] Starting OpenClaw Gateway process...');
                    res.end(JSON.stringify({ success: true, message: 'Gateway start signal sent.' }));

                    // Automatically open browser from backend to bypass popup blocker
                    setTimeout(() => {
                        let token = '';
                        try {
                            if (fs.existsSync(OPENCLAW_JSON_PATH)) {
                                const config = JSON.parse(fs.readFileSync(OPENCLAW_JSON_PATH, 'utf8'));
                                token = config.gateway.auth.token || '';
                            }
                        } catch (e) {
                            console.error('Error reading config for auto-open:', e);
                        }
                        const url = `http://127.0.0.1:18789/${token ? '?token=' + token : ''}`;
                        exec(`start "" "${url}"`, (err) => {
                            if (err) {
                                console.error('Failed to auto-open browser from server:', err);
                            } else {
                                broadcastLog('[System] Dashboard Server đã tự động mở giao diện OpenClaw trên trình duyệt.');
                            }
                        });
                    }, 2000);

                } catch (e) {
                    res.end(JSON.stringify({ success: false, error: e.message }));
                }
            } else if (action === 'stop') {
                if (!gatewayState.running) {
                    res.end(JSON.stringify({ success: true, message: 'Gateway already stopped.' }));
                    return;
                }

                broadcastLog(`[System] Stopping Gateway process (PID ${gatewayState.pid})...`);
                const killCmd = `Stop-Process -Id ${gatewayState.pid} -Force`;
                const killRes = await runPowerShell(killCmd);

                if (killRes.success) {
                    res.end(JSON.stringify({ success: true, message: 'Gateway stopped successfully.' }));
                } else {
                    res.end(JSON.stringify({ success: false, error: killRes.error }));
                }
            } else {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Invalid action.' }));
            }
        });
        return;
    }

    // 4. API: Switch Model
    if (url === '/api/switch-model' && method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            const data = JSON.parse(body || '{}');
            const targetModel = data.model;

            if (!targetModel) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Model parameter missing.' }));
                return;
            }

            broadcastLog(`[System] Switching primary model to: ${targetModel}`);

            // Update openclaw.json
            try {
                if (fs.existsSync(OPENCLAW_JSON_PATH)) {
                    const config = JSON.parse(fs.readFileSync(OPENCLAW_JSON_PATH, 'utf8'));
                    config.agents.defaults.model.primary = targetModel;
                    fs.writeFileSync(OPENCLAW_JSON_PATH, JSON.stringify(config, null, 4), 'utf8');
                    broadcastLog('[System] Config file updated successfully.');
                } else {
                    res.end(JSON.stringify({ success: false, error: 'Config file openclaw.json not found.' }));
                    return;
                }
            } catch (e) {
                res.end(JSON.stringify({ success: false, error: `Config update failed: ${e.message}` }));
                return;
            }

            // Restart Gateway if active
            const gatewayState = await getGatewayStatus();
            if (gatewayState.running) {
                broadcastLog(`[System] Restarting gateway to apply model changes (stopping PID ${gatewayState.pid})...`);
                const killCmd = `Stop-Process -Id ${gatewayState.pid} -Force`;
                const killRes = await runPowerShell(killCmd);

                if (killRes.success) {
                    setTimeout(() => {
                        try {
                            const outLog = fs.openSync(path.join(__dirname, 'gateway.stdout.log'), 'a');
                            const errLog = fs.openSync(path.join(__dirname, 'gateway.stderr.log'), 'a');
                            const child = spawn('openclaw', ['gateway'], {
                                detached: true,
                                shell: true,
                                stdio: ['ignore', outLog, errLog]
                            });
                            child.unref();
                            broadcastLog('[System] Gateway restarted with new model.');
                        } catch (e) {
                            broadcastLog(`[System] Error restarting gateway: ${e.message}`);
                        }
                    }, 1000);
                }
            }

            res.end(JSON.stringify({ success: true, message: 'Model switch requested.' }));
        });
        return;
    }

    // Host Static Files (public/)
    let filePath = path.join(__dirname, 'public', url === '/' ? 'index.html' : url);
    const extname = path.extname(filePath);
    let contentType = 'text/html';

    switch (extname) {
        case '.js': contentType = 'text/javascript'; break;
        case '.css': contentType = 'text/css'; break;
        case '.json': contentType = 'application/json'; break;
        case '.png': contentType = 'image/png'; break;
        case '.jpg': contentType = 'image/jpg'; break;
    }

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404);
                res.end('File Not Found');
            } else {
                res.writeHead(500);
                res.end(`Server Error: ${err.code}`);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server running at http://127.0.0.1:${PORT}`);
});
