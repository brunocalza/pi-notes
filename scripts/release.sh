#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:-}"
MODE="${2:-}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

usage() {
  echo "Usage:"
  echo "  $0 <version>            # Create release branch and open PR"
  echo "  $0 <version> --publish  # Tag and create GitHub release (run after PR merge)"
  exit 1
}

[[ -z "$VERSION" ]] && usage

if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Error: version must be semver (e.g. 1.2.3), got: $VERSION"
  exit 1
fi

TAG="v$VERSION"

# Check if tag already exists locally or remotely
if git -C "$ROOT" tag | grep -q "^${TAG}$"; then
  echo "Error: tag $TAG already exists locally"
  exit 1
fi
if git -C "$ROOT" ls-remote --tags origin "refs/tags/${TAG}" | grep -q "${TAG}"; then
  echo "Error: tag $TAG already exists on remote"
  exit 1
fi

# Generate release notes from git log since last tag
generate_notes() {
  local last_tag
  last_tag="$(git -C "$ROOT" describe --tags --abbrev=0 2>/dev/null || echo "")"

  local range
  if [[ -n "$last_tag" ]]; then
    range="${last_tag}..HEAD"
  else
    range="HEAD"
  fi

  local log
  log="$(git -C "$ROOT" log "$range" --pretty=format:"%s" --no-merges)"

  local features fixes chores other
  features="$(echo "$log" | grep -E "^feat(\(.+\))?[!]?:" || true)"
  fixes="$(echo "$log" | grep -E "^fix(\(.+\))?[!]?:" || true)"
  chores="$(echo "$log" | grep -E "^(chore|refactor|perf|style|test|docs|build|ci)(\(.+\))?[!]?:" || true)"
  other="$(echo "$log" | grep -vE "^(feat|fix|chore|refactor|perf|style|test|docs|build|ci)(\(.+\))?[!]?:" || true)"

  local notes=""

  if [[ -n "$features" ]]; then
    notes+="## Features"$'\n'
    while IFS= read -r line; do
      [[ -z "$line" ]] && continue
      notes+="- ${line#*: }"$'\n'
    done <<< "$features"
    notes+=$'\n'
  fi

  if [[ -n "$fixes" ]]; then
    notes+="## Bug Fixes"$'\n'
    while IFS= read -r line; do
      [[ -z "$line" ]] && continue
      notes+="- ${line#*: }"$'\n'
    done <<< "$fixes"
    notes+=$'\n'
  fi

  if [[ -n "$chores" ]]; then
    notes+="## Other Changes"$'\n'
    while IFS= read -r line; do
      [[ -z "$line" ]] && continue
      notes+="- ${line#*: }"$'\n'
    done <<< "$chores"
    notes+=$'\n'
  fi

  if [[ -n "$other" ]]; then
    notes+="## Other"$'\n'
    while IFS= read -r line; do
      [[ -z "$line" ]] && continue
      notes+="- $line"$'\n'
    done <<< "$other"
    notes+=$'\n'
  fi

  if [[ -z "$notes" ]]; then
    notes="No changes recorded since last release."
  fi

  echo "$notes"
}

bump_versions() {
  echo "Bumping version to $VERSION..."
  sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" "$ROOT/package.json"
  sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" "$ROOT/src-tauri/tauri.conf.json"
  sed -i "0,/^version = \"[^\"]*\"/s//version = \"$VERSION\"/" "$ROOT/src-tauri/Cargo.toml"
}

# ─── PR mode (default) ────────────────────────────────────────────────────────
if [[ "$MODE" != "--publish" ]]; then
  BRANCH="release/$TAG"

  # Ensure we're on main and up to date
  current_branch="$(git -C "$ROOT" rev-parse --abbrev-ref HEAD)"
  if [[ "$current_branch" != "main" ]]; then
    echo "Error: must be on main to create a release branch (currently on $current_branch)"
    exit 1
  fi
  git -C "$ROOT" pull --ff-only origin main

  echo "Creating branch $BRANCH..."
  git -C "$ROOT" checkout -b "$BRANCH"

  bump_versions

  NOTES="$(generate_notes)"

  git -C "$ROOT" add \
    package.json \
    src-tauri/tauri.conf.json \
    src-tauri/Cargo.toml \
    src-tauri/Cargo.lock
  git -C "$ROOT" commit -m "chore: release $TAG"

  echo "Pushing branch..."
  git -C "$ROOT" push -u origin "$BRANCH"

  echo "Opening PR..."
  gh pr create \
    --title "chore: release $TAG" \
    --body "$(printf '## Release %s\n\n%s' "$TAG" "$NOTES")" \
    --base main \
    --head "$BRANCH"

  echo ""
  echo "PR opened. After it's merged, run:"
  echo "  $0 $VERSION --publish"

# ─── Publish mode ─────────────────────────────────────────────────────────────
else
  # Verify we're on main and the version matches
  current_branch="$(git -C "$ROOT" rev-parse --abbrev-ref HEAD)"
  if [[ "$current_branch" != "main" ]]; then
    echo "Error: must be on main to publish (currently on $current_branch)"
    exit 1
  fi

  git -C "$ROOT" pull --ff-only origin main

  current_version="$(grep -o '"version": "[^"]*"' "$ROOT/package.json" | head -1 | grep -o '[0-9][^"]*')"
  if [[ "$current_version" != "$VERSION" ]]; then
    echo "Error: package.json version is $current_version, expected $VERSION"
    echo "Make sure the release PR has been merged before publishing."
    exit 1
  fi

  NOTES="$(generate_notes)"

  echo "Tagging $TAG..."
  git -C "$ROOT" tag "$TAG"
  git -C "$ROOT" push origin "$TAG"

  echo "Creating GitHub release..."
  gh release create "$TAG" \
    --title "PI Notes $TAG" \
    --notes "$NOTES"

  echo "Done. Release $TAG created — CI is building the bundles."
fi
