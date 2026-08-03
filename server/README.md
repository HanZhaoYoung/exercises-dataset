# 本地数据集服务（SQLite + Node 零依赖）

基于 [exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset) 的本地数据层：
SQLite 数据库 + 复刻 `setup.html` 契约的 REST 接口。仅用 Node 23 内置模块
（`node:sqlite`、`node:http`、`node:fetch`），无任何外部依赖。

## 使用步骤

```bash
cd server
node import.js    # ① 建库导入（生成 exercises.db，约 19MB）
node server.js    # ② 启动 API（默认 127.0.0.1:3000，可传端口参数）
node test.js      # ③ 运行测试（18 项断言）
```

## API 契约（与 setup.html 一致）

| 接口 | 说明 |
|---|---|
| `GET /exercises?page=&limit=&category=&body_part=&equipment=&target=` | 分页列表 + 过滤，响应 `{data, total, page, totalPages}` |
| `GET /exercises/:id` | 单条完整练习（含 10 语言 instructions / instruction_steps） |
| `GET /health` | 健康检查 |

参数：`page` 默认 1，`limit` 默认 20、上限 100，过滤字段可任意组合。
过滤为精确匹配（如 `equipment=barbell`）。

## 数据库结构

| 表 | 说明 |
|---|---|
| `exercises` | 1324 条练习主数据，过滤字段（category/body_part/equipment/target）已建索引 |
| `instructions` | 10 语言说明文本（13240 行 = 1324 × 10） |
| `instruction_steps` | 10 语言分步说明（77100 行） |

## Node 调用示例

```js
const res = await fetch('http://127.0.0.1:3000/exercises?category=chest&equipment=barbell&limit=10');
const { data, total, totalPages } = await res.json();

const one = await (await fetch('http://127.0.0.1:3000/exercises/0001')).json();
console.log(one.name, one.instructions.zh);   // 3/4 sit-up 平躺，膝盖弯曲…
```

媒体文件（gif_url / image 相对路径）在仓库根目录 `videos/`、`images/` 下。
