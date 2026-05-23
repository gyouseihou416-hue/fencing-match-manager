// pool.js
// プール戦の振り分けと対戦順生成

/**
 * 参加者をプールに振り分ける（蛇行配分）
 * シード値が高い順に並べてからジグザグで配分し、上位選手が同じプールに固まらないようにする
 * @param {Array} fencers - シード順に並んだ選手配列
 * @param {Number} poolCount - プール数
 * @returns {Array<Array>} プールごとの選手配列
 */
function distributeFencers(fencers, poolCount) {
  const pools = Array.from({ length: poolCount }, () => []);
  fencers.forEach((f, i) => {
    const round = Math.floor(i / poolCount);
    const pos = i % poolCount;
    const poolIndex = round % 2 === 0 ? pos : poolCount - 1 - pos;
    pools[poolIndex].push(f);
  });
  return pools;
}

/**
 * 参加人数から推奨プール数を提案
 * 7人プールを基本とし、人数に応じて調整
 */
function suggestPoolCount(participantCount) {
  if (participantCount <= 7) return 1;
  if (participantCount <= 14) return 2;
  if (participantCount <= 21) return 3;
  if (participantCount <= 28) return 4;
  // 7人プールで割り切れる数を優先
  return Math.ceil(participantCount / 7);
}

/**
 * FIE 公式プール対戦順（人数別）
 * 各エントリは [選手番号A, 選手番号B] のリスト
 * 番号は1始まり（プール内インデックス）
 */
const POOL_ORDERS = {
  3: [[1, 2], [1, 3], [2, 3]],
  4: [[1, 4], [2, 3], [1, 3], [2, 4], [3, 4], [1, 2]],
  5: [
    [1, 2], [3, 4], [5, 1], [2, 3], [5, 4],
    [1, 3], [2, 5], [4, 1], [3, 5], [4, 2],
  ],
  6: [
    [1, 2], [4, 5], [2, 3], [5, 6], [3, 1], [6, 4],
    [2, 5], [1, 4], [5, 3], [1, 6], [4, 2], [3, 6],
    [5, 1], [3, 4], [6, 2],
  ],
  7: [
    [1, 4], [2, 5], [3, 6], [7, 1], [5, 4], [2, 3],
    [6, 7], [5, 1], [4, 3], [6, 2], [5, 7], [3, 1],
    [4, 6], [7, 2], [3, 5], [1, 6], [2, 4], [7, 3],
    [6, 5], [1, 2], [4, 7],
  ],
  8: [
    [2, 3], [1, 5], [7, 4], [6, 8], [1, 2], [3, 4],
    [5, 6], [8, 7], [4, 1], [5, 2], [8, 3], [6, 7],
    [4, 2], [8, 1], [7, 5], [3, 6], [2, 8], [5, 4],
    [6, 1], [3, 7], [4, 8], [2, 6], [3, 5], [1, 7],
    [4, 6], [8, 5], [7, 2], [1, 3],
  ],
};

/**
 * プールの選手配列から対戦カードを生成
 * @param {Array} poolFencers - 1プールの選手配列
 * @returns {Array} [{fencerA, fencerB, scoreA, scoreB, completed}]
 */
function generatePoolMatches(poolFencers) {
  const n = poolFencers.length;
  const order = POOL_ORDERS[n];
  if (!order) {
    // 公式表にない人数は総当たり順に生成（フォールバック）
    const matches = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        matches.push({
          fencerA: poolFencers[i].id,
          fencerB: poolFencers[j].id,
          fencerAName: poolFencers[i].name,
          fencerBName: poolFencers[j].name,
          scoreA: 0,
          scoreB: 0,
          completed: false,
        });
      }
    }
    return matches;
  }
  return order.map(([a, b]) => ({
    fencerA: poolFencers[a - 1].id,
    fencerB: poolFencers[b - 1].id,
    fencerAName: poolFencers[a - 1].name,
    fencerBName: poolFencers[b - 1].name,
    scoreA: 0,
    scoreB: 0,
    completed: false,
  }));
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { distributeFencers, suggestPoolCount, generatePoolMatches, POOL_ORDERS };
}
