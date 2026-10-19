import type { Mission } from '@/campaign/campaign';

type Objective = Mission['objectives'][number];

/** Text of the bilingual banner shown the moment an objective is met */
export function objectiveBannerText(m: Pick<Mission, 'label'>, o: Pick<Objective, 'text' | 'textTh'>) {
  return { title: `✓ ภารกิจ ${m.label} · เป้าหมายสำเร็จ / Objective done`, th: o.textTh, en: o.text, capcom: `Objective logged: ${o.text}.` };
}

/** Thai half of the Mission-complete card */
export function missionCompleteTh(m: Pick<Mission, 'label' | 'titleTh' | 'rewards'>, crewApproves: boolean) {
  return {
    title: `ภารกิจ ${m.label} สำเร็จ · ${m.titleTh}`,
    text: crewApproves ? `ซอมบี้ควบคุมอนุมัติ ปลดล็อก: ${m.rewards.textTh}` : `ปลดล็อก: ${m.rewards.textTh} · มีบันทึกใหม่ใน Story log`,
  };
}
