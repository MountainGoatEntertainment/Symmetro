#!/usr/bin/env bash
# Build the game and upload it to S3, then refresh CloudFront.
#
#   ./deploy.sh            build, upload, invalidate
#   ./deploy.sh --dry-run  build and show what would be uploaded or deleted
#
# Settings come from the environment or from deploy.env next to this script
# (copy deploy.env.example; deploy.env is not committed).
set -euo pipefail
cd "$(dirname "$0")"

[[ -f deploy.env ]] && source deploy.env
BUCKET="${SYMMETRO_BUCKET:?Set SYMMETRO_BUCKET (e.g. in deploy.env)}"
DISTRIBUTION_ID="${SYMMETRO_DISTRIBUTION_ID:?Set SYMMETRO_DISTRIBUTION_ID (e.g. in deploy.env)}"
PREFIX="${SYMMETRO_PREFIX:-games/Symmetro}"
PROFILE="${AWS_PROFILE:-symmetro}"

DRY=()
[[ "${1:-}" == "--dry-run" ]] && DRY=(--dryrun)

npm test
npm run build

DEST="s3://$BUCKET/$PREFIX"
aws=(aws --profile "$PROFILE")

# 1. New hashed files first; their names change with every build, so they can be cached forever.
"${aws[@]}" s3 sync dist/assets "$DEST/assets" "${DRY[@]}" \
  --cache-control "public, max-age=31536000, immutable"
# 2. Then the pages that point at them, which browsers must always re-check.
"${aws[@]}" s3 sync dist "$DEST" "${DRY[@]}" --delete --exclude "assets/*" \
  --cache-control "no-cache"
# 3. Only now remove old hashed files, so nobody loads a page whose files are gone.
"${aws[@]}" s3 sync dist/assets "$DEST/assets" "${DRY[@]}" --delete \
  --cache-control "public, max-age=31536000, immutable"

if [[ ${#DRY[@]} -eq 0 ]]; then
  "${aws[@]}" cloudfront create-invalidation --distribution-id "$DISTRIBUTION_ID" \
    --paths "/$PREFIX/*" "/$PREFIX" --query 'Invalidation.Id' --output text
  echo "Deployed to $DEST"
fi
