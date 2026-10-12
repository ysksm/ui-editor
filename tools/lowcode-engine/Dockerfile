# lowcode-demo は 2024 年で更新が止まっており、ビルドに古い Node（16）が必要。
# エンジン本体・UI ライブラリは CDN（alicdn）から読み込むため、表示時もネット接続が要る。
FROM node:16-bullseye AS build

ARG REPO=https://github.com/alibaba/lowcode-demo.git
ARG REF=680a8b4b8f315deed49f88833f488d4de373b857

RUN git clone "$REPO" /src && git -C /src checkout "$REF"
WORKDIR /src/demo-general
RUN npm install --no-audit --no-fund --legacy-peer-deps
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /src/demo-general/build /usr/share/nginx/html
