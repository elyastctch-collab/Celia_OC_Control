@echo off
title Celia OC Control Server
echo ====================================================
echo Starting Celia OC Control Dashboard...
echo Address: http://127.0.0.1:18790
echo ====================================================
start /b powershell -Command "Start-Sleep -Seconds 1.5; Start-Process 'http://127.0.0.1:18790'"
node dashboard/server.js

