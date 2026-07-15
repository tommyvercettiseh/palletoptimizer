from __future__ import annotations

import hashlib
import os
import queue
import socket
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path
import tkinter as tk
from tkinter import messagebox, ttk

ROOT = Path(__file__).resolve().parent
VENV = ROOT / ".venv"
REQUIREMENTS = ROOT / "requirements.txt"
PORT = 8000
LOCAL_URL = f"http://127.0.0.1:{PORT}"
HEALTH_URL = f"{LOCAL_URL}/api/health"


def base_python() -> Path:
    executable = Path(sys.executable)
    if os.name == "nt" and executable.name.lower() == "pythonw.exe":
        candidate = executable.with_name("python.exe")
        if candidate.exists():
            return candidate
    return executable


def venv_python() -> Path:
    if os.name == "nt":
        return VENV / "Scripts" / "python.exe"
    return VENV / "bin" / "python"


def requirements_fingerprint() -> str:
    return hashlib.sha256(REQUIREMENTS.read_bytes()).hexdigest()[:16]


def local_ip() -> str:
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.connect(("8.8.8.8", 80))
        ip = sock.getsockname()[0]
        sock.close()
        return ip
    except OSError:
        return "127.0.0.1"


def health_ok(timeout: float = 0.6) -> bool:
    try:
        with urllib.request.urlopen(HEALTH_URL, timeout=timeout) as response:
            return response.status == 200
    except Exception:
        return False


class Launcher(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("Pallet Insight Launcher")
        self.geometry("680x510")
        self.minsize(620, 470)
        self.configure(bg="#f4f7fb")
        self.protocol("WM_DELETE_WINDOW", self.close)

        self.server: subprocess.Popen[str] | None = None
        self.messages: queue.Queue[tuple[str, str]] = queue.Queue()
        self.starting = False
        self.network_url = f"http://{local_ip()}:{PORT}"

        self._configure_style()
        self._build_ui()
        self.after(100, self._drain_messages)
        self.after(250, self.start_app)

    def _configure_style(self) -> None:
        style = ttk.Style(self)
        try:
            style.theme_use("clam")
        except tk.TclError:
            pass
        style.configure("TButton", font=("Segoe UI", 10, "bold"), padding=(14, 10))
        style.configure("Primary.TButton", foreground="white", background="#2563eb", borderwidth=0)
        style.map("Primary.TButton", background=[("active", "#1d4ed8"), ("disabled", "#93b4f5")])
        style.configure("Secondary.TButton", foreground="#1e3a8a", background="#eaf1ff", borderwidth=0)
        style.map("Secondary.TButton", background=[("active", "#dbeafe")])
        style.configure("Danger.TButton", foreground="#9f1239", background="#fff1f2", borderwidth=0)
        style.map("Danger.TButton", background=[("active", "#ffe4e6")])

    def _build_ui(self) -> None:
        header = tk.Frame(self, bg="#2563eb", height=86)
        header.pack(fill="x")
        header.pack_propagate(False)
        tk.Label(header, text="▣", bg="#2563eb", fg="white", font=("Segoe UI", 28, "bold")).pack(side="left", padx=(24, 12))
        brand = tk.Frame(header, bg="#2563eb")
        brand.pack(side="left", pady=14)
        tk.Label(brand, text="Pallet Insight", bg="#2563eb", fg="white", font=("Segoe UI", 18, "bold")).pack(anchor="w")
        tk.Label(brand, text="Lokale palletoptimalisatie", bg="#2563eb", fg="#dbeafe", font=("Segoe UI", 9)).pack(anchor="w")

        content = tk.Frame(self, bg="#f4f7fb")
        content.pack(fill="both", expand=True, padx=22, pady=18)

        status_card = tk.Frame(content, bg="white", highlightbackground="#dbe3ef", highlightthickness=1)
        status_card.pack(fill="x")
        status_inner = tk.Frame(status_card, bg="white")
        status_inner.pack(fill="x", padx=18, pady=15)
        self.status_dot = tk.Label(status_inner, text="●", bg="white", fg="#f59e0b", font=("Segoe UI", 15))
        self.status_dot.pack(side="left", padx=(0, 10))
        status_text = tk.Frame(status_inner, bg="white")
        status_text.pack(side="left", fill="x", expand=True)
        self.status_label = tk.Label(status_text, text="Launcher voorbereiden…", bg="white", fg="#0f172a", font=("Segoe UI", 11, "bold"))
        self.status_label.pack(anchor="w")
        self.status_detail = tk.Label(status_text, text="De eerste start installeert automatisch de benodigde onderdelen.", bg="white", fg="#64748b", font=("Segoe UI", 9))
        self.status_detail.pack(anchor="w", pady=(2, 0))

        url_card = tk.Frame(content, bg="#eff6ff", highlightbackground="#bfdbfe", highlightthickness=1)
        url_card.pack(fill="x", pady=(12, 0))
        url_inner = tk.Frame(url_card, bg="#eff6ff")
        url_inner.pack(fill="x", padx=16, pady=12)
        tk.Label(url_inner, text="Op deze pc", bg="#eff6ff", fg="#1e3a8a", font=("Segoe UI", 9, "bold")).grid(row=0, column=0, sticky="w")
        tk.Label(url_inner, text=LOCAL_URL, bg="#eff6ff", fg="#0f172a", font=("Consolas", 10)).grid(row=1, column=0, sticky="w", pady=(2, 0))
        tk.Label(url_inner, text="Op telefoon via dezelfde wifi", bg="#eff6ff", fg="#1e3a8a", font=("Segoe UI", 9, "bold")).grid(row=0, column=1, sticky="w", padx=(40, 0))
        tk.Label(url_inner, text=self.network_url, bg="#eff6ff", fg="#0f172a", font=("Consolas", 10)).grid(row=1, column=1, sticky="w", padx=(40, 0), pady=(2, 0))
        url_inner.columnconfigure(0, weight=1)
        url_inner.columnconfigure(1, weight=1)

        buttons = tk.Frame(content, bg="#f4f7fb")
        buttons.pack(fill="x", pady=(14, 12))
        self.start_button = ttk.Button(buttons, text="Start app", style="Primary.TButton", command=self.start_app)
        self.start_button.pack(side="left")
        self.open_button = ttk.Button(buttons, text="Open in browser", style="Secondary.TButton", command=self.open_browser, state="disabled")
        self.open_button.pack(side="left", padx=8)
        ttk.Button(buttons, text="Open map", style="Secondary.TButton", command=self.open_folder).pack(side="left")
        self.stop_button = ttk.Button(buttons, text="Stop", style="Danger.TButton", command=self.stop_server, state="disabled")
        self.stop_button.pack(side="right")

        tk.Label(content, text="Activiteit", bg="#f4f7fb", fg="#334155", font=("Segoe UI", 9, "bold")).pack(anchor="w")
        log_frame = tk.Frame(content, bg="#0f172a")
        log_frame.pack(fill="both", expand=True, pady=(6, 0))
        self.log = tk.Text(log_frame, bg="#0f172a", fg="#dbeafe", insertbackground="white", relief="flat", font=("Consolas", 9), padx=12, pady=10, wrap="word", state="disabled")
        self.log.pack(fill="both", expand=True)

    def write_log(self, text: str) -> None:
        self.messages.put(("log", text.rstrip()))

    def set_status(self, title: str, detail: str, state: str = "busy") -> None:
        self.messages.put(("status", "\t".join((title, detail, state))))

    def _drain_messages(self) -> None:
        try:
            while True:
                kind, payload = self.messages.get_nowait()
                if kind == "log":
                    self.log.configure(state="normal")
                    self.log.insert("end", payload + "\n")
                    self.log.see("end")
                    self.log.configure(state="disabled")
                elif kind == "status":
                    title, detail, state = payload.split("\t", 2)
                    self.status_label.configure(text=title)
                    self.status_detail.configure(text=detail)
                    color = {"ready": "#16a34a", "error": "#e11d48", "stopped": "#64748b"}.get(state, "#f59e0b")
                    self.status_dot.configure(fg=color)
                    ready = state == "ready"
                    self.open_button.configure(state="normal" if ready else "disabled")
                    self.stop_button.configure(state="normal" if ready else "disabled")
                    self.start_button.configure(state="disabled" if state == "busy" or ready else "normal")
        except queue.Empty:
            pass
        self.after(100, self._drain_messages)

    def start_app(self) -> None:
        if self.starting:
            return
        if health_ok():
            self.set_status("App is al actief", LOCAL_URL, "ready")
            self.open_browser()
            return
        self.starting = True
        self.start_button.configure(state="disabled")
        threading.Thread(target=self._bootstrap_and_start, daemon=True).start()

    def _bootstrap_and_start(self) -> None:
        try:
            self.set_status("Omgeving controleren…", "Python en pakketten worden gecontroleerd.")
            python = venv_python()
            if not python.exists():
                self.write_log("Virtuele Python-omgeving aanmaken…")
                subprocess.run([str(base_python()), "-m", "venv", str(VENV)], cwd=ROOT, check=True)

            marker = VENV / f".requirements-{requirements_fingerprint()}"
            if not marker.exists():
                self.set_status("Onderdelen installeren…", "Dit gebeurt alleen bij de eerste start of na een update.")
                self.write_log("Benodigde Python-pakketten installeren…")
                command = [str(python), "-m", "pip", "install", "--disable-pip-version-check", "-r", str(REQUIREMENTS)]
                process = subprocess.Popen(command, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace")
                assert process.stdout is not None
                for line in process.stdout:
                    self.write_log(line)
                if process.wait() != 0:
                    raise RuntimeError("Installatie van Python-pakketten is mislukt.")
                for old_marker in VENV.glob(".requirements-*"):
                    old_marker.unlink(missing_ok=True)
                marker.write_text("ok", encoding="utf-8")

            self.set_status("Server starten…", "Pallet Insight wordt lokaal geopend.")
            self.write_log(f"Server starten op 0.0.0.0:{PORT}…")
            creationflags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
            self.server = subprocess.Popen(
                [str(python), "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", str(PORT)],
                cwd=ROOT,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                creationflags=creationflags,
            )
            threading.Thread(target=self._read_server_output, daemon=True).start()

            deadline = time.time() + 30
            while time.time() < deadline:
                if self.server.poll() is not None:
                    raise RuntimeError("De lokale server stopte onverwacht.")
                if health_ok():
                    self.set_status("Pallet Insight is actief", f"Open op deze pc of gebruik {self.network_url} op je telefoon.", "ready")
                    self.write_log("App is klaar.")
                    self.after(0, self.open_browser)
                    return
                time.sleep(.35)
            raise RuntimeError("De server reageerde niet binnen 30 seconden.")
        except Exception as exc:
            self.write_log(f"FOUT: {exc}")
            self.set_status("Starten mislukt", str(exc), "error")
            self.after(0, lambda: messagebox.showerror("Pallet Insight", str(exc)))
        finally:
            self.starting = False

    def _read_server_output(self) -> None:
        process = self.server
        if not process or not process.stdout:
            return
        for line in process.stdout:
            self.write_log(line)
        if process.poll() is not None and not self.starting:
            self.set_status("Server is gestopt", "Klik op Start app om opnieuw te starten.", "stopped")

    def open_browser(self) -> None:
        webbrowser.open(LOCAL_URL)

    def open_folder(self) -> None:
        if os.name == "nt":
            os.startfile(ROOT)  # type: ignore[attr-defined]
        elif sys.platform == "darwin":
            subprocess.Popen(["open", str(ROOT)])
        else:
            subprocess.Popen(["xdg-open", str(ROOT)])

    def stop_server(self) -> None:
        if self.server and self.server.poll() is None:
            self.write_log("Server stoppen…")
            self.server.terminate()
            try:
                self.server.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.server.kill()
            self.server = None
        self.set_status("Server is gestopt", "Klik op Start app om opnieuw te starten.", "stopped")

    def close(self) -> None:
        self.stop_server()
        self.destroy()


if __name__ == "__main__":
    Launcher().mainloop()
