#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${1:-git@github.com:longbird/KAster_CTI.git}"

git init
git branch -M main
git remote remove origin >/dev/null 2>&1 || true
git remote add origin "$REPO_URL"
git add .
git commit -m "initial: KAster CTI full package"
git push -u origin main
