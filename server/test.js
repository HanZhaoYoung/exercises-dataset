#!/usr/bin/env node
/**
 * 本地接口测试 — Node 内置 fetch 调用本地服务。
 * 前置: node import.js && node server.js
 * 用法: node test.js [baseUrl]   默认 http://127.0.0.1:3000
 */
'use strict';

const BASE = process.argv[2] || 'http://127.0.0.1:3000';

let passed = 0, failed = 0;
function check(name, cond, extra = '') {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name} ${extra}`); }
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function main() {
  console.log(`\n=== 1. 单条查询 GET /exercises/0001 ===`);
  const one = await get('/exercises/0001');
  check('状态码 200', one.status === 200, `got ${one.status}`);
  check('name 非空', !!one.body.name, one.body.name);
  check('含全部核心字段', ['id','name','category','body_part','equipment','target','image','gif_url','instruction_steps']
    .every(k => k in one.body));
  check('id 匹配', one.body.id === '0001');

  console.log(`\n=== 2. 不存在的 id → 404 ===`);
  const nf = await get('/exercises/99999');
  check('状态码 404', nf.status === 404, `got ${nf.status}`);

  console.log(`\n=== 3. 分页 GET /exercises?page=1&limit=20 ===`);
  const list = await get('/exercises?page=1&limit=20');
  check('状态码 200', list.status === 200);
  check('data 长度 = 20', list.body.data?.length === 20, `got ${list.body.data?.length}`);
  check('total = 1324', list.body.total === 1324, `got ${list.body.total}`);
  check('totalPages = 67 (1324/20 向上取整)', list.body.totalPages === 67, `got ${list.body.totalPages}`);
  check('limit 上限 100', (await get('/exercises?limit=999')).body.data?.length === 100);

  console.log(`\n=== 4. 组合过滤 GET /exercises?category=chest&equipment=barbell ===`);
  const f = await get('/exercises?category=chest&equipment=barbell&limit=50');
  check('状态码 200', f.status === 200);
  check('全部命中过滤条件', f.body.data?.every(e => e.category === 'chest' && e.equipment === 'barbell'));
  console.log(`     chest+barbell 共 ${f.body.total} 条`);
  check('total > 0', f.body.total > 0);

  console.log(`\n=== 5. 过滤 + 分页一致性 ===`);
  const p1 = await get('/exercises?target=biceps&page=1&limit=10');
  const p2 = await get('/exercises?target=biceps&page=2&limit=10');
  check('两页无重复', p1.body.data?.every(a => !p2.body.data?.some(b => b.id === a.id)));
  check('页码正确', p1.body.page === 1 && p2.body.page === 2);

  console.log(`\n=== 6. 无结果过滤 → 空数组 ===`);
  const empty = await get('/exercises?equipment=rocket-sled');
  check('total = 0 且 data 为空', empty.body.total === 0 && empty.body.data?.length === 0);

  console.log(`\n=== 7. 多选筛选 body_part=chest,back ===`);
  const multi = await get('/exercises?body_part=chest,back&limit=1');
  check('状态码 200', multi.status === 200);
  check('total = 366 (163 胸 + 203 背)', multi.body.total === 366, `got ${multi.body.total}`);
  check('返回的 data 全部命中', multi.body.data?.every(e => ['chest','back'].includes(e.body_part)));

  console.log(`\n=== 8. 组合多选 body_part=chest&target=serratus+anterior ===`);
  const combo = await get('/exercises?body_part=chest&target=serratus%20anterior');
  check('total = 5', combo.body.total === 5, `got ${combo.body.total}`);

  console.log(`\n=== 9. 名称搜索 q=barbell ===`);
  const search = await get('/exercises?q=barbell&limit=100');
  check('状态码 200', search.status === 200);
  check('全部命中名称', search.body.data?.every(e => e.name.includes('barbell')));
  check('total > 0', search.body.total > 0, `got ${search.body.total}`);

  console.log(`\n=== 9b. 中文标题 + 中文搜索 ===`);
  const zhSearch = await get('/exercises?q=' + encodeURIComponent('卧推') + '&limit=50');
  check('中文搜索「卧推」total > 0', zhSearch.body.total > 0, `got ${zhSearch.body.total}`);
  check('全部命中中文名', zhSearch.body.data?.every(e => (e.name_zh || '').includes('卧推')));
  check('列表返回 name_zh 字段', zhSearch.body.data?.every(e => typeof e.name_zh === 'string' && e.name_zh.length > 0));
  const oneZh = await get('/exercises/0001');
  check('详情含中文名', oneZh.body.name_zh === '四分之三仰卧起坐', oneZh.body.name_zh);

  console.log(`\n=== 10. 器材类型 equipment_type=free_weight,cable ===`);
  const type = await get('/exercises?equipment_type=free_weight,cable&limit=100');
  check('状态码 200', type.status === 200);
  check('展开过滤正确', type.body.data?.every(e => ['barbell','ez barbell','olympic barbell','trap bar','dumbbell','kettlebell','hammer','weighted','tire','sled machine','cable','rope'].includes(e.equipment)));
  check('total > 0', type.body.total > 0, `got ${type.body.total}`);
  const pureFree = await get('/exercises?equipment_type=free_weight&limit=1');
  check('与纯自由重量 total 一致', pureFree.body.total < type.body.total);

  console.log(`\n=== 11. 元数据 GET /meta ===`);
  const meta = await get('/meta');
  check('状态码 200', meta.status === 200);
  check('10 个部位', meta.body.parts?.length === 10, `got ${meta.body.parts?.length}`);
  const chest = meta.body.parts?.find(p => p.key === 'chest');
  check('chest 子分类: 胸肌158/前锯肌5', chest?.targets?.length === 2 &&
    chest.targets.find(t => t.key === 'pectorals')?.count === 158 &&
    chest.targets.find(t => t.key === 'serratus anterior')?.count === 5,
    JSON.stringify(chest?.targets));
  check('器材类型 ≥ 8 类', meta.body.equipmentTypes?.length >= 8, `got ${meta.body.equipmentTypes?.length}`);
  check('自由重量含杠铃', meta.body.equipmentTypes?.find(t => t.key === 'free_weight')?.items?.some(i => i.key === 'barbell'));
  check('语言 10 种', meta.body.langs?.length === 10);

  console.log(`\n=== 12. 静态媒体 /media/videos/0001-2gPfomN.gif ===`);
  const media = await fetch(`${BASE}/media/videos/0001-2gPfomN.gif`);
  check('GIF 返回 200', media.status === 200, `got ${media.status}`);
  check('Content-Type = image/gif', media.headers.get('content-type')?.includes('image/gif'));
  const media404 = await fetch(`${BASE}/media/videos/nonexist.gif`);
  check('不存在媒体 → 404', media404.status === 404, `got ${media404.status}`);

  console.log(`\n=== 13. 数据库直查（语言/步骤完整性） ===`);
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(require('node:path').join(__dirname, 'exercises.db'), { readOnly: true });
  const instr = db.prepare(`
    SELECT e.id, COUNT(DISTINCT i.lang) AS langs FROM exercises e
    JOIN instructions i ON i.exercise_id = e.id GROUP BY e.id
  `).all();
  check('1324 条全部含 10 语言说明', instr.every(r => r.langs === 10), JSON.stringify(instr.filter(r => r.langs !== 10).slice(0,3)));
  const zh = db.prepare(`SELECT text FROM instructions WHERE exercise_id='0001' AND lang='zh'`).get();
  console.log(`     中文说明示例: ${zh?.text?.slice(0, 40)}...`);
  const steps = db.prepare(`SELECT COUNT(*) AS n FROM instruction_steps WHERE exercise_id='0001' AND lang='en'`).get().n;
  check('0001 英文步骤数 > 0', steps > 0, `got ${steps}`);

  console.log(`\n======== 结果: ${passed} 通过, ${failed} 失败 ========`);
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error('测试异常:', e); process.exit(1); });
