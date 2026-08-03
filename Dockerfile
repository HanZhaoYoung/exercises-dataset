# 健身动作数据服务 — 零依赖 Node 后端 + SQLite 数据集 + 媒体资源
# 构建: docker build -t exercises-api .
# 运行: docker run -d --name exercises-api -p 3000:3000 --restart unless-stopped exercises-api
FROM node:23-alpine

WORKDIR /app

# 后端代码（node:sqlite 零依赖，无需 npm install）
COPY server/ ./server/
# 数据集（JSON + 媒体 GIF/缩略图）
COPY data/ ./data/
COPY videos/ ./videos/
COPY images/ ./images/

# 启动时构建 SQLite 数据库（import.js 幂等）
RUN cd server && node import.js

ENV HOST=0.0.0.0

EXPOSE 3000

CMD ["node", "server/server.js"]
