/**
 * Field notes — the real-world traditions behind the game's missions (Yi Peng lanterns, Bun Bang Fai, the spirit house).
 *
 * DRAFT FOR COMMUNITY REVIEW: written from widely published general knowledge, in plain words, with each game
 * simplification stated. Before the public launch someone from the Lanna and Isan communities should read them
 * (see `reviewed`) — names, dates and customs differ between villages, and these notes say so where they can.
 */
export interface FieldNote {
  id: string;
  icon: string;
  title: string; titleTh: string;
  /** One or two paragraphs, English then Thai */
  body: { en: string; th: string }[];
  /** A few words to try, with how they are said and what they mean */
  words?: { th: string; say: string; en: string; meaningTh: string }[];
  /** What the game simplifies or changes */
  game: { en: string; th: string };
  /** Flip to true once a reader from the community has checked the note */
  reviewed: boolean;
}

/**
 * Public-release gate: the notes below are unreviewed drafts, so nothing renders until a Lanna / Isan reader signs them off.
 * Flip to true (or mark each note `reviewed: true`) once that has happened; the drafts stay in the source.
 */
export const FIELD_NOTES_PUBLIC = false;

export const FIELD_NOTES: FieldNote[] = [
  {
    id: 'yipeng', icon: '🏮', title: 'Yi Peng, the Lanna festival of lights', titleTh: 'ยี่เป็ง เทศกาลแห่งแสงของล้านนา',
    body: [
      { en: 'Yi Peng is the Lanna festival of the full moon of the second month of the northern Thai calendar — usually in November, around the same night as Loy Krathong elsewhere in Thailand. “Yi” means second and “peng” is the northern word for the full-moon night. People light lamps, hang decorated lanterns (khom kwaen) and release khom loi sky lanterns to make merit and to let go of bad luck.',
        th: 'ยี่เป็งคือประเพณีล้านนาในคืนเพ็ญเดือนยี่ตามปฏิทินล้านนา มักตรงกับเดือนพฤศจิกายน ราวคืนเดียวกับลอยกระทงในภาคอื่น “ยี่” แปลว่าสอง “เป็ง” คือคำเหนือที่หมายถึงคืนเพ็ญ ผู้คนจุดประทีป แขวนโคมประดับ (โคมแขวน) และปล่อยโคมลอยเพื่อทำบุญและปล่อยโชคร้ายให้ลอยไป' },
      { en: 'A lantern keeps drifting for kilometres, so releases near airports are restricted in Thailand and need coordination with the aviation authorities. That is why Mission 1 asks you to choose the beach and the wind like an organiser who has to answer to the control tower.',
        th: 'โคมลอยไปได้ไกลหลายกิโลเมตร การปล่อยใกล้สนามบินจึงถูกควบคุมและต้องประสานกับหน่วยงานการบิน ภารกิจที่ 1 จึงให้คุณเลือกชายหาดและทิศลมแบบผู้จัดงานที่ต้องตอบหอบังคับการบิน' },
    ],
    words: [
      { th: 'โคมลอย', say: 'khom loi', en: 'sky lantern', meaningTh: 'โคมที่ลอยขึ้นด้วยอากาศร้อน' },
      { th: 'โคมแขวน', say: 'khom kwaen', en: 'hanging lantern', meaningTh: 'โคมประดับที่แขวนไว้' },
      { th: 'ฮ้อน', say: 'hon', en: 'hot (northern)', meaningTh: 'ร้อน (คำเมือง)' },
      { th: 'จ๊าดนัก', say: 'jat nak', en: 'very much (northern)', meaningTh: 'มากเลย (คำเมือง)' },
      { th: 'เต๊อะ', say: 'toe', en: '“come on / let’s” (northern particle)', meaningTh: 'เถอะ (คำเมือง)' },
    ],
    game: { en: 'The game flies a lantern with a hot-air model (a flame under a paper envelope) and puts the Samui airport next to Koh Phangan as the lesson. Real festivals are arranged by the community together with the authorities; this is a simulation, not legal advice.',
      th: 'เกมบินโคมด้วยแบบจำลองอากาศร้อน (เปลวไฟใต้ซองกระดาษ) และใช้สนามบินสมุยข้างเกาะพะงันเป็นบทเรียน งานจริงจัดโดยชุมชนร่วมกับหน่วยงาน นี่เป็นการจำลอง ไม่ใช่คำแนะนำทางกฎหมาย' },
    reviewed: false,
  },
  {
    id: 'bangfai', icon: '🚀', title: 'Bun Bang Fai, the rocket festival', titleTh: 'บุญบั้งไฟ ประเพณีขอฝนของอีสาน',
    body: [
      { en: 'In the dry weeks before the rains — around May — villages across Isan, and Yasothon most famously, hold Bun Bang Fai. It is a merit-making festival where homemade rockets are launched to ask Phaya Thaen, the sky deity, for rain for the rice fields. Each community (kum) builds and decorates its rocket and parades it with music and dance before the launch.',
        th: 'ในช่วงแล้งก่อนฤดูฝน ราวเดือนพฤษภาคม หมู่บ้านทั่วอีสาน โดยเฉพาะยโสธร จัดบุญบั้งไฟ เป็นงานบุญที่จุดบั้งไฟเพื่อขอฝนจากพญาแถน เทพแห่งท้องฟ้า เพื่อให้นาข้าวมีน้ำ แต่ละคุ้มสร้างและตกแต่งบั้งไฟของตนและแห่ด้วยดนตรีและการฟ้อนรำก่อนจุด' },
      { en: 'How a rocket rises is traditionally read as a sign for the coming rains, and launches are judged on height and style. A rocket that fails to leave the tower is a good-humoured defeat: in many places its team gets a soaking in the mud. The village headman, the elders and the whole village watch together.',
        th: 'การขึ้นของบั้งไฟถือเป็นสัญญาณของฝนในปีนั้น และมีการตัดสินทั้งความสูงและความสวยงาม บั้งไฟที่ไม่ขึ้นเป็นความพ่ายแพ้อย่างอารมณ์ดี ในหลายที่ทีมเจ้าของจะถูกจับโยนลงโคลน ผู้ใหญ่บ้าน ผู้เฒ่าผู้แก่ และทั้งหมู่บ้านดูด้วยกัน' },
    ],
    words: [
      { th: 'เบิ่ง', say: 'beung', en: 'look, watch (Isan)', meaningTh: 'ดู' },
      { th: 'ม่วนหลาย', say: 'muan lai', en: 'lots of fun (Isan)', meaningTh: 'สนุกมาก' },
      { th: 'บ่เป็นหยัง', say: 'bo pen nyang', en: 'never mind (Isan)', meaningTh: 'ไม่เป็นไร' },
      { th: 'แม่นแล้ว', say: 'maen laeo', en: 'that’s right (Isan)', meaningTh: 'ใช่แล้ว' },
      { th: 'เด้อ', say: 'doe', en: 'polite “okay?” particle (Isan)', meaningTh: 'นะ (คำท้ายประโยค)' },
    ],
    game: { en: 'The game’s Bang Fai is simplified: the Mixing bench uses classes of ingredients (something to burn, something to supply oxygen, a moderator), never real chemicals or amounts, and the village rockets are far bigger and more varied than the one you fly. No part of the game is a how-to for building one.',
      th: 'บั้งไฟในเกมถูกทำให้ง่ายขึ้น โต๊ะผสมใช้เพียงประเภทของส่วนผสม (ตัวเผาไหม้ ตัวให้ออกซิเจน ตัวหน่วง) ไม่มีสารเคมีหรือปริมาณจริง และบั้งไฟของหมู่บ้านใหญ่และหลากหลายกว่าที่คุณบินในเกมมาก ไม่มีส่วนใดของเกมสอนวิธีทำจริง' },
    reviewed: false,
  },
  {
    id: 'spirithouse', icon: '🛖', title: 'The spirit house by the pad', titleTh: 'ศาลพระภูมิข้างลานปล่อย',
    body: [
      { en: 'Many Thai homes, shops and building sites keep a spirit house (san phra phum) for the guardian spirit of the land, with offerings of flowers, incense and often red soda. Before something important starts, people ask the spirit for a safe day. The little house beside the launch pad is that: it stays calm during a good flight and reaches out after a bad one.',
        th: 'บ้าน ร้านค้า และสถานที่ก่อสร้างของไทยจำนวนมากมีศาลพระภูมิสำหรับเจ้าที่ ถวายดอกไม้ ธูป และมักมีน้ำแดง ก่อนเริ่มงานสำคัญผู้คนจะขอให้เจ้าที่คุ้มครอง ศาลหลังเล็กข้างลานปล่อยคือสิ่งนั้น เมื่อบินดีจะนิ่งสงบ และเมื่อพลาดจะยื่นมือมาคุย' },
    ],
    game: { en: 'A playful touch, not a claim about belief: the offering appears after a good landing.', th: 'เป็นความน่ารักของเกม ไม่ใช่การอ้างความเชื่อ: เครื่องเซ่นจะปรากฏเมื่อลงจอดได้ดี' },
    reviewed: false,
  },
];
export const FIELD_NOTE: Record<string, FieldNote> = Object.fromEntries(FIELD_NOTES.map((n) => [n.id, n]));

