# Backend image: Node (API) + Python (reportlab PDF generation).
# IMPORTANT: build this with the PROJECT ROOT as context so both backend/ and
# assets/ are available:  docker build -f backend/Dockerfile .
FROM node:22-bookworm

# Python for the reportlab-based resume PDF generator (assets/**/*.py).
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# Python virtualenv + deps (assets/requirements.txt -> reportlab).
COPY assets ./assets
RUN python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir -r assets/requirements.txt
# The backend spawns this interpreter (overrides its default ".venv/bin/python3").
ENV PYTHON_BIN=/opt/venv/bin/python3

# Node deps first for better layer caching.
COPY backend/package*.json ./backend/
RUN cd backend && npm ci

# Backend source + generate the Prisma client into backend/generated/prisma.
COPY backend ./backend
RUN cd backend && npx prisma generate

# Run from backend/ so the code's "../assets/..." paths resolve to /usr/src/app/assets.
WORKDIR /usr/src/app/backend
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

USER node

# Apply pending migrations, then start via tsx (tsconfig sets noEmit).
CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx src/start.ts"]
