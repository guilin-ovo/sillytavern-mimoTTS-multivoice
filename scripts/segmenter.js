/**
 * 文本分段器（纯函数，不依赖酒馆）。
 *
 * 目标格式（见 样本.txt）：
 *   （旁白）
 *   叙述文本……
 *
 *   ***
 *   角色名字：青禾，
 *   性别：女，
 *   年龄：少女，
 *   叙述……[语气标签]“台词……”
 *
 *   ***
 *   系统积分：30
 *   ...
 *
 * 输出扁平数组：[{ kind, speaker, gender, age, tone, text }]
 *   kind: 'narration' | 'dialogue' | 'system'
 */

const NAME_RE = /^(?:角色名字|角色名|姓名|名字|角色)\s*[：:]\s*(.*?)[，,]?\s*$/;
const GENDER_RE = /^性别\s*[：:]\s*(.*?)[，,]?\s*$/;
const AGE_RE = /^年龄\s*[：:]\s*(.*?)[，,]?\s*$/;
const NARRATOR_RE = /^[（(]\s*旁白\s*[）)]\s*[:：]?\s*$/;
const SYSTEM_RE = /系统积分|系统空间|行囊|储物袋|背包|属性面板|物品栏/;
const MENTION_AFTER_RE = /^(三个字|两个字|四个字|个字|这几个字|这个词|这句话|一词|这词|这俩字)/;

const TONE_BRACKET_RE = /\[([^\[\]]{1,60})\]\s*$/;
const TONE_PAREN_RE = /[（(]([^（）()]{1,60})[）)]\s*$/;

function quoteRegex() {
    return /“([^”]{1,800})”|「([^」]{1,800})」|"([^"]{1,800})"/g;
}

/** 按 *** / --- / === 分块 */
export function splitBlocks(text) {
    return String(text || '')
        .split(/^\s*(\*{3,}|-{3,}|={3,})\s*$/m)
        .filter((_, i) => i % 2 === 0)
        .map((b) => b.trim())
        .filter(Boolean);
}

/** 长句按标点再切，控制单次请求长度 */
export function splitSentences(text, maxChars = 0) {
    const s = String(text || '').trim();
    if (!s) return [];
    if (!(maxChars > 0) || s.length <= maxChars) return [s];
    const parts = s.split(/(?<=[。！？!?；;…～~])/);
    const out = [];
    let buf = '';
    for (const p of parts) {
        if (!p) continue;
        if (buf && (buf + p).length > maxChars) {
            out.push(buf);
            buf = p;
        } else {
            buf += p;
        }
    }
    if (buf) out.push(buf);
    return out.map((x) => x.trim()).filter(Boolean);
}

/** 取尾部语气标签（[震惊] / （震惊）） */
function takeTrailingTone(text, mode) {
    let out = String(text || '');
    let tone = '';
    const m = out.match(TONE_BRACKET_RE);
    if (m) {
        tone = m[1].trim();
        out = out.slice(0, m.index);
    } else if (mode === 'bracket+paren') {
        const p = out.match(TONE_PAREN_RE);
        if (p) {
            tone = p[1].trim();
            out = out.slice(0, p.index);
        }
    }
    return { text: out, tone };
}

/** 解析块头部：名字 / 性别 / 年龄 / （旁白） */
export function parseBlock(block) {
    const lines = String(block).split(/\r?\n/);
    const info = { kind: 'block', name: '', gender: '', age: '' };
    const body = [];
    let header = true;

    for (const line of lines) {
        const t = line.trim();
        if (!t) {
            if (!header) body.push('');
            continue;
        }
        if (header) {
            if (NARRATOR_RE.test(t)) {
                info.kind = 'narration';
                header = false;
                continue;
            }
            let m = t.match(NAME_RE);
            if (m) {
                info.name = (m[1] || '').trim();
                info.kind = 'character';
                continue;
            }
            m = t.match(GENDER_RE);
            if (m) {
                info.gender = (m[1] || '').trim();
                continue;
            }
            m = t.match(AGE_RE);
            if (m) {
                info.age = (m[1] || '').trim();
                continue;
            }
            header = false;
        }
        body.push(line);
    }

    info.text = body.join('\n').trim();
    if (info.kind === 'block') {
        info.kind = SYSTEM_RE.test(block) && !quoteRegex().test(block) ? 'system' : 'narration';
    }
    return info;
}