/** Notes that may be shown to players right now */
export const visibleFieldNotes = (): FieldNote[] => (FIELD_NOTES_PUBLIC ? FIELD_NOTES : FIELD_NOTES.filter((n) => n.reviewed));

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** One note as HTML (a <details> block); `open` expands it */
export function fieldNoteHtml(n: FieldNote, open = false): string {
  const words = n.words?.length ? `<ul class="fn-words">${n.words.map((w) => `<li><b lang="th">${esc(w.th)}</b> <i>${esc(w.say)}</i> <span>${esc(w.en)}</span></li>`).join('')}</ul>` : '';
  return `<details class="field-note"${open ? ' open' : ''}>
    <summary><span aria-hidden="true">${n.icon}</span> ${esc(n.title)} <small>${esc(n.titleTh)}</small></summary>
    ${n.body.map((p) => `<p>${esc(p.en)}</p><p lang="th" class="th">${esc(p.th)}</p>`).join('')}
    ${words}
    <p class="fn-game"><b>In the game · ในเกม</b> ${esc(n.game.en)} <span lang="th">${esc(n.game.th)}</span></p>
    ${n.reviewed ? '' : '<p class="fn-draft">Draft for community review · ฉบับร่าง รอผู้รู้ในชุมชนตรวจสอบ</p>'}
  </details>`;
}

/** Local colour for the pad: what Mission Control says about the place before a flight (never changes the physics) */
export function padGreeting(place: 'yasothon' | 'lantern' | 'other'): string {
  if (!FIELD_NOTES_PUBLIC) place = 'other'; // regional colour is still draft
  if (place === 'yasothon') return 'Yasothon. The whole village came to watch, and the headman is already asking “บั้งไฟสิขึ้นบ่?” — will it go up? Say nothing; stand clear. Standing by for your go.';
  if (place === 'lantern') return 'Full-moon night, ยี่เป็ง lanterns on every beach. Radar is up — check it before you release. Standing by for your go.';
  return 'Vehicle on the pad — standing by for your go.';
}
