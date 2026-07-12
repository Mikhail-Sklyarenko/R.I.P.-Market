#!/usr/bin/env bash
# Sync CS2 Panorama weapon silhouettes into frontend/public/icons/weapons.
# Source: https://github.com/Juknum/counter-strike-icons
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE_URL="https://raw.githubusercontent.com/Juknum/counter-strike-icons/main/cs2/panorama/images/icons/equipment"
WEAPONS_DIR="$REPO_ROOT/frontend/public/icons/weapons"
CATEGORIES_DIR="$WEAPONS_DIR/categories"

mkdir -p "$WEAPONS_DIR" "$CATEGORIES_DIR"

download() {
  local source_name="$1"
  local target_path="$2"
  echo "-> ${target_path##*/} (${source_name})"
  curl -sfL "${BASE_URL}/${source_name}" -o "$target_path"
}

# Model icons used by catalog filter dropdowns (slug -> source file)
download glock.svg "$WEAPONS_DIR/glock-18.svg"
download usp_silencer.svg "$WEAPONS_DIR/usp-s.svg"
download deagle.svg "$WEAPONS_DIR/desert-eagle.svg"
download p250.svg "$WEAPONS_DIR/p250.svg"
download ak47.svg "$WEAPONS_DIR/ak-47.svg"
download m4a1.svg "$WEAPONS_DIR/m4a4.svg"
download m4a1_silencer.svg "$WEAPONS_DIR/m4a1-s.svg"
download galilar.svg "$WEAPONS_DIR/galil-ar.svg"
download awp.svg "$WEAPONS_DIR/awp.svg"
download ssg08.svg "$WEAPONS_DIR/ssg-08.svg"
download mp9.svg "$WEAPONS_DIR/mp9.svg"
download mac10.svg "$WEAPONS_DIR/mac-10.svg"
download nova.svg "$WEAPONS_DIR/nova.svg"
download xm1014.svg "$WEAPONS_DIR/xm1014.svg"
download knife_karambit.svg "$WEAPONS_DIR/karambit.svg"
download bayonet.svg "$WEAPONS_DIR/bayonet.svg"
download clothing_hands.svg "$WEAPONS_DIR/gloves-extraordinary.svg"

# Category tab icons
download knife.svg "$CATEGORIES_DIR/knife.svg"
download glock.svg "$CATEGORIES_DIR/pistol.svg"
download ak47.svg "$CATEGORIES_DIR/rifle.svg"
download awp.svg "$CATEGORIES_DIR/sniper.svg"
download mp9.svg "$CATEGORIES_DIR/smg.svg"
download nova.svg "$CATEGORIES_DIR/shotgun.svg"
download clothing_hands.svg "$CATEGORIES_DIR/gloves.svg"

echo "Synced CS2 weapon icons to ${WEAPONS_DIR}"
