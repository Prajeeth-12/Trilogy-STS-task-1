"""
EchoBridge STS Launcher
Entry point for PyInstaller packaging.
"""
import os
import sys
import socket
import webbrowser
import threading


def resource_path(relative_path: str) -> str:
    if hasattr(sys, '_MEIPASS'):
        return os.path.join(sys._MEIPASS, relative_path)
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), relative_path)


def find_free_port(start: int = 8000, end: int = 8010) -> int:
    for port in range(start, end + 1):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(('127.0.0.1', port))
                return port
            except OSError:
                continue
    return start


def open_browser(port: int):
    webbrowser.open(f"http://localhost:{port}")


def main():
    base = resource_path('.')
    os.chdir(base)

    # Add the base path to sys.path so uvicorn can find 'main'
    if base not in sys.path:
        sys.path.insert(0, base)

    port = find_free_port()
    print(f"EchoBridge STS starting on port {port}...")

    threading.Timer(2.0, open_browser, args=[port]).start()

    import uvicorn
    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=port,
        log_level="info",
    )


if __name__ == "__main__":
    main()
