// 役者の表示に使う画像レイヤーを決める。
// base.png は「通常の表情（目元 normal・口元 normal）の完成画像」。
//   sheet  （標準）：合成済みの1枚 faces/<eyes>_<mouth>.png に差し替える。normal/normal は base.png。
//   layered（予備）：base.png の上に、元の目・口を覆う不透明な表情レイヤー eyes/<名前>.png・mouth/<名前>.png を重ねる。
// どちらも、無い組み合わせは base.png（通常の顔）にフォールバックする。

export function indexActors(db) {
  const byId = {};
  for (const a of db.actors) byId[a.id] = a;
  return { ...db, byId };
}

export function costumeDir(actor, costume) {
  const root = `actors/${actor.id}/`;
  const name = actor.costumes && actor.costumes[costume] ? costume : 'default';
  return { name, dir: name === 'default' ? root : `${root}costumes/${name}/` };
}

/** 合成済み画像のキー。口元の無い役者は目元だけ。 */
export function faceKey(actor, eyes, mouth) {
  return actor.hasMouth ? `${eyes}_${mouth}` : eyes;
}

/** 表示レイヤーのURL配列（下から順）を返す。view が full の場合は全身画像1枚。 */
export function resolveLayers(db, actorId, { costume = 'default', view = 'bust', eyes = 'normal', mouth = 'normal' } = {}) {
  const actor = db.byId[actorId];
  if (!actor) return { view: 'bust', layers: [] };
  const root = `actors/${actor.id}/`;
  const c = costumeDir(actor, costume);
  const spec = actor.costumes?.[c.name] || {};
  if (view === 'full' && spec.full) return { view: 'full', layers: [`${c.dir}full.png`] };

  const e = eyes || 'normal';
  const m = actor.hasMouth ? mouth || 'normal' : 'normal';
  const base = { view: 'bust', layers: [`${c.dir}base.png`] };
  if (e === 'normal' && m === 'normal') return base;

  if (actor.faceMode !== 'layered') {
    const key = faceKey(actor, e, m);
    return (actor.faces || []).includes(key) ? { view: 'bust', layers: [`${c.dir}faces/${key}.png`] } : base;
  }
  const parts = actor.parts || { eyes: [], mouth: [] };
  if (e !== 'normal' && !parts.eyes.includes(e)) return base;
  if (m !== 'normal' && !parts.mouth.includes(m)) return base;
  const layers = [`${c.dir}base.png`];
  if (e !== 'normal') layers.push(`${root}eyes/${e}.png`);
  if (m !== 'normal') layers.push(`${root}mouth/${m}.png`);
  return { view: 'bust', layers };
}

/** 作品で使う可能性のある役者画像をすべて列挙する（先読み用）。 */
export function allLayersFor(db, actorId, costumes) {
  const actor = db.byId[actorId];
  if (!actor) return [];
  const out = new Set();
  for (const cos of costumes) {
    const c = costumeDir(actor, cos);
    out.add(`${c.dir}base.png`);
    if (actor.costumes?.[c.name]?.full) out.add(`${c.dir}full.png`);
    if (actor.faceMode !== 'layered') {
      for (const k of actor.faces || []) out.add(`${c.dir}faces/${k}.png`);
    } else {
      for (const e of actor.parts?.eyes || []) out.add(`actors/${actor.id}/eyes/${e}.png`);
      for (const m of actor.parts?.mouth || []) out.add(`actors/${actor.id}/mouth/${m}.png`);
    }
  }
  return [...out];
}
