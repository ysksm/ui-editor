# amis-editor-demo リポジトリには版ごとのビルド済みファイル（demo-x.y.z/）が置かれている。
# その 1 つを取り出し、GitHub Pages 向けの絶対 URL をローカル配信用に書き換える。
FROM nginx:1.27-alpine

ARG REPO=https://github.com/aisuda/amis-editor-demo.git
ARG REF=5ff971720a11ad63f93f4561d3cce0ce282ea4cb
ARG DEMO=demo-6.11.0

RUN set -eux; \
    apk add --no-cache git; \
    git clone --filter=blob:none --no-checkout "$REPO" /tmp/repo; \
    cd /tmp/repo; \
    git sparse-checkout set "$DEMO"; \
    git checkout "$REF"; \
    rm -rf /usr/share/nginx/html/*; \
    cp -r "$DEMO"/. /usr/share/nginx/html/; \
    grep -rl "aisuda.github.io/amis-editor-demo/$DEMO/" /usr/share/nginx/html \
      | xargs sed -i "s#https://aisuda.github.io/amis-editor-demo/$DEMO/#/#g"; \
    rm -rf /tmp/repo; \
    apk del git
