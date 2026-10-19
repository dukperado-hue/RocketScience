/**
 * Every locked part or blueprint says WHERE it unlocks, and the tap takes the player there:
 *   'bench'      craft the propellant grade at the Mixing bench (the Factory opens and scrolls to it)
 *   'missions'   finish a campaign mission, or play it in Sandbox (the Missions tab)
 *   'space-age'  above the Early Access cap: nothing to unlock yet
 */
import { GRADES, type GradeId } from '@/chemistry/mixingBench';
import { requiredGrade, type FactoryPartDef } from '@/phases/assembly/model/catalog';

export type LockWhere = 'bench' | 'missions' | 'space-age';
export interface LockInfo { where: LockWhere; en: string; th: string; grade?: GradeId }

export const gradeLock = (name: string, grade: GradeId): LockInfo => ({
  where: 'bench', grade,
  en: `${name} needs ${GRADES[grade].name.toLowerCase()}. Craft it at the Mixing bench — opening it now.`,
  th: `${name} ต้องใช้${GRADES[grade].nameTh} ผสมได้ที่ “โต๊ะผสมเชื้อเพลิง” — กำลังเปิดให้`,
});

export const missionLock = (name: string, label: string, title: string): LockInfo => ({
  where: 'missions',
  en: `${name} unlocks with Mission ${label} · ${title}. Finish it — or try everything now in Sandbox (Missions tab).`,
  th: `${name} ปลดล็อกเมื่อทำภารกิจ ${label} สำเร็จ หรือลองทุกอย่างได้เลยในโหมด Sandbox (แท็บ Missions)`,
});

export const spaceAgeLock = (name: string, capLabel: string, capLabelTh: string): LockInfo => ({
  where: 'space-age',
  en: `${name}: ${capLabel}. This Early Access build covers Tier 0–2, so there is nothing to unlock yet.`,
  th: `${name}: ${capLabelTh} เวอร์ชัน Early Access มีถึง Tier 0–2 จึงยังไม่มีวิธีปลดล็อก`,
});

/** What the campaign says about a part (MissionManager's answers, passed in so this stays testable) */
export interface LockContext {
  comingSoon(partId: string): boolean;
  unlockedBy(partId: string): { label: string; title: string } | null;
  cap: { label: string; labelTh: string } | null;
}

/** null = not locked */
export function lockForPart(def: Pick<FactoryPartDef, 'id' | 'name' | 'engine'>, c: LockContext, crafted: Partial<Record<GradeId, number>>): LockInfo | null {
  if (c.comingSoon(def.id) && c.cap) return spaceAgeLock(def.name, c.cap.label, c.cap.labelTh);
  const m = c.unlockedBy(def.id);
  if (m) return missionLock(def.name, m.label, m.title);
  const g = requiredGrade(def as FactoryPartDef);
  if (g && crafted[g] === undefined) return gradeLock(def.name, g);
  return null;
}
