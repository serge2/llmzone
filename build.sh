#!/bin/sh
set -e
cd "$(dirname "$0")"
docker run --rm -v "$(pwd):/app" llmzone-builder