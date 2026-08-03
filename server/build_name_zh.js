#!/usr/bin/env node
/**
 * 组装 1324 条动作的中文标题:
 *   name_zh = 设备中文 + 动作短语中文（设备已含在短语中文时不再重复拼接）
 * 输入: data/exercises.json + name_zh.json（短语翻译表）
 * 输出: name_zh.full.json（id → 中文名）
 * 用法: node build_name_zh.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { EQUIPMENT_LABELS } = require('./meta');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'exercises.json'), 'utf8'));
const zh = JSON.parse(fs.readFileSync(path.join(__dirname, 'name_zh.json'), 'utf8'));
const phrases = zh.phrases;

// 设备值按长度倒序（长词优先匹配）
const eqValues = [...new Set(data.map(e => e.equipment))].sort((a, b) => b.length - a.length);

// 名称中出现的设备别名前缀（equipment 字段值无法剥离但中文里已含设备含义）
const EQ_ALIAS = ['lever', 'smith', 'sled', 'exercise ball', 'ez bar', 'ez-barbell', 'self', 'bodyweight', 'cable', 'band'];

// 个别名称的修正（id → 中文），覆盖自动组装结果
const OVERRIDES = {
  '0970': '弹力带辅助引体向上',
  '0971': '弹力带辅助健腹轮滚动',
  '1369': '弹力带双腿提踵2.0',
  '0128': '战绳',
  '0271': '稳定球卷腹',
  '0272': '稳定球直臂卷腹',
  '1656': '哑铃V字坐姿弯举',
  '2189': '哑铃坐姿肱三头肌臂屈伸',
  '0458': '地面杠铃飞鸟',
  '0640': '药球单臂砸球',
  '0650': '稳定球收腿',
  '0653': '波速球俯卧撑',
  '0655': '稳定球俯卧撑',
  '0656': '稳定球俯卧撑',
  '0675': '稳定球反向背部伸展',
  '0727': '哑铃垫高单腿提踵',
  '0796': '站姿健腹轮滚动',
  '1599': '弹力带站姿腘绳小腿拉伸',
  '1689': '自重推拉',
  '2141': '椭圆机行走',
  '2142': '滑雪测功仪',
  '2311': '爬楼机行走',
  '0857': '健腹轮滚动',
};

function stripEq(name) {
  for (const e of eqValues) {
    if (name === e) return '';
    if (name.startsWith(e + ' ')) return name.slice(e.length + 1).trim();
    if (name.endsWith(' ' + e)) return name.slice(0, -(e.length + 1)).trim();
    if (name.includes(' ' + e + ' ')) return name.replace(e, '').trim();
  }
  return name.trim();
}

const result = {};
const missing = [];
const dup = [];

for (const ex of data) {
  if (OVERRIDES[ex.id]) {
    result[ex.id] = OVERRIDES[ex.id];
    continue;
  }
  const phrase = stripEq(ex.name);
  const zhPhrase = phrases[phrase];

  let nameZh;
  if (!zhPhrase) {
    missing.push(`${ex.id} ${ex.name} → ${phrase}`);
    nameZh = ex.name;
  } else {
    const hasEqInPhrase = EQ_ALIAS.some(a => phrase.startsWith(a + ' ')) || phrase === 'smith squat';
    if (hasEqInPhrase) {
      nameZh = zhPhrase; // 短语中文已含设备（如 史密斯机深蹲 / 器械弯举 / 健身球xxx）
    } else if (ex.equipment === 'body weight') {
      nameZh = zhPhrase; // 自重动作不加设备前缀（俯卧撑）
    } else {
      const eqCn = EQUIPMENT_LABELS[ex.equipment] || ex.equipment;
      nameZh = eqCn + zhPhrase;
      if (zhPhrase.includes(eqCn)) dup.push(`${ex.id} ${ex.name} → ${nameZh}`);
    }
  }
  result[ex.id] = nameZh;
}

console.log(`总数: ${data.length}  未命中: ${missing.length}`);
missing.forEach(m => console.log('  ✗', m));
console.log(`可能重复设备: ${dup.length}`);
dup.slice(0, 10).forEach(d => console.log('  !', d));

fs.writeFileSync(path.join(__dirname, 'name_zh.full.json'), JSON.stringify(result, null, 2));
console.log(`已输出 server/name_zh.full.json（${Object.keys(result).length} 条）`);
