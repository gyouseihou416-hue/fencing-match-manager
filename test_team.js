// test_team.js - 団体戦ロジックの単体テスト
const team = require('../js/team.js');
const tournament = require('../js/tournament.js');

let pass = 0, fail = 0;
function eq(actual, expected, label) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(ok ? '[OK] ' + label : '[NG] ' + label + ' expected=' + JSON.stringify(expected) + ' actual=' + JSON.stringify(actual));
  if (ok) pass++; else fail++;
}
function truthy(v, label) {
  console.log(v ? '[OK] ' + label : '[NG] ' + label + ' got=' + v);
  if (v) pass++; else fail++;
}

console.log('--- 1. 公式対戦順 ---');
eq(team.TEAM_BOUT_ORDER.length, 9, '9試合ある');
eq(team.TEAM_BOUT_ORDER[0], { a: 3, b: 6 }, '1試合目: 3vs6');
eq(team.TEAM_BOUT_ORDER[1], { a: 1, b: 5 }, '2試合目: 1vs5');
eq(team.TEAM_BOUT_ORDER[2], { a: 2, b: 4 }, '3試合目: 2vs4');
eq(team.TEAM_BOUT_ORDER[8], { a: 3, b: 5 }, '9試合目: 3vs5');

console.log('--- 2. 各選手出場回数 ---');
const countsA = [0, 0, 0];
const countsB = [0, 0, 0];
team.TEAM_BOUT_ORDER.forEach(o => {
  countsA[o.a - 1] += 1;
  countsB[o.b - 4] += 1;
});
eq(countsA, [3, 3, 3], 'チームA: 各選手3試合');
eq(countsB, [3, 3, 3], 'チームB: 各選手3試合');

console.log('--- 3. 試合生成 ---');
const teamA = { id: 'tA', name: '広島A', members: ['山田', '佐藤', '鈴木'], memberFencerIds: ['1','2','3'] };
const teamB = { id: 'tB', name: '広島B', members: ['田中', '高橋', '伊藤'], memberFencerIds: ['4','5','6'] };
const tmKohaku = team.createTeamMatch(teamA, teamB, 'team_kohaku');
eq(tmKohaku.bouts.length, 9, '紅白戦: 9試合生成');
eq(tmKohaku.completed, false, '紅白戦: 開始時は未完了');
eq(tmKohaku.type, 'team_kohaku', '紅白戦タイプ');

const tmRelay = team.createTeamMatch(teamA, teamB, 'team_relay');
eq(tmRelay.bouts.length, 9, 'リレー: 9試合生成');
eq(tmRelay.type, 'team_relay', 'リレータイプ');

console.log('--- 4. 紅白戦の勝敗判定 ---');
const tm1 = team.createTeamMatch(teamA, teamB, 'team_kohaku');
team.recordTeamBout(tm1, 0, 5, 3);
team.recordTeamBout(tm1, 1, 5, 4);
team.recordTeamBout(tm1, 2, 5, 2);
team.recordTeamBout(tm1, 3, 5, 1);
eq(tm1.completed, false, '4勝時点では未完了');
team.recordTeamBout(tm1, 4, 5, 0);
eq(tm1.completed, true, '5勝で完了');
eq(tm1.winner, 'A', 'Aが勝者');
eq(tm1.finalScoreA, 5, 'Aの勝数=5');
eq(tm1.finalScoreB, 0, 'Bの勝数=0');

