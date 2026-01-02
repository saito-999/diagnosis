// data_questions.js
// 出典：別紙「質問定義（β）」
// - export は QUESTIONS のみ
// - QUESTIONS は配列形式に統一（混在禁止）
// - 質問文の表示は text を正とする
// - qid は "Q1"〜"Q20" を欠番なく保持する

export const QUESTIONS = [
  { qid: "Q1", phase: "matching", text: "初対面では無理に盛り上げない" },
  { qid: "Q2", phase: "matching", text: "気になる相手ほど慎重に接する" },
  { qid: "Q3", phase: "matching", text: "会話は多いより落ち着きを好む" },
  { qid: "Q4", phase: "matching", text: "相手が話す時間を優先しがち" },
  { qid: "Q5", phase: "matching", text: "好きになる前に観察することが多い" },
  { qid: "Q6", phase: "firstMeet", text: "相手の疲れに気づきやすい" },
  { qid: "Q7", phase: "firstMeet", text: "相手の沈黙を不安より尊重で受け取る" },
  { qid: "Q8", phase: "date", text: "気持ちより行動で信頼を判断する" },
  { qid: "Q9", phase: "date", text: "急な距離の接近は苦手" },
  { qid: "Q10", phase: "date", text: "丁寧さは長く続けられる" },
  { qid: "Q11", phase: "relationship", text: "理想と違っても好意が残りやすい" },
  { qid: "Q12", phase: "relationship", text: "本音を見せるのはだいぶ後になる" },
  { qid: "Q13", phase: "relationship", text: "雑に扱われても優しくしがち" },
  { qid: "Q14", phase: "marriage", text: "無理をされると距離を取ってしまう" },
  { qid: "Q15", phase: "marriage", text: "好きでも不安が消えないことが多い" },
  { qid: "Q16", phase: "marriage", text: "幸せが続くほど壊れるのが怖い" },
  { qid: "Q17", phase: "relationship", text: "優しさは演技ではなく習慣に近い" },
  { qid: "Q18", phase: "relationship", text: "約束を守るのは当然だと思っている" },
  { qid: "Q19", phase: "marriage", text: "一度決めた相手を長く大切にできる" },
  { qid: "Q20", phase: "marriage", text: "大切さは、行動に残るほうが安心する" },
];
