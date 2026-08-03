/**
 * 元数据配置：中文标签 + 器材类型归类。
 * 供 /meta 接口使用；计数由 buildMeta() 从数据库动态统计。
 */
'use strict';

// 部位 → 中文
const BODY_PART_LABELS = {
  waist: '腰腹', 'upper legs': '大腿', back: '背部', 'lower legs': '小腿',
  chest: '胸部', 'upper arms': '上臂', cardio: '有氧', shoulders: '肩部',
  'lower arms': '前臂', neck: '颈部',
};

// 目标肌群 → 中文
const TARGET_LABELS = {
  abs: '腹肌', glutes: '臀部', quads: '股四头肌', hamstrings: '腘绳肌',
  adductors: '内收肌', abductors: '外展肌', 'upper back': '上背部',
  lats: '背阔肌', spine: '竖脊肌', traps: '斜方肌', calves: '小腿',
  pectorals: '胸肌', 'serratus anterior': '前锯肌', biceps: '肱二头肌',
  triceps: '肱三头肌', 'cardiovascular system': '心血管系统', delts: '三角肌',
  forearms: '前臂', 'levator scapulae': '肩胛提肌',
};

// 器材 → 中文
const EQUIPMENT_LABELS = {
  assisted: '助力器械', band: '弹力带', barbell: '杠铃', 'body weight': '自重',
  'bosu ball': '波速球', cable: '绳索滑轮', dumbbell: '哑铃',
  'elliptical machine': '椭圆机', 'ez barbell': '曲杆杠铃', hammer: '锤子',
  kettlebell: '壶铃', 'leverage machine': '杠杆器械', 'medicine ball': '药球',
  'olympic barbell': '奥杠', 'resistance band': '阻力带', roller: '泡沫轴',
  rope: '绳', 'skierg machine': '滑雪测功仪', 'sled machine': '雪橇机',
  'smith machine': '史密斯机', 'stability ball': '稳定球',
  'stationary bike': '固定自行车', 'stepmill machine': '爬楼机', tire: '轮胎',
  'trap bar': '六角杠铃', 'upper body ergometer': '上肢测功仪', weighted: '负重',
  'wheel roller': '健腹轮',
};

// 器材类型归类
const EQUIPMENT_TYPES = [
  { key: 'free_weight', label: '自由重量', items: ['barbell', 'ez barbell', 'olympic barbell', 'trap bar', 'dumbbell', 'kettlebell', 'hammer', 'weighted', 'tire', 'sled machine'] },
  { key: 'machine', label: '固定器械', items: ['leverage machine', 'smith machine', 'assisted', 'stepmill machine', 'upper body ergometer'] },
  { key: 'cable', label: '索绳/滑轮', items: ['cable', 'rope'] },
  { key: 'bodyweight', label: '自重', items: ['body weight'] },
  { key: 'band', label: '弹力带', items: ['band', 'resistance band'] },
  { key: 'ball', label: '球类', items: ['bosu ball', 'medicine ball', 'stability ball'] },
  { key: 'roller', label: '滚轮/泡沫轴', items: ['roller', 'wheel roller'] },
  { key: 'cardio_machine', label: '有氧器械', items: ['elliptical machine', 'skierg machine', 'stationary bike'] },
];

// 器材 key → 类型 key（反查）
const EQUIPMENT_TO_TYPE = {};
for (const t of EQUIPMENT_TYPES) {
  for (const e of t.items) EQUIPMENT_TO_TYPE[e] = t.key;
}

/**
 * 构建 /meta 完整结构（带计数）。
 */
function buildMeta(db) {
  const countBy = (col, val) =>
    db.prepare(`SELECT COUNT(*) AS n FROM exercises WHERE ${col} = ?`).get(val).n;

  // 部位树：按数据实际分布 GROUP BY body_part + target
  const rows = db.prepare(`
    SELECT body_part, target, COUNT(*) AS n
    FROM exercises GROUP BY body_part, target ORDER BY body_part, n DESC
  `).all();

  const byPart = new Map();
  for (const r of rows) {
    if (!byPart.has(r.body_part)) byPart.set(r.body_part, []);
    byPart.get(r.body_part).push({
      key: r.target, label: TARGET_LABELS[r.target] || r.target, count: r.n,
    });
  }
  const parts = [...byPart.entries()].map(([key, targets]) => ({
    key, label: BODY_PART_LABELS[key] || key,
    count: targets.reduce((s, t) => s + t.count, 0), targets,
  }));

  // 器材类型 → 器材（带计数）
  const equipmentTypes = EQUIPMENT_TYPES.map(t => ({
    key: t.key, label: t.label,
    items: t.items.map(e => ({
      key: e, label: EQUIPMENT_LABELS[e] || e, count: countBy('equipment', e),
    })).filter(i => i.count > 0),
  })).filter(t => t.items.length > 0);

  return { parts, equipmentTypes, langs: ['zh', 'en', 'es', 'it', 'tr', 'ru', 'hi', 'pl', 'ko', 'fr'] };
}

module.exports = { buildMeta, EQUIPMENT_TO_TYPE, BODY_PART_LABELS, TARGET_LABELS, EQUIPMENT_LABELS, EQUIPMENT_TYPES };
