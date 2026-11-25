#!/bin/sh
setup_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec "$setup_dir/setup.sh" "$@"