console.log('--- 5. リレーの勝敗判定 ---');
const tm2 = team.createTeamMatch(teamA, teamB, 'team_relay');
team.recordTeamBout(tm2, 0, 5, 4);
eq(tm2.bouts[0].cumulativeA, 5, '1試合目累計A');
eq(tm2.bouts[0].cumulativeB, 4, '1試合目累計B');
team.recordTeamBout(tm2, 1, 4, 5);
eq(tm2.bouts[1].cumulativeA, 9, '2試合目累計A');
team.recordTeamBout(tm2, 2, 5, 4);
team.recordTeamBout(tm2, 3, 4, 5);
team.recordTeamBout(tm2, 4, 5, 4);
team.recordTeamBout(tm2, 5, 5, 4);
team.recordTeamBout(tm2, 6, 5, 4);
team.recordTeamBout(tm2, 7, 5, 4);
eq(tm2.bouts[7].cumulativeA, 38, '8試合目累計A');
eq(tm2.bouts[7].cumulativeB, 34, '8試合目累計B');
eq(tm2.completed, false, '38対34では未完了');
team.recordTeamBout(tm2, 8, 7, 5);
eq(tm2.completed, true, 'リレー45本到達で完了');
eq(tm2.winner, 'A', 'Aが勝者');

console.log('--- 6. リレー9試合終了時 ---');
const tm3 = team.createTeamMatch(teamA, teamB, 'team_relay');
for (let i = 0; i < 9; i++) team.recordTeamBout(tm3, i, 4, 3);
eq(tm3.completed, true, '9試合終了で完了');
eq(tm3.winner, 'A', '累計多いAが勝者');
eq(tm3.finalScoreA, 36, '最終スコアA');
eq(tm3.finalScoreB, 27, '最終スコアB');

console.log('--- 7. 延長戦 ---');
const tm4 = team.createTeamMatch(teamA, teamB, 'team_kohaku');
team.recordTeamBout(tm4, 0, 4, 4);
eq(tm4.bouts[0].completed, false, '同点・延長未指定では未完了');
team.recordTeamBout(tm4, 0, 4, 4, 'A');
eq(tm4.bouts[0].completed, true, '延長指定で完了');
eq(tm4.bouts[0].winner, 'A', '延長戦Aが勝者');
eq(tm4.bouts[0].scoreA, 4, 'スコアは同点のまま');
eq(tm4.bouts[0].scoreB, 4, 'スコアBも同点のまま');
eq(tm4.bouts[0].tieBreakWinner, 'A', 'tieBreakWinner記録');

console.log('--- 8. 団体プール生成 ---');
const teams = [
  { id: 't1', name: 'チーム1', seed: 1, members: ['a','b','c'], memberFencerIds: ['1','2','3'] },
  { id: 't2', name: 'チーム2', seed: 2, members: ['a','b','c'], memberFencerIds: ['4','5','6'] },
  { id: 't3', name: 'チーム3', seed: 3, members: ['a','b','c'], memberFencerIds: ['7','8','9'] },
  { id: 't4', name: 'チーム4', seed: 4, members: ['a','b','c'], memberFencerIds: ['10','11','12'] },
];
const { pools, teamMatches } = team.generateTeamPools(teams, 1, 'team_kohaku');
eq(pools.length, 1, '1プール生成');
eq(pools[0].teamIds.length, 4, '4チーム配置');
eq(pools[0].matches.length, 6, '総当たり6試合（4C2）');
eq(teamMatches.length, 6, 'teamMatches 6件');

console.log('--- 9. トーナメント延長戦 ---');
const tt = tournament.generateTournament([
  { id: 'a', name: 'A', rank: 1 },
  { id: 'b', name: 'B', rank: 2 },
]);
tournament.recordTournamentResult(tt, 0, 0, 14, 14, null);
eq(tt.rounds[0][0].completed, false, '同点・延長未指定では未完了');
tournament.recordTournamentResult(tt, 0, 0, 14, 14, 'A');
eq(tt.rounds[0][0].completed, true, '延長指定で完了');
eq(tt.rounds[0][0].winner, 'a', '延長戦勝者A');
eq(tt.rounds[0][0].scoreA, 14, 'スコアは同点');
eq(tt.rounds[0][0].tieBreakWinner, 'A', 'tieBreakWinner記録');

console.log('--- 10. SVGブラケット ---');
const layout = tournament.computeBracketLayout(tt);
truthy(layout.width > 0, 'SVG width > 0');
truthy(layout.height > 0, 'SVG height > 0');
const svg = tournament.renderBracketSvg(tt);
truthy(svg.indexOf('<svg') >= 0, 'SVGタグ含む');
truthy(svg.indexOf('決勝') >= 0, '決勝ラベル含む');

