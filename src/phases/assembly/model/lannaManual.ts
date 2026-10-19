/**
 * The Lanna Instruction Manual — comedic "official" assembly notes for the early parts, shown as
 * tooltips in the Factory (Inventory). Content only. Each entry: a short headline, two or three
 * numbered steps, and a warning in the voice of a very old, very tired workshop manual.
 * Thai lines are short glosses, not translations of every joke.
 */
export interface ManualEntry { title: string; steps: string[]; warn: string; th: string }

export const LANNA_MANUAL: Record<string, ManualEntry> = {
  'envelope-s': {
    title: 'Small paper lantern',
    steps: ['Unfold gently. It is paper.', 'Attach a heat source underneath. A small one. No — smaller.'],
    warn: 'Too small for a full fuel cell. It will become a very brief, very bright lantern.',
    th: 'โคมเล็ก ไฟเยอะเกินจะลุกเป็นไฟ',
  },
  'envelope-m': {
    title: 'Khom loi (sky lantern)',
    steps: ['Hold the lantern open by its bamboo ring.', 'Light the fuel cell. Wait for the paper to feel warm and hopeful.', 'Let go. Do not chase it. You will not catch it.'],
    warn: 'Lanterns follow the wind, not your wishes. Check where Samui airport is before you make one.',
    th: 'โคมลอยไปตามลม ไม่ใช่ตามคำอธิษฐาน',
  },
  'envelope-l': {
    title: 'Festival lantern, large',
    steps: ['Requires two people and one grandmother supervising.', 'Fill with hot air slowly. Do not hurry the lantern.'],
    warn: 'Carries a little extra. Not a zombie. We checked.',
    th: 'ต้องใช้สองคนกับคุณยายหนึ่งคนคุม',
  },
  'envelope-cloth': {
    title: 'Cotton hot-air balloon',
    steps: ['Fit the large bamboo hoop. The small one will tear.', 'Hang two heat sources from the hoop. One is a sad balloon.'],
    warn: 'Cotton is heavy and slow. Patience is included; matches are not.',
    th: 'ผ้าฝ้ายหนัก ต้องใช้ไฟสองจุด',
  },
  'bamboo-ring': {
    title: 'Bamboo mouth ring',
    steps: ['Split bamboo, bent into a circle by someone with strong thumbs.', 'Clip it to the bottom of the lantern. The crossed wires hold the fire.'],
    warn: 'Without the ring the lantern is a paper bag. A burning paper bag.',
    th: 'ไม่มีห่วง โคมก็คือถุงกระดาษติดไฟ',
  },
  'bamboo-frame': {
    title: 'Bamboo hoop, large',
    steps: ['For big lanterns and cloth balloons.', 'Two burner hooks, left and right. Use both, or lean to one side forever.'],
    warn: 'Not a hula hoop. Please return the hula hoop.',
    th: 'ห่วงใหญ่ มีที่แขวนไฟสองข้าง',
  },
  tealight: {
    title: 'Tea-light candle',
    steps: ['Place under lantern.', 'Watch nothing happen for four hours.'],
    warn: 'About 80 watts. Lovely for dinner. Cannot lift anything. Try it anyway — everyone does.',
    th: 'เทียนเล็ก ยกอะไรไม่ขึ้น ลองดูได้',
  },
  'fuel-cell': {
    title: 'Wax fuel cell (khi tai)',
    steps: ['Wax-soaked paper, rolled tight, like the old khi tai torches.', 'Hook it on the crossed wires. Light all four corners, not just one.'],
    warn: 'Burns ~12 minutes. The lantern does not land when you want it to. It lands when the wax says so.',
    th: 'ขี้ไต้/ก้อนเชื้อเพลิง ไหม้ราว 12 นาที',
  },
  'smoke-flare': {
    title: 'Smoke flare',
    steps: ['Twice the heat of a fuel cell, for two minutes.', 'Leaves a trail the whole province can see.'],
    warn: 'Under a small lantern it is not a lantern, it is a fireball with ambitions.',
    th: 'ร้อนจัด ควันเยอะ โคมเล็กลุกไหม้',
  },
  'wooden-chair': {
    title: 'Wooden chair (Wan Hu pattern)',
    steps: ['One chair. Forty-seven rockets. One volunteer who is already dead.', 'Tie the rockets to the legs, not to the volunteer.'],
    warn: 'Historically, the last pilot was never seen again. This is considered a success by Zombie Control.',
    th: 'เก้าอี้ว่านหู่ ผู้โดยสารต้องตายมาก่อน',
  },
  'gunpowder-tube': {
    title: 'Wan Hu rocket tube',
    steps: ['Bamboo tube, black powder, a fuse.', 'Point the open end down. Check twice. Ask someone else to check a third time.'],
    warn: 'Thrust is "enthusiastic". Direction is "a suggestion".',
    th: 'แรงขับเยอะ ทิศทางแล้วแต่ดวง',
  },
  'bang-fai': {
    title: 'Bang Fai (bamboo rocket)',
    steps: ['Pack with mixed powder from the Mixing Bench. Pack it hard.', 'Fit a tail stick, or it will chase you around the field.', 'Launch from the ramp at the festival, as the ancestors intended.'],
    warn: 'A Bang Fai turns into the wind. Wait for a calm morning, or enjoy the parade going sideways.',
    th: 'บั้งไฟหันหัวเข้าลม รอเช้าลมสงบ',
  },
  'tail-stick': {
    title: 'Tail stick (hang bang fai)',
    steps: ['A long bamboo pole on the back of the rocket.', 'It keeps the pointy end in front. That is the whole job.'],
    warn: 'Without one, the rocket flies backwards, then forwards, then into the temple.',
    th: 'หางบั้งไฟ ทำให้หัวชี้ไปข้างหน้า',
  },
  'cast-motor': {
    title: 'Cast-grain motor',
    steps: ['Poured, not packed. Very modern. Very 1950s.', 'Needs the right propellant grade from the Mixing Bench.'],
    warn: 'Smoother burn than bamboo. The village headman is suspicious of anything this smooth.',
    th: 'มอเตอร์หล่อ แรงขับเรียบ',
  },
  kite: {
    title: 'Kite',
    steps: ['Tie to the chair for "aerodynamics".', 'Do not ask what aerodynamics means.'],
    warn: 'Adds drag and a feeling of optimism.',
    th: 'ว่าว เพิ่มแรงต้านและความหวัง',
  },
  'fin-s': {
    title: 'Small fin',
    steps: ['Three or four, evenly around the bottom.', 'Fins at the back. The back is the end with the fire.'],
    warn: 'Fins at the front make the rocket do a U-turn. We have video.',
    th: 'ครีบไว้ท้ายจรวด ด้านที่มีไฟ',
  },
  'nose-s': {
    title: 'Nose cone, 12 cm',
    steps: ['Goes on top.', 'Pointy end up.'],
    warn: 'A flat top is also a choice. A slower one.',
    th: 'หัวกรวย ปลายแหลมขึ้นบน',
  },
  'chute-s': {
    title: 'Parachute, small',
    steps: ['Fold carefully. Pack on top.', 'It opens on the way down, if it remembers.'],
    warn: 'Rated for one zombie, gently. Not rated for "the whole chair".',
    th: 'ร่มเล็ก รับได้ซอมบี้หนึ่งตัว',
  },
};
