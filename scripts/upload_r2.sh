#!/usr/bin/env bash
# Upload every line of an upload.tsv (key<TAB>file<TAB>content-type) to the hampton-media bucket.
# Usage: scripts/upload_r2.sh build/import/upload.tsv --local|--remote [--persist-to DIR]
set -euo pipefail
tsv="${1:?usage: upload_r2.sh FILE.tsv --local|--remote [--persist-to DIR]}"
mode="${2:?pass --local or --remote}"
shift 2
[[ "$mode" == "--local" || "$mode" == "--remote" ]] || { echo "mode must be --local or --remote" >&2; exit 2; }
[[ -f "$tsv" ]] || { echo "not found: $tsv" >&2; exit 2; }
extra=("$@")
mkdir -p build
failed=build/upload_errors.log
: > "$failed"
n=0
# ponytail: batches of 8 with `wait`; a slow upload holds its batch. Use a job pool if this gets too slow.
while IFS=$'\t' read -r key file type; do
  [[ -n "$key" ]] || continue
  ( npx wrangler r2 object put "hampton-media/$key" --file "$file" --content-type "$type" "$mode" "${extra[@]}" >/dev/null 2>&1 \
      || echo "$key" >> "$failed" ) &
  n=$((n + 1))
  if (( n % 8 == 0 )); then wait; fi
done < "$tsv"
wait
if [[ -s "$failed" ]]; then echo "$(wc -l < "$failed") of $n uploads failed; keys in $failed" >&2; exit 1; fi
echo "Uploaded $n objects ($mode)."
