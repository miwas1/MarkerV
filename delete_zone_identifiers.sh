#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
search_root="${1:-$script_dir}"

find "$search_root" -type f -name '*:Zone.Identifier' -print -delete