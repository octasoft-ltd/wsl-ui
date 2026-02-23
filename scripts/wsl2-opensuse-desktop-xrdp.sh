#!/usr/bin/env bash
set -Eeuo pipefail

DEFAULT_PORT=3390
INTERNAL_MODE="${1:-}"

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
    if run_root systemctl list-unit-files --type=service 2>/dev/null | grep -q '^lightdm\.service'; then
      run_root systemctl disable lightdm || true
    fi

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

set_wsl_default_user() {
  local target_user="$1"
  if [ ! -f /etc/wsl.conf ]; then
    printf '[user]\ndefault=%s\n' "$target_user" > /etc/wsl.conf
    return
  fi

  if grep -Eq '^[[:space:]]*default[[:space:]]*=' /etc/wsl.conf; then
    sed -i -E "s|^[[:space:]]*default[[:space:]]*=.*|default=${target_user}|" /etc/wsl.conf
    if ! grep -Eq '^[[:space:]]*\[user\]' /etc/wsl.conf; then
      printf '\n[user]\ndefault=%s\n' "$target_user" >> /etc/wsl.conf
    fi
  else
    printf '\n[user]\ndefault=%s\n' "$target_user" >> /etc/wsl.conf
  fi
}

bootstrap_user_if_needed() {
  if [ "$(id -u)" -ne 0 ] || [ "$INTERNAL_MODE" = "--as-user" ]; then
    return
  fi

  local target_user="${WSL_SETUP_USER:-}"
  if [ -z "$target_user" ]; then
    target_user="$(awk -F: '$3>=1000 && $1!="nobody" {print $1; exit}' /etc/passwd)"
  fi
  if [ -z "$target_user" ]; then
    read -r -p "Enter username to create for openSUSE XRDP setup: " target_user
  fi
  [ -n "$target_user" ] || fail "No username provided"

  if ! id "$target_user" >/dev/null 2>&1; then
    info "Creating user '$target_user'"
    local groups
    groups="users"
    if getent group wheel >/dev/null 2>&1; then
      groups="users,wheel"
    fi
    useradd -m -s /bin/bash -G "$groups" "$target_user"
    echo "Set Linux password for $target_user (required for XRDP login):"
    passwd "$target_user"
  fi

  zypper -n install sudo
  printf '%s ALL=(ALL:ALL) NOPASSWD: ALL\n' "$target_user" > /etc/sudoers.d/90-wsl-ui-setup
  chmod 440 /etc/sudoers.d/90-wsl-ui-setup

  set_wsl_default_user "$target_user"

  local script_path
  script_path="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
  info "Re-running setup as user '$target_user'"
  exec su - "$target_user" -c "WSL_UI_TEMP_SUDOERS=1 bash '$script_path' --as-user"
}

repo_path_for_remote_desktop() {
  # shellcheck disable=SC1091
  source /etc/os-release

  if [ "${ID:-}" = "opensuse-tumbleweed" ]; then
    printf 'openSUSE_Tumbleweed\n'
    return
  fi

  if [ "${ID:-}" = "opensuse-leap" ] || [ "${ID:-}" = "sled" ] || [ "${ID:-}" = "sles" ]; then
    printf 'openSUSE_Leap_%s\n' "${VERSION_ID}"
    return
  fi

  if [ -n "${VERSION_ID:-}" ]; then
    printf 'openSUSE_Leap_%s\n' "${VERSION_ID}"
    return
  fi

  printf '\n'
}

install_xrdp_with_fallback() {
  if run_root zypper -n install xrdp; then
    return
  fi

  local repo_path repo_url
  repo_path="$(repo_path_for_remote_desktop)"
  [ -n "$repo_path" ] || fail "Could not determine openSUSE repository path for XRDP"

  repo_url="https://download.opensuse.org/repositories/X11:/RemoteDesktop/${repo_path}/X11:RemoteDesktop.repo"
  warn "xrdp not found in current repos. Adding community repo: $repo_url"

  run_root zypper -n ar -f "$repo_url" X11_RemoteDesktop || true
  run_root zypper -n --gpg-auto-import-keys refresh
  run_root zypper -n install xrdp || fail "xrdp install failed even after adding X11:RemoteDesktop"
}

main() {
  bootstrap_user_if_needed

  [ "$(id -u)" -ne 0 ] || fail "Run this script as a regular user after bootstrap"

  require_cmd sudo
  require_cmd zypper
  require_cmd sed
  require_cmd ss

  run_root zypper -n --gpg-auto-import-keys refresh

  info "Removing patterns-wsl-tmpfiles when present"
  run_root zypper -n remove patterns-wsl-tmpfiles || true

  info "Installing XFCE pattern"
  run_root zypper -n install -t pattern xfce

  info "Installing XRDP"
  install_xrdp_with_fallback

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

  printf 'startxfce4\n' > "$HOME/.xsession"
  chmod +x "$HOME/.xsession"

  fix_x11_socket
  ensure_password_set
  start_xrdp

  if ! pgrep -x xrdp >/dev/null 2>&1; then
    warn "xrdp process not detected. Check: sudo journalctl -u xrdp -u xrdp-sesman --no-pager | tail -50"
  fi

  if [ "${WSL_UI_TEMP_SUDOERS:-0}" = "1" ]; then
    run_root rm -f /etc/sudoers.d/90-wsl-ui-setup || true
    info "Removed temporary passwordless sudoers entry"
  fi

  info "Setup complete. Connect with: mstsc -> localhost:$target_port"
  info "If you had to bootstrap from root, restart distro once to apply default user from /etc/wsl.conf"
  info "To avoid idle disconnects, set this in %USERPROFILE%\\.wslconfig and run 'wsl --shutdown':"
  printf '[general]\ninstanceIdleTimeout=-1\n[wsl2]\nvmIdleTimeout=-1\n'
}

main "$@"
