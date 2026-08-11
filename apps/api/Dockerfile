FROM python:3.13-slim

# GHCR paketini repoya BAGLAR. Bag olmadan Actions'in GITHUB_TOKEN'i pakete
# yazamaz ("denied: permission_denied: write_package") ve Build Images duser.
# Etiket her push'ta bagi tazeledigi icin bag bir daha kopmaz.
LABEL org.opencontainers.image.source="https://github.com/Duosis-Developer-Team/logislot"

WORKDIR /srv/api

COPY pyproject.toml ./
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./

RUN pip install --no-cache-dir .

EXPOSE 8000

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["docker-entrypoint.sh"]
