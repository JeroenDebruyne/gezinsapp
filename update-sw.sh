#!/usr/bin/env bash
# update-sw.sh — past sw.js automatisch aan:
#   1. bumpt de CACHE versie naar gezinsapp-vYYYY-MM-DD
#   2. controleert of alle .js/.html/.css/.svg bestanden in STATIC staan
#   3. meldt ontbrekende bestanden (maar voegt ze niet automatisch toe — bewuste keuze)
#
# Gebruik: bash update-sw.sh
# Of maak uitvoerbaar: chmod +x update-sw.sh && ./update-sw.sh

set -e
cd "$(dirname "$0")"

SWFILE="sw.js"
TODAY=$(date +%Y-%m-%d)
NEW_CACHE="gezinsapp-v${TODAY}"

# Huidige cache-naam ophalen
CURRENT=$(grep -oP "gezinsapp-v[\w\-]+" "$SWFILE" | head -1)

if [ "$CURRENT" = "$NEW_CACHE" ]; then
  echo "✓ Cache-versie is al up-to-date: $NEW_CACHE"
else
  sed -i "s/${CURRENT}/${NEW_CACHE}/g" "$SWFILE"
  echo "✓ Cache bijgewerkt: $CURRENT → $NEW_CACHE"
fi

# Controleer of alle bestanden in STATIC staan
echo ""
echo "Controle STATIC lijst:"
MISSING=0
for f in *.js *.html *.css *.svg; do
  [ -f "$f" ] || continue
  [ "$f" = "sw.js" ] && continue          # SW zelf hoeft niet in cache
  [ "$f" = "update-sw.sh" ] && continue
  if ! grep -q "'$f'" "$SWFILE"; then
    echo "  ⚠️  ONTBREEKT in STATIC: $f"
    MISSING=$((MISSING + 1))
  fi
done

if [ $MISSING -eq 0 ]; then
  echo "  ✓ Alle bestanden staan in de STATIC lijst"
fi

echo ""
echo "Klaar. Commit sw.js om de update te activeren."
