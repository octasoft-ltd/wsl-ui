#!/usr/bin/env bash
set -Eeuo pipefail

DEFAULT_PORT=3390

info() { printf '[INFO] %s\n' "$*"; }
warn() { printf '[WARN] %s\n' "$*" >&2; }
fail() { printf '[ERROR] %s\n' "$*" >&2; exit 1; }

run_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  else
    sudo "$@"
  fi
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

is_systemd_pid1() {
  [ "$(cat /proc/1/comm 2>/dev/null || true)" = "systemd" ]
}

read_xrdp_port() {
  awk -F= '/^[[:space:]]*port=/{gsub(/[[:space:]]/,"",$2); print $2; exit}' /etc/xrdp/xrdp.ini 2>/dev/null || true
}

port_in_use() {
  local port="$1"
  ss -tln 2>/dev/null | awk '{print $4}' | grep -Eq "[:.]${port}$"
}

choose_port() {
  local preferred="$1"
  local port="$preferred"
  while port_in_use "$port"; do
    port=$((port + 1))
  done
  printf '%s\n' "$port"
}

set_xrdp_port() {
  local port="$1"
  run_root test -f /etc/xrdp/xrdp.ini || fail "/etc/xrdp/xrdp.ini not found"
  run_root sed -i -E "0,/^[[:space:]]*port=.*/s//port=${port}/" /etc/xrdp/xrdp.ini
}

enable_xorg_session_in_xrdp() {
  run_root sed -i '/^#\[Xorg\]$/,/^#code=/{s/^#//}' /etc/xrdp/xrdp.ini
}

fix_x11_socket() {
  if [ -L /tmp/.X11-unix ]; then
    info "Replacing /tmp/.X11-unix symlink with a real directory"
    run_root rm -f /tmp/.X11-unix
  fi
  run_root mkdir -p /tmp/.X11-unix
  run_root chmod 1777 /tmp/.X11-unix
}

ensure_password_set() {
  local status
  status="$(passwd -S "$(id -un)" 2>/dev/null | awk '{print $2}' || true)"
  if [ "$status" = "NP" ] || [ "$status" = "L" ] || [ "$status" = "LK" ]; then
    warn "Your Linux user does not have a usable password. XRDP login needs one."
    run_root passwd "$(id -un)"
  fi
}

start_xrdp() {
  start_xrdp_no_systemd() {
    if command -v service >/dev/null 2>&1; then
      run_root service xrdp restart && return
    fi

    if [ -x /etc/init.d/xrdp ]; then
      run_root /etc/init.d/xrdp restart && return
    fi

    local xrdp_bin sesman_bin
    xrdp_bin="$(command -v xrdp || true)"
    sesman_bin="$(command -v xrdp-sesman || true)"
    if [ -n "$xrdp_bin" ] && [ -n "$sesman_bin" ]; then
      if command -v pkill >/dev/null 2>&1; then
        run_root pkill -x xrdp >/dev/null 2>&1 || true
        run_root pkill -x xrdp-sesman >/dev/null 2>&1 || true
      fi
      run_root "$sesman_bin"
      run_root "$xrdp_bin"
      return
    fi

    fail "Could not start xrdp without systemd (missing service/init tools and xrdp binaries)."
  }

  if is_systemd_pid1; then
    if run_root systemctl list-unit-files --type=service 2>/dev/null | grep -q '^xrdp-sesman\.service'; then
      run_root systemctl enable xrdp xrdp-sesman --now
    else
      run_root systemctl enable xrdp --now
    fi
    run_root systemctl restart xrdp
  else
    warn "systemd is not PID 1. Starting xrdp for this session only."
    start_xrdp_no_systemd
    warn "Enable systemd in /etc/wsl.conf for reliable auto-start:"
    warn "[boot]"
    warn "systemd=true"
  fi
}

install_xfce() {
  if run_root dnf -y group install xfce-desktop; then
    return
  fi
  if run_root dnf -y install @xfce-desktop-environment; then
    return
  fi
  run_root dnf -y group install "Xfce Desktop"
}

main() {
  [ "$(id -u)" -ne 0 ] || fail "Run this script as your regular WSL user, not root."

  require_cmd sudo
  require_cmd dnf
  require_cmd sed
  require_cmd ss

  info "Installing Fedora XFCE desktop"
  install_xfce

  info "Installing XRDP packages"
  run_root dnf -y install xrdp xorgxrdp

  local current_port preferred_port target_port
  current_port="$(read_xrdp_port)"
  if [[ "$current_port" =~ ^[0-9]+$ ]] && [ "$current_port" -ne 3389 ]; then
    preferred_port="$current_port"
  else
    preferred_port="$DEFAULT_PORT"
  fi
  target_port="$(choose_port "$preferred_port")"
  set_xrdp_port "$target_port"
  if [ "$target_port" != "$preferred_port" ]; then
    warn "Port $preferred_port is in use. Switched XRDP to $target_port."
  fi

  enable_xorg_session_in_xrdp

  cat > "$HOME/.xsession" <<'EOF'
#!/bin/bash
startxfce4
EOF
  chmod +x "$HOME/.xsession"

  fix_x11_socket
  ensure_password_set
  start_xrdp

  if ! pgrep -x xrdp >/dev/null 2>&1; then
    warn "xrdp process not detected. Check: sudo journalctl -u xrdp -u xrdp-sesman --no-pager | tail -50"
  fi

  if ! ss -tln 2>/dev/null | awk '{print $4}' | grep -Eq "[:.]${target_port}$"; then
    warn "Nothing is listening on port $target_port yet."
  fi

  info "Setup complete. Connect with: mstsc -> localhost:$target_port"
  info "At XRDP login, choose session type: Xorg"
  info "To avoid idle disconnects, set this in %USERPROFILE%\\.wslconfig and run 'wsl --shutdown':"
  printf '[general]\ninstanceIdleTimeout=-1\n[wsl2]\nvmIdleTimeout=-1\n'
}

main "$@"
