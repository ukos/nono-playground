// 役者の表示に使う画像レイヤーを決める。
// layered: base ＋ eyes ＋ mouth を重ねる。sheet: 完成画像1枚を差し替える。
// どちらも、パーツが無い組み合わせは plain にフォールバックする。

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

/** 表示レイヤーのURL配列（下から順）を返す。view が full の場合は全身画像1枚。 */
export function resolveLayers(db, actorId, { costume = 'default', view = 'bust', eyes = 'normal', mouth = 'normal' } = {}) {
  const actor = db.byId[actorId];
  if (!actor) return { view: 'bust', layers: [] };
  const root = `actors/${actor.id}/`;
  const c = costumeDir(actor, costume);
  const spec = actor.costumes?.[c.name] || {};
  if (view === 'full' && spec.full) return { view: 'full', layers: [`${c.dir}full.png`] };

  const m = actor.hasMouth ? mouth || 'normal' : null;
  const e = eyes || 'normal';
  const plain = { view: 'bust', layers: [`${c.dir}plain.png`] };

  if (actor.faceMode === 'sheet') {
    const key = m ? `${e}_${m}` : e;
    const faces = actor.faces || [];
    return faces.includes(key) ? { view: 'bust', layers: [`${c.dir}faces/${key}.png`] } : plain;
  }
  const parts = actor.parts || { eyes: [], mouth: [] };
  if (!parts.eyes.includes(e)) return plain;
  if (m && !parts.mouth.includes(m)) return plain;
  const layers = [`${c.dir}base.png`, `${root}eyes/${e}.png`];
  if (m) layers.push(`${root}mouth/${m}.png`);
  return { view: 'bust', layers };
}

/** 作品で使う可能性のある役者画像をすべて列挙する（先読み用）。 */
export function allLayersFor(db, actorId, costumes) {
  const actor = db.byId[actorId];
  if (!actor) return [];
  const out = new Set();
  for (const cos of costumes) {
    const c = costumeDir(actor, cos);
    out.add(`${c.dir}plain.png`);
    if (actor.costumes?.[c.name]?.full) out.add(`${c.dir}full.png`);
    if (actor.faceMode === 'sheet') {
      for (const k of actor.faces || []) out.add(`${c.dir}faces/${k}.png`);
    } else {
      out.add(`${c.dir}base.png`);
      for (const e of actor.parts?.eyes || []) out.add(`actors/${actor.id}/eyes/${e}.png`);
      for (const m of actor.parts?.mouth || []) out.add(`actors/${actor.id}/mouth/${m}.png`);
    }
  }
  return [...out];
}
