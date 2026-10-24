#
# Dockerfile chạy thử app web local (Next.js standalone).
#
#   docker compose up --build web
#
# Xem README.md → "Chạy thử local bằng Docker".

# ---------------------------------------------------------------------------
# Base: Node + pnpm (giống packageManager trong package.json)
# Node 24 (LTS, khớp .nvmrc `lts/*`): proxy.ts dùng global URLPattern, chỉ có
# từ Node 23.8+ — Node 22 sẽ crash standalone server.
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim AS base

ENV NEXT_TELEMETRY_DISABLED=1

RUN npm install -g pnpm@11.28.8

WORKDIR /app

# ---------------------------------------------------------------------------
# Build: cài workspace deps rồi build Next.js (output standalone)
# ---------------------------------------------------------------------------
FROM base AS build

# NEXT_PUBLIC_* được inline vào bundle lúc build — muốn đổi giá trị là phải
# build lại image (docker compose build --build-arg ...). Các biến server-only
# (SUPABASE_SERVICE_ROLE_KEY, AI_GATEWAY_API_KEY...) đọc lúc runtime qua
# docker-compose env_file, không cần ở đây.
ARG NEXT_PUBLIC_SUPABASE_URL=http://host.docker.internal:54321
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000

ENV NEXT_OUTPUT=standalone \
    NEXT_PUBLIC_CI=true \
    NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL

COPY . .

# Script `build` của web dùng `with-env` (dotenv -e ./.env.local); trong image
# không có file host nên tạo file rỗng — env thật lấy từ ENV ở trên.
# Install và build tách 2 layer: khi sửa code, layer install được tái dùng.
RUN touch apps/web/.env.local && pnpm install --frozen-lockfile

RUN pnpm --filter web build

# ---------------------------------------------------------------------------
# Runner: chỉ chứa standalone server (node_modules đã được trace tối thiểu)
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim AS runner

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs

WORKDIR /app

COPY --from=build --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

USER nextjs

EXPOSE 3000

CMD ["node", "apps/web/server.js"]
