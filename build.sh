#!/bin/sh
set -e
cd "$(dirname "$0")"

# Определяем абсолютный путь к корню проекта
PROJECT_ROOT=$(pwd)

echo "--- Starting Docker Build ---"

# Запускаем контейнер
# Добавляем -e CI=${CI} чтобы прокинуть флаг GitHub Actions внутрь, если он есть
docker run --rm \
    -v "$PROJECT_ROOT:/app" \
    -e CI=$CI \
    llmzone-builder

echo "--- Build Finished ---"
