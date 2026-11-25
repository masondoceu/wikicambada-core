#!/bin/sh
set -eu
setup_source=$0
while [ -L "$setup_source" ]; do
  setup_dir=$(CDPATH= cd -- "$(dirname -- "$setup_source")" && pwd)
  setup_source=$(readlink "$setup_source")
  case "$setup_source" in /*) ;; *) setup_source=$setup_dir/$setup_source ;; esac
done
setup_dir=$(CDPATH= cd -- "$(dirname -- "$setup_source")" && pwd)
if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' 'Node.js 22.13 ou superior não foi encontrado' >&2
  exit 1
fi
exec node "$setup_dir/setup.js" "$@"
