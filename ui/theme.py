"""
ui/theme.py - Color constants, CTk setup, and shared UI helpers.
"""
import os
import subprocess
import customtkinter as ctk

# ─────────────────────────────────────────────
# Theme — Light Mode (soothing)
# ─────────────────────────────────────────────
ACCENT       = "#5B4FCF"   # indigo
ACCENT_HOVER = "#4A40B8"
SUCCESS      = "#0B9E6E"   # teal-green
WARNING      = "#B45309"   # amber-brown
DANGER       = "#DC2626"   # red
CARD_BG      = "#F2F4F8"   # light blue-gray page
SURFACE      = "#FFFFFF"   # white panels
SURFACE2     = "#E8EAF0"   # slightly darker panel
TEXT         = "#1A1A2E"   # near-black
TEXT_DIM     = "#5A6070"   # muted gray

ctk.set_appearance_mode("light")
ctk.set_default_color_theme("blue")


def center_window(win, w: int, h: int):
    """Center a Toplevel window on screen."""
    win.update_idletasks()
    sw = win.winfo_screenwidth()
    sh = win.winfo_screenheight()
    x = (sw - w) // 2
    y = (sh - h) // 2
    win.geometry(f"{w}x{h}+{x}+{y}")


def win_toast(title: str, message: str):
    """Show a Windows balloon toast notification (non-blocking)."""
    try:
        safe_title = title.replace("'", "")
        safe_msg   = message.replace("'", "")
        script = (
            "Add-Type -AssemblyName System.Windows.Forms; "
            "$n = New-Object System.Windows.Forms.NotifyIcon; "
            "$n.Icon = [System.Drawing.SystemIcons]::Information; "
            f"$n.BalloonTipTitle = '{safe_title}'; "
            f"$n.BalloonTipText = '{safe_msg}'; "
            "$n.Visible = $True; "
            "$n.ShowBalloonTip(5000); "
            "Start-Sleep -Seconds 6; "
            "$n.Dispose()"
        )
        subprocess.Popen(
            ["powershell", "-WindowStyle", "Hidden", "-Command", script],
            creationflags=0x08000000
        )
    except Exception:
        pass


def get_image_files(folder: str):
    """Return sorted list of image files in folder."""
    exts = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}
    files = []
    for f in os.listdir(folder):
        if os.path.splitext(f)[1].lower() in exts:
            files.append(os.path.join(folder, f))
    return sorted(files)
