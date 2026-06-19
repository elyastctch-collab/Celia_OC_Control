// app.js
// Frontend Logic for OpenClaw Management Dashboard
// Created by Celia for Darling

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const powerToggle = document.getElementById('power-toggle');
    const gatewayStatusBadge = document.getElementById('gateway-status-badge');
    const openWebBtn = document.getElementById('open-web-btn');
    const modelRadios = document.querySelectorAll('name[model-select], input[name="model-select"]');
    const connectionStatusDot = document.getElementById('connection-status-dot');
    const connectionStatusText = document.getElementById('connection-status-text');
    const logTerminal = document.getElementById('log-terminal');
    const autoscrollToggle = document.getElementById('autoscroll-toggle');
    const clearLogBtn = document.getElementById('clear-log-btn');
    const loadingOverlay = document.getElementById('loading-overlay');
    const loadingText = document.getElementById('loading-text');

    let currentToken = '';
    let isTransitioning = false;
    let sseSource = null;
    let autoOpenedTab = false;

    // Helper: Show/Hide Loading Overlay
    function showLoading(text) {
        loadingText.textContent = text;
        loadingOverlay.classList.remove('hidden');
    }

    function hideLoading() {
        loadingOverlay.classList.add('hidden');
    }

    // Helper: Add log line to terminal
    function appendLog(text) {
        if (!text) return;
        const line = document.createElement('div');
        line.className = 'log-line';

        if (text.includes('[System]')) {
            line.classList.add('system-line');
        } else if (text.includes('[error]') || text.includes('failed') || text.includes('Error:')) {
            line.classList.add('error-line');
        } else if (text.includes('listening') || text.includes('ready') || text.includes('pre-warmed')) {
            line.classList.add('success-line');
        } else if (text.includes('[ws]') || text.includes('connected')) {
            line.classList.add('info-line');
        }

        line.textContent = text;
        logTerminal.appendChild(line);

        if (autoscrollToggle.checked) {
            logTerminal.scrollTop = logTerminal.scrollHeight;
        }
    }

    // 1. Fetch System Status
    async function updateStatus() {
        try {
            const res = await fetch('/api/status');
            const data = await res.json();

            connectionStatusDot.className = 'status-dot connected';
            connectionStatusText.textContent = 'Đã kết nối Dashboard Server';

            currentToken = data.token;
            const isRunning = data.gateway.running;

            if (!isTransitioning) {
                powerToggle.disabled = false;
                powerToggle.checked = isRunning;

                if (isRunning) {
                    gatewayStatusBadge.textContent = 'ĐANG CHẠY';
                    gatewayStatusBadge.className = 'badge badge-on';
                    openWebBtn.disabled = false;

                    // Auto-open Web UI in a new tab if newly started
                    if (!autoOpenedTab && currentToken) {
                        autoOpenedTab = true;
                        appendLog('[System] Gateway Online! Tự động mở Web chính trong tab mới...');
                        window.open(`http://127.0.0.1:18789/?token=${currentToken}`, '_blank');
                    }
                } else {
                    gatewayStatusBadge.textContent = 'ĐANG TẮT';
                    gatewayStatusBadge.className = 'badge badge-off';
                    openWebBtn.disabled = true;
                    autoOpenedTab = false;
                }

                // Update selected model
                modelRadios.forEach(radio => {
                    radio.disabled = false;
                    if (radio.value === data.model) {
                        radio.checked = true;
                    }
                });
            }
        } catch (e) {
            connectionStatusDot.className = 'status-dot disconnected';
            connectionStatusText.textContent = 'Mất kết nối với Dashboard Server';
            powerToggle.disabled = true;
            openWebBtn.disabled = true;
            modelRadios.forEach(radio => radio.disabled = true);
        }
    }

    // 2. Connect to SSE Log stream
    function connectLogs() {
        if (sseSource) {
            sseSource.close();
        }

        sseSource = new EventSource('/api/logs');

        sseSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                appendLog(data.log);
            } catch (e) {
                // Ignore
            }
        };

        sseSource.onerror = () => {
            appendLog('[System] Lỗi kết nối luồng Log. Đang thử kết nối lại...');
            sseSource.close();
            setTimeout(connectLogs, 3000);
        };
    }

    // 3. Event Listeners: Power Toggle
    powerToggle.addEventListener('change', async () => {
        const action = powerToggle.checked ? 'start' : 'stop';
        const actionText = action === 'start' ? 'Khởi chạy Gateway...' : 'Đang tắt Gateway...';
        
        isTransitioning = true;
        powerToggle.disabled = true;
        showLoading(actionText);

        if (action === 'start') {
            gatewayStatusBadge.textContent = 'ĐANG KHỞI CHẠY...';
            gatewayStatusBadge.className = 'badge badge-loading';
            autoOpenedTab = false;
        } else {
            gatewayStatusBadge.textContent = 'ĐANG DỪNG...';
            gatewayStatusBadge.className = 'badge badge-loading';
        }

        try {
            const res = await fetch('/api/toggle', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: action })
            });
            const data = await res.json();
            
            if (!data.success) {
                appendLog(`[System] Lỗi: ${data.error}`);
            }
        } catch (e) {
            appendLog(`[System] Lỗi kết nối API: ${e.message}`);
        }

        setTimeout(() => {
            isTransitioning = false;
            hideLoading();
            updateStatus();
        }, 2000);
    });

    // 4. Event Listeners: Open Web UI Button
    openWebBtn.addEventListener('click', () => {
        if (currentToken) {
            window.open(`http://127.0.0.1:18789/?token=${currentToken}`, '_blank');
        } else {
            appendLog('[System] Không tìm thấy Token xác thực. Hãy kiểm tra trạng thái.');
        }
    });

    // 5. Event Listeners: Model Selection
    modelRadios.forEach(radio => {
        radio.addEventListener('change', async () => {
            const targetModel = radio.value;
            const modelName = radio.parentElement.querySelector('.model-title').textContent;
            
            isTransitioning = true;
            showLoading(`Đang chuyển mô hình sang: ${modelName}...`);
            
            try {
                const res = await fetch('/api/switch-model', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ model: targetModel })
                });
                const data = await res.json();

                if (!data.success) {
                    appendLog(`[System] Lỗi chuyển mô hình: ${data.error}`);
                }
            } catch (e) {
                appendLog(`[System] Lỗi kết nối: ${e.message}`);
            }

            setTimeout(() => {
                isTransitioning = false;
                hideLoading();
                updateStatus();
            }, 3000);
        });
    });

    // 6. Terminal Actions
    clearLogBtn.addEventListener('click', () => {
        logTerminal.innerHTML = '';
        appendLog('[System] Màn hình log đã được xóa.');
    });

    // Initializations
    connectLogs();
    updateStatus();

    // Polling System Status every 2 seconds
    setInterval(updateStatus, 2000);
});
