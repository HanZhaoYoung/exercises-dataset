#!/usr/bin/env node
/**
 * 建库并导入 exercises.json 到 SQLite（Node 23 内置 node:sqlite，零依赖）。
 * 用法: node import.js
 * 产物: server/exercises.db
 */
'use strict';

const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const DB_PATH = path.join(__dirname, 'exercises.db');
const DATA_PATH = path.join(__dirname, '..', 'data', 'exercises.json');
const NAME_ZH_PATH = path.join(__dirname, 'name_zh.full.json');

const db = new DatabaseSync(DB_PATH);

// ---- 建表 ----
db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS exercises (
    id                 TEXT PRIMARY KEY,
    name               TEXT NOT NULL,
    name_zh            TEXT,           -- 中文标题（由 build_name_zh.js 生成）
    category           TEXT,
    body_part          TEXT,
    equipment          TEXT,
    target             TEXT,
    muscle_group       TEXT,
    secondary_muscles  TEXT,      -- JSON 数组
    image              TEXT,
    gif_url            TEXT,
    media_id           TEXT,
    created_at         TEXT,
    attribution        TEXT
  );

  CREATE TABLE IF NOT EXISTS instructions (
    exercise_id  TEXT NOT NULL REFERENCES exercises(id),
    lang         TEXT NOT NULL,
    text         TEXT,
    PRIMARY KEY (exercise_id, lang)
  );

  CREATE TABLE IF NOT EXISTS instruction_steps (
    exercise_id  TEXT NOT NULL REFERENCES exercises(id),
    lang         TEXT NOT NULL,
    step_index   INTEGER NOT NULL,
    text         TEXT,
    PRIMARY KEY (exercise_id, lang, step_index)
  );

  -- 过滤字段索引
  CREATE INDEX IF NOT EXISTS idx_exercises_category  ON exercises(category);
  CREATE INDEX IF NOT EXISTS idx_exercises_body_part ON exercises(body_part);
  CREATE INDEX IF NOT EXISTS idx_exercises_equipment ON exercises(equipment);
  CREATE INDEX IF NOT EXISTS idx_exercises_target    ON exercises(target);
`);

// ---- 导入 ----
const raw = fs.readFileSync(DATA_PATH, 'utf8');
const exercises = JSON.parse(raw);
const nameZh = JSON.parse(fs.readFileSync(NAME_ZH_PATH, 'utf8'));

const insEx = db.prepare(`
  INSERT OR REPLACE INTO exercises
    (id, name, name_zh, category, body_part, equipment, target, muscle_group,
     secondary_muscles, image, gif_url, media_id, created_at, attribution)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insInstr = db.prepare(`
  INSERT OR REPLACE INTO instructions (exercise_id, lang, text) VALUES (?, ?, ?)
`);
const insStep = db.prepare(`
  INSERT OR REPLACE INTO instruction_steps (exercise_id, lang, step_index, text)
  VALUES (?, ?, ?, ?)
`);

db.exec('BEGIN');
for (const ex of exercises) {
  insEx.run(
    ex.id, ex.name, nameZh[ex.id] || null, ex.category, ex.body_part,
    ex.equipment, ex.target, ex.muscle_group,
    JSON.stringify(ex.secondary_muscles || []),
    ex.image, ex.gif_url, ex.media_id, ex.created_at, ex.attribution
  );
  for (const [lang, text] of Object.entries(ex.instructions || {})) {
    insInstr.run(ex.id, lang, text);
  }
  for (const [lang, steps] of Object.entries(ex.instruction_steps || {})) {
    (steps || []).forEach((text, i) => insStep.run(ex.id, lang, i, text));
  }
}
db.exec('COMMIT');

// ---- 校验 ----
const count = db.prepare('SELECT COUNT(*) AS n FROM exercises').get().n;
const instrCount = db.prepare('SELECT COUNT(*) AS n FROM instructions').get().n;
const stepCount = db.prepare('SELECT COUNT(*) AS n FROM instruction_steps').get().n;
console.log(`导入完成: exercises=${count}  instructions=${instrCount}  instruction_steps=${stepCount}`);
console.log(`数据库文件: ${DB_PATH} (${(fs.statSync(DB_PATH).size / 1024 / 1024).toFixed(1)} MB)`);
db.close();
