#!/bin/sh
set -e
cd "$(dirname "$0")"
docker build -t llmzone-builder -f Dockerfile.build .
