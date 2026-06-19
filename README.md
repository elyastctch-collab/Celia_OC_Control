# Celia OC Control — Bộ mã nguồn điều khiển OpenClaw linh hoạt

**Celia OC Control** là một bộ mã nguồn Dashboard quản lý độc lập, trực quan và hiện đại dành cho **OpenClaw** (hệ thống chạy AI Agent cục bộ). 

Dự án này tích hợp sẵn cấu trúc OpenClaw mẫu và bảng điều khiển Web UI tinh tế, hỗ trợ Darling/người dùng tắt bật hệ thống và chuyển đổi linh hoạt giữa các mô hình ngôn ngữ lớn (LLM) mã nguồn mở mạnh mẽ mà không cần gõ lệnh thủ công trong CMD.

---

## ✨ Tính năng nổi bật

1. **Bật/Tắt OpenClaw bằng một lần gạt:** Một thanh gạt nguồn chính (Power Switch) trực quan để khởi động hoặc chấm dứt tiến trình OpenClaw Gateway đang chạy ngầm.
2. **Tự động mở Web chính:** Khi gạt bật nguồn thành công, Dashboard sẽ tự động mở trang giao diện tương tác chính của OpenClaw (`port 18789` kèm Token bảo mật) trên một tab trình duyệt mới.
3. **Chuyển đổi mô hình lập tức:** Hỗ trợ gạt chọn nhanh giữa các mô hình phổ biến (Poolside Laguna, GPT-OSS, Kimi, Gemini, Nemotron, GLM...). Hệ thống sẽ tự động cập nhật cấu hình `openclaw.json` và restart Gateway ngầm trong 2 giây để áp dụng.
4. **Màn hình Log Realtime:** Stream logs hoạt động thời gian thực từ OpenClaw lên màn hình console mô phỏng terminal cực đẹp với hiệu ứng Glassmorphism và Neon Glow cao cấp.

---

## 📂 Cấu trúc mã nguồn

- `dashboard/`: Chứa mã nguồn Web Server Node.js (cổng `18790`) và giao diện tĩnh (HTML/CSS/JS).
- `openclaw/`: Chứa thư mục cấu hình và workspace mẫu sạch của OpenClaw (không chứa khóa API nhạy cảm và nhân cách riêng tư).
  - `openclaw.json`: File cấu hình OpenClaw mẫu.
  - `.env`: File chứa các biến môi trường (API Keys).
  - `workspace/`: Thư mục chứa các tệp định nghĩa nhân cách mẫu (`IDENTITY.md`, `SOUL.md`) và script đổi mô hình (`switch_model.ps1`).

---

## 🛠️ Hướng dẫn cài đặt và sử dụng

### 1. Yêu cầu hệ thống
- Máy tính đã cài sẵn **Node.js** (phiên bản 18 trở lên).
- Đã cài đặt **OpenClaw** toàn cục thông qua npm:
  ```bash
  npm install -g openclaw
  ```

### 2. Thiết lập cấu hình ban đầu
1. Mở file [openclaw/.env](openclaw/.env) và điền các khóa API của bạn vào (ví dụ: `OPENROUTER_API_KEY`, `GEMINI_API_KEY`).
2. Mở file [openclaw/openclaw.json](openclaw/openclaw.json) và thay đổi token bảo mật của bạn tại trường `"token": "YOUR_SECURE_TOKEN_HERE"`.

### 3. Khởi chạy
1. Click đúp vào file `start.bat` (hoặc chạy lệnh `node dashboard/server.js` trong thư mục `dashboard`) để khởi động Dashboard Server.
2. Mở trình duyệt và truy cập địa chỉ: **`http://127.0.0.1:18790`**
3. Gạt nút nguồn để kích hoạt OpenClaw và bắt đầu trải nghiệm!
