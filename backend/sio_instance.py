"""
Singleton Socket.IO server instance.

Defined here (not in main.py) so that routers that need to emit
real-time events can import `sio` without circular dependencies.
"""
import socketio

sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins=['http://localhost:3000', 'http://127.0.0.1:3000', '*']
)
