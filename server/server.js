#!/usr/bin/env node
/**
 * 本地 REST 服务 — 复刻 setup.html API 契约并扩展:
 *   GET /exercises/:id                       单个练习（含 10 语言内容）
 *   GET /exercises?page=&limit=&q=&category=&body_part=&target=&equipment=&equipment_type=
 *                                           分页列表 + 多选过滤（逗号分隔）+ 名称搜索
 *   GET /meta                                分类树/器材类型/语言 元数据
 *   GET /media/videos|images/xxx             静态媒体文件
 * 响应: { data, total, page, totalPages }
 * 用法: node server.js [port]   默认 3000
 */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { buildMeta } = require('./meta');

const PORT = Number(process.argv[2] || 3000);
// 监听地址：本地默认 127.0.0.1；容器内（HOST=0.0.0.0）需接受 docker-proxy 转发
const HOST = process.env.HOST || '127.0.0.1';
const REPO_ROOT = path.resolve(__dirname, '..');
const DB_PATH = path.join(__dirname, 'exercises.db');
const MAX_LIMIT = 100;

const db = new DatabaseSync(DB_PATH, { readOnly: true });

// 允许过滤的字段（多选，逗号分隔）
const FILTERABLE = ['category', 'body_part', 'target', 'equipment'];
// 器材类型（映射到具体器材后再过滤）
const EQUIPMENT_TYPE_PARAM = 'equipment_type';

// ---- 查询 ----

function getExerciseById(id) {
  const row = db.prepare('SELECT * FROM exercises WHERE id = ?').get(String(id));
  if (!row) return null;
  row.instructions = {};
  for (const r of db.prepare('SELECT lang, text FROM instructions WHERE exercise_id = ?').all(id)) {
    row.instructions[r.lang] = r.text;
  }
  row.instruction_steps = {};
  for (const r of db.prepare(
    'SELECT lang, step_index, text FROM instruction_steps WHERE exercise_id = ? ORDER BY step_index'
  ).all(id)) {
    (row.instruction_steps[r.lang] ||= []).push(r.text);
  }
  return row;
}

function listExercises(params) {
  const page = Math.max(1, Number(params.page) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(params.limit) || 20));

  const where = [];
  const args = [];

  // 多选过滤：逗号分隔 → IN (...)
  for (const key of FILTERABLE) {
    const v = params[key];
    if (v === undefined || v === '') continue;
    const values = String(v).split(',').map(s => s.trim()).filter(Boolean);
    if (values.length) {
      where.push(`${key} IN (${values.map(() => '?').join(',')})`);
      args.push(...values);
    }
  }

  // 器材类型 → 展开为具体器材
  const typeParam = params[EQUIPMENT_TYPE_PARAM];
  if (typeParam !== undefined && typeParam !== '') {
    const types = String(typeParam).split(',').map(s => s.trim()).filter(Boolean);
    const { EQUIPMENT_TYPES } = require('./meta');
    const matched = [...new Set(types.flatMap(t =>
      EQUIPMENT_TYPES.find(x => x.key === t)?.items || []
    ))];
    if (matched.length) {
      where.push(`equipment IN (${matched.map(() => '?').join(',')})`);
      args.push(...matched);
    }
  }

  // 名称搜索（中文名 + 英文名双语匹配）
  const q = (params.q || '').trim();
  if (q) {
    where.push('(name LIKE ? OR name_zh LIKE ?)');
    const pattern = `%${q}%`;
    args.push(pattern, pattern);
  }

  const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS n FROM exercises${whereSql}`).get(...args).n;
  const totalPages = Math.ceil(total / limit);
  const data = db
    .prepare(`SELECT * FROM exercises${whereSql} ORDER BY id LIMIT ? OFFSET ?`)
    .all(...args, limit, (page - 1) * limit);

  return { data, total, page, totalPages };
}

// ---- 静态媒体 ----

const MEDIA_EXT = { '.gif': 'image/gif', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' };

function serveMedia(req, res, urlPath) {
  // /media/videos|images/<file>
  const m = urlPath.match(/^\/media\/(videos|images)\/([^/]+)$/);
  if (!m) return null;
  const ext = path.extname(m[2]).toLowerCase();
  if (!MEDIA_EXT[ext]) return null;
  const file = path.join(REPO_ROOT, m[1], m[2]);
  // 防目录穿越：解析后必须仍在目标目录内
  if (!file.startsWith(path.join(REPO_ROOT, m[1]) + path.sep)) return null;
  if (!fs.existsSync(file)) return null;

  res.writeHead(200, {
    'Content-Type': MEDIA_EXT[ext],
    'Cache-Control': 'public, max-age=86400',
    'Access-Control-Allow-Origin': '*',
  });
  fs.createReadStream(file).pipe(res);
  return true;
}

// ---- HTTP ----

function sendJson(res, status, body) {
  const text = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
  });
  res.end(text);
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' });
    return res.end();
  }
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  // GET /exercises/:id
  let m = url.pathname.match(/^\/exercises\/([^/]+)$/);
  if (m) {
    const ex = getExerciseById(m[1]);
    if (!ex) return sendJson(res, 404, { error: `Exercise ${m[1]} not found` });
    return sendJson(res, 200, ex);
  }

  // GET /exercises
  if (url.pathname === '/exercises') {
    return sendJson(res, 200, listExercises(Object.fromEntries(url.searchParams)));
  }

  // GET /meta
  if (url.pathname === '/meta') {
    return sendJson(res, 200, buildMeta(db));
  }

  // GET /media/...
  if (url.pathname.startsWith('/media/') && serveMedia(req, res, url.pathname)) {
    return;
  }

  // 健康检查
  if (url.pathname === '/health') {
    return sendJson(res, 200, { status: 'ok' });
  }

  sendJson(res, 404, { error: `Not found: ${req.method} ${url.pathname}` });
});

server.listen(PORT, HOST, () => {
  console.log(`exercises API 已启动: http://${HOST}:${PORT}`);
  console.log(`  GET /exercises?page=1&limit=20&q=bench&body_part=chest,back`);
  console.log(`  GET /exercises/{id}  例: http://127.0.0.1:${PORT}/exercises/0001`);
  console.log(`  GET /meta            分类树与器材类型`);
  console.log(`  GET /media/videos|images/xxx  静态媒体`);
  console.log(`  多选参数: body_part,target,equipment,equipment_type (逗号分隔)`);
});
