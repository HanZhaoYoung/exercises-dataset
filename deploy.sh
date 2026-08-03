#!/usr/bin/env bash
# ============================================================
# 一键部署脚本 — 健身动作数据服务
# 用法:
#   ./deploy.sh            增量部署（代码/数据，不含媒体，快）
#   ./deploy.sh full       全量部署（含 videos/images 媒体，慢）
#   ./deploy.sh <其他文件>  增量并追加指定文件（如 ./deploy.sh server/server.js）
# 流程: 打包 → scp 上传 → 服务器 docker build → 重启容器 → 健康检查
# ============================================================
set -euo pipefail

SERVER="root@47.108.133.181"
KEY="${DEPLOY_KEY:-$HOME/Downloads/MacAir.pem}"
REMOTE_DIR="/root"
APP="exercises-api"
PORT=3000

MODE="${1:-code}"
BASE_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "① 打包部署内容..."
FILES="Dockerfile server data"
EXTRA=""
if [ "$MODE" = "full" ]; then
  FILES="$FILES videos images"
  echo "   全量模式：包含媒体（videos/images）"
else
  # 增量模式：除标准内容外可追加指定文件
  shift || true
  EXTRA="$*"
fi

TMP_TGZ="/tmp/exercises-deploy-$(date +%s).tgz"
# 排除数据库文件与 git；--no-xattrs 避免 macOS 扩展属性刷屏
COPYFILE_DISABLE=1 tar --no-xattrs -czf "$TMP_TGZ" \
  --exclude='server/*.db*' --exclude='.git' -C "$BASE_DIR" $FILES $EXTRA
echo "   打包完成: $(du -h "$TMP_TGZ" | cut -f1)"

echo "② 上传到服务器..."
scp -i "$KEY" "$TMP_TGZ" "$SERVER:$REMOTE_DIR/"

echo "③ 服务器构建并重启容器..."
ssh -i "$KEY" "$SERVER" "
  cd $REMOTE_DIR && \
  tar xzf '$TMP_TGZ' 2>/dev/null; \
  docker build -t $APP . > /dev/null 2>&1 && \
  docker rm -f $APP > /dev/null 2>&1 || true && \
  docker run -d --name $APP -p $PORT:$PORT --restart unless-stopped $APP > /dev/null && \
  sleep 2 && \
  if curl -s --max-time 8 http://127.0.0.1:$PORT/health | grep -q '\"status\": *\"ok\"'; then \
    echo '   ✔ 健康检查通过，部署成功'; \
  else \
    echo '   ✗ 健康检查失败，请查 docker logs'; docker logs --tail 10 $APP; exit 1; \
  fi
"

rm -f "$TMP_TGZ"
echo "④ 完成。公网验证: http://47.108.133.181:$PORT/health"
