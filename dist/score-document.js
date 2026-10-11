// 同一份 MusicXML 会被好几个消费者分别用到 DOM：
//   排版计划（engraving-plan）、演奏表情（performance）、PDF 坐标（app.decoratePdfCoordinates）、
//   声部名（practice-instrument.xmlScoreParts）。
// 它们以前各自 `new DOMParser().parseFromString(score.xml)` —— 一首 18MB 的大谱，
// 一次解析就要 1.1~2.1 秒（实测本机 DOMParser 约 116 ms/MB），于是一首曲子被反复解析四五次。
// 这里做「单条记忆化」：大家共用同一份 DOM，只保留最近一条，换曲即被替换，内存有界。
//
// 约定：拿到 doc 的调用方**只读**（querySelector / children），不要改动它。
let cachedXml = null, cachedDoc = null;

export function rememberScoreDocument(xml, doc) {
  if (xml && doc) { cachedXml = xml; cachedDoc = doc; }
}

export function scoreDocument(xml) {
  if (!xml) return null;
  if (cachedXml === xml && cachedDoc) return cachedDoc;
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  cachedXml = xml; cachedDoc = doc;
  return doc;
}