console.log('--- 11. ラウンド名 ---');
eq(tournament.roundLabel(1, 0), '決勝', '1ラウンドの場合は決勝');
eq(tournament.roundLabel(2, 0), '準決勝', '2ラウンド・ri0は準決勝');
eq(tournament.roundLabel(2, 1), '決勝', '2ラウンド・ri1は決勝');
eq(tournament.roundLabel(3, 0), '準々決勝', '3ラウンド・ri0は準々決勝');
eq(tournament.roundLabel(5, 0), '1回戦', '5ラウンド・ri0は1回戦');
eq(tournament.roundLabel(5, 4), '決勝', '5ラウンド・ri4は決勝');

console.log('--- 12. 紅白戦の不戦勝（2人チーム） ---');
const teamShort = {
  id: 'tShort', name: '欠員チーム',
  memberFencerIds: ['f1', 'f2', ''],
  members: ['佐藤', '田中', ''],
  reserve: ''
};
const teamFull = {
  id: 'tFull', name: '完全チーム',
  memberFencerIds: ['f3', 'f4', 'f5'],
  members: ['鈴木', '高橋', '伊藤'],
  reserve: ''
};
const tmF = team.createTeamMatch(teamShort, teamFull, 'team_kohaku');
const forfeitBouts = tmF.bouts.filter(b => b.forfeit);
truthy(forfeitBouts.length > 0, '欠員試合がマークされる');
const aForfeitBouts = tmF.bouts.filter(b => b.forfeit === 'A');
eq(aForfeitBouts.length, 3, 'A選手3が3試合不戦勝（idx=2が3回出場）');
aForfeitBouts.forEach((b, i) => {
  eq(b.scoreA, 0, '不戦勝のscoreA=0 (#' + (i+1) + ')');
  eq(b.scoreB, 5, '不戦勝のscoreB=5 (#' + (i+1) + ')');
  eq(b.winner, 'B', '不戦勝の勝者はB (#' + (i+1) + ')');
});

console.log('--- 13. リレー3人未満は不可 ---');
const teamsRelay = [
  { id: 't1', name: 'チーム1', seed: 1, members: ['a','b','c'], memberFencerIds: ['1','2','3'] },
  { id: 't2', name: 'チーム2', seed: 2, members: ['a','b',''], memberFencerIds: ['4','5',''] },
];
const errs = team.validateTeamsForRelay(teamsRelay);
eq(errs.length, 1, '1チームがエラー');
truthy(errs[0].indexOf('チーム2') >= 0, 'エラーメッセージにチーム名');

console.log('--- 14. リザーブ交代 ---');
const teamWithReserve = {
  id: 'tR', name: 'リザーブあり',
  members: ['山田', '佐藤', '鈴木'],
  memberFencerIds: ['f1', 'f2', 'f3'],
  reserve: '田中',
  reserveFencerId: 'f4',
  substitutionUsed: false,
};
const teamOther = { id: 'tO', name: '相手', members: ['x','y','z'], memberFencerIds: ['a','b','c'], reserve: '' };
const tmSub = team.createTeamMatch(teamWithReserve, teamOther, 'team_kohaku');
const subResult = team.substituteReserve(tmSub, teamWithReserve, 'A', 0, 0);
eq(subResult.ok, true, 'リザーブ投入成功');
eq(teamWithReserve.substitutionUsed, true, '交代済みフラグ');
eq(teamWithReserve.members[0], '田中', 'リザーブが選手1の位置に');
eq(teamWithReserve.reserve, '山田', '元の選手1がリザーブ枠に');
const subResult2 = team.substituteReserve(tmSub, teamWithReserve, 'A', 1, 0);
eq(subResult2.ok, false, '2回目の交代は不可');

console.log('====================');
console.log('Pass: ' + pass + '  Fail: ' + fail);
console.log('====================');
process.exit(fail > 0 ? 1 : 0);