/**
 * @param {string} raw 消息原文
 * @param {object} opt
 * @param {'nonQuote'|'all'|'off'} opt.narration 旁白朗读范围
 * @param {'quote'|'all'|'off'} opt.dialogue 角色朗读范围
 * @param {boolean} opt.readSystem 是否朗读系统/状态块
 * @param {'bracket'|'bracket+paren'} opt.toneSources 语气标签来源
 * @param {number} opt.maxChars 单段最大字数（0 = 不切）
 */
export function segmentMessage(raw, opt = {}) {
    const {
        narration = 'nonQuote',
        dialogue = 'quote',
        readSystem = false,
        toneSources = 'bracket',
        maxChars = 120,
    } = opt;

    const out = [];

    const emit = (kind, text, extra = {}) => {
        for (const piece of splitSentences(text, maxChars)) {
            out.push({
                kind,
                speaker: extra.speaker || '旁白',
                gender: extra.gender || '',
                age: extra.age || '',
                tone: extra.tone || '',
                text: piece,
            });
        }
    };

    for (const block of splitBlocks(raw)) {
        const info = parseBlock(block);
        if (!info.text) continue;

        // 1) 系统/状态块
        if (info.kind === 'system') {
            if (readSystem) emit('narration', info.text.replace(/\s*\n\s*/g, '；'), { tone: '平铺直叙' });
            continue;
        }

        // 2) 旁白块：整段交给旁白
        if (info.kind === 'narration') {
            if (narration !== 'off') emit('narration', info.text, { tone: '' });
            continue;
        }

        // 3) 角色块
        const who = { speaker: info.name || '未命名', gender: info.gender, age: info.age };

        if (dialogue === 'all') {
            const t = takeTrailingTone(info.text, toneSources);
            emit('dialogue', info.text, { ...who, tone: t.tone });
            continue;
        }

        const re = quoteRegex();
        const pieces = []; // { kind, text, tone }
        let last = 0;
        let m;
        let pendingTone = '';

        const addNarration = (text) => {
            const clean = String(text || '').trim();
            if (!clean || narration === 'off') return;
            const prev = pieces[pieces.length - 1];
            if (prev && prev.kind === 'narration') prev.text += clean;
            else pieces.push({ kind: 'narration', text: clean, tone: '' });
        };

        while ((m = re.exec(info.text)) !== null) {
            const before = info.text.slice(last, m.index);
            const quoted = (m[1] ?? m[2] ?? m[3] ?? '').trim();
            last = m.index + m[0].length;

            let beforeText = before;
            if (before.trim()) {
                const t = takeTrailingTone(before, toneSources);
                if (t.tone) pendingTone = t.tone;
                beforeText = t.text;
            }
            addNarration(beforeText);

            if (!quoted) continue;

            // “修仙者”三个字 —— 引号只是强调词，不是台词
            const after = info.text.slice(last, last + 6);
            const isMention = quoted.length <= 8 && MENTION_AFTER_RE.test(after);
            if (isMention) {
                addNarration(`“${quoted}”`);
                continue;
            }

            if (dialogue === 'off') {
                addNarration(`“${quoted}”`);
                continue;
            }

            pieces.push({ kind: 'dialogue', text: quoted, tone: pendingTone });
            pendingTone = '';
        }

        const tail = info.text.slice(last);
        if (tail.trim()) {
            const t = takeTrailingTone(tail, toneSources);
            addNarration(t.text);
        }

        for (const p of pieces) {
            if (p.kind === 'narration') emit('narration', p.text, { tone: '' });
            else emit('dialogue', p.text, { ...who, tone: p.tone });
        }
    }

    return out;
}
