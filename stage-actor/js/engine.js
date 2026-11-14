// 脚本の実行エンジン（DOMに依存しない純粋なロジック）。
// 画面状態は常に「ステップ0から、選択履歴に従って再生し直した結果」として作る（決定論的再構築）。

export const EYES = ['normal', 'joy', 'anger', 'sorrow', 'fun', 'surprise', 'crying', 'closed'];
export const MOUTHS = ['normal', 'open'];
export const POSITIONS = ['left', 'center', 'right'];
export const VIEWS = ['bust', 'full'];
export const BG_MODES = ['stage', 'full'];
export const OPS = ['bg', 'show', 'hide', 'say', 'nar', 'choice', 'label', 'jump', 'if', 'set', 'end'];

const MAX_OPS = 100000;

// 背景名は bg の src（旧名 name も可）。null は背景なし（暗転）。ラベル名は label の id（旧名 name も可）。
export const bgKey = (s) => ('src' in s ? s.src : s.name) ?? null;
export const labelName = (s) => s.id ?? s.name;

export function compile(script) {
  const labels = new Map();
  script.steps.forEach((s, i) => {
    if (s.op === 'label') labels.set(labelName(s), i);
  });
  const roleOf = {};
  const costumeOf = {};
  for (const c of script.cast || []) {
    if (!(c.actor in roleOf)) roleOf[c.actor] = c.role;
    if (!(c.actor in costumeOf)) costumeOf[c.actor] = c.costume || 'default';
  }
  return { script, labels, roleOf, costumeOf };
}

function initialState() {
  return { bg: null, bgMode: 'stage', actors: {}, order: [], flags: {} };
}

const clone = (o) => JSON.parse(JSON.stringify(o));

function optionFlags(set) {
  if (!set) return {};
  if (typeof set === 'string') return { [set]: true };
  if (Array.isArray(set)) return Object.fromEntries(set.map((f) => [f, true]));
  return { ...set };
}

/**
 * 脚本を先頭から再生し、表示単位（stop）の列を返す。
 * stop = { kind: 'say'|'nar'|'choice'|'end', pc, choicesBefore, state, line }
 * choices: これまでに選んだ選択肢の番号の配列。足りなければ最初の未回答の choice で止まる。
 */
export function play(compiled, choices = []) {
  const { script, labels, roleOf, costumeOf } = compiled;
  const steps = script.steps;
  const st = initialState();
  const stops = [];
  let pc = 0;
  let ci = 0;
  let ops = 0;

  const jumpTo = (name) => {
    const t = labels.get(name);
    if (t === undefined) throw new Error(`ラベル「${name}」が見つかりません（step ${pc}）`);
    pc = t;
  };
  const snap = (kind, line) => {
    const stop = { kind, pc, choicesBefore: ci, state: clone(st), line };
    stops.push(stop);
    return stop;
  };

  while (pc < steps.length) {
    if (++ops > MAX_OPS) throw new Error('実行ステップ数が上限を超えました（無限ループの可能性）');
    const s = steps[pc];
    switch (s.op) {
      case 'bg':
        st.bg = bgKey(s);
        st.bgMode = s.mode || 'stage';
        pc++;
        break;
      case 'show': {
        const prev = st.actors[s.actor];
        st.actors[s.actor] = {
          pos: s.pos || prev?.pos || 'center',
          costume: s.costume || prev?.costume || costumeOf[s.actor] || 'default',
          view: s.view || 'bust',
          eyes: prev?.eyes || 'normal',
          mouth: prev?.mouth || 'normal',
        };
        st.order = st.order.filter((a) => a !== s.actor).concat(s.actor);
        st.bgMode = 'stage';
        pc++;
        break;
      }
      case 'hide':
        if (s.actor) {
          delete st.actors[s.actor];
          st.order = st.order.filter((a) => a !== s.actor);
        } else {
          st.actors = {};
          st.order = [];
        }
        pc++;
        break;
      case 'say': {
        const a = st.actors[s.actor];
        if (a) {
          a.eyes = s.eyes || 'normal';
          a.mouth = s.mouth || 'normal';
        }
        snap('say', { actor: s.actor, name: s.name || roleOf[s.actor] || s.actor, text: s.text });
        pc++;
        break;
      }
      case 'nar':
        snap('nar', { text: s.text });
        pc++;
        break;
      case 'choice': {
        const stop = snap('choice', { text: s.text || '', options: s.options.map((o) => o.text) });
        if (ci >= choices.length) return { stops, waiting: true, done: false, flags: st.flags };
        const k = choices[ci++];
        const opt = s.options[k];
        if (!opt) throw new Error(`選択肢 ${k} は存在しません（step ${pc}）`);
        stop.chosen = k;
        Object.assign(st.flags, optionFlags(opt.set));
        jumpTo(opt.jump);
        break;
      }
      case 'label':
        pc++;
        break;
      case 'jump':
        jumpTo(s.to);
        break;
      case 'if': {
        const v = st.flags[s.flag];
        const hit = 'value' in s ? v === s.value : !!v;
        if (hit) jumpTo(s.to);
        else pc++;
        break;
      }
      case 'set':
        st.flags[s.flag] = 'value' in s ? s.value : true;
        pc++;
        break;
      case 'end':
        snap('end', { text: s.text || '終演' });
        return { stops, waiting: false, done: true, flags: st.flags };
      default:
        throw new Error(`未知のコマンド「${s.op}」（step ${pc}）`);
    }
  }
  snap('end', { text: '終演' });
  return { stops, waiting: false, done: true, flags: st.flags };
}

/** 再生位置の管理。進む・戻る・選択を受け付け、毎回 play() で再構築する。 */
export class Session {
  constructor(script) {
    this.compiled = compile(script);
    this.choices = [];
    this.cursor = 0;
    this.rebuild();
  }
  rebuild() {
    this.result = play(this.compiled, this.choices);
    if (this.cursor >= this.result.stops.length) this.cursor = this.result.stops.length - 1;
  }
  get current() {
    return this.result.stops[this.cursor];
  }
  get awaitingChoice() {
    return this.current.kind === 'choice' && this.current.chosen === undefined;
  }
  get atEnd() {
    return this.current.kind === 'end';
  }
  /** 進めたら true。選択待ち・終演では false。 */
  next() {
    if (this.awaitingChoice || this.atEnd) return false;
    if (this.cursor < this.result.stops.length - 1) {
      this.cursor++;
      return true;
    }
    return false;
  }
  /** 戻れたら true。選択肢をまたいだ場合はその選択を取り消す。 */
  back() {
    if (this.cursor === 0) return false;
    this.cursor--;
    this.choices = this.choices.slice(0, this.current.choicesBefore);
    this.rebuild();
    return true;
  }
  choose(k) {
    if (!this.awaitingChoice) return false;
    this.choices = this.choices.slice(0, this.current.choicesBefore).concat(k);
    this.rebuild();
    if (this.cursor < this.result.stops.length - 1) this.cursor++;
    return true;
  }
}
