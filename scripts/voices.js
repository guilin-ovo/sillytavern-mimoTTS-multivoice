/** 音色分配（纯函数）：固定角色表 + 分性别 NPC 池 + 稳定哈希。 */

export const CN_VOICES = [
    { id: '冰糖', gender: '女', note: '女声·清亮少女' },
    { id: '茉莉', gender: '女', note: '女声·成熟温柔' },
    { id: '苏打', gender: '男', note: '男声·中低清朗' },
    { id: '白桦', gender: '男', note: '男声·低沉' },
];

export const DEFAULT_POOLS = {
    male: ['苏打', '白桦'],
    female: ['冰糖', '茉莉'],
};

export function normalizeGender(g) {
    const s = String(g || '');
    if (/男|爷|汉|兄|郎|公子/.test(s)) return '男';
    if (/女|娘|姑|妇|妹|姐|少女|千金/.test(s)) return '女';
    return '';
}

/** FNV-1a，稳定且不依赖顺序 */
export function hashName(name) {
    let h = 2166136261;
    for (const ch of String(name || '')) {
        h ^= ch.codePointAt(0);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

/**
 * NPC 音色：优先沿用已分配，否则按名字哈希从分性别池里抽。
 * 同名 NPC 永远同一音色（跨消息稳定）。
 */
export function pickNpcVoice(name, gender, settings = {}, assignments = {}) {
    const pools = settings.pools || DEFAULT_POOLS;
    const g = normalizeGender(gender);
    const pool =
        g === '男' ? pools.male || [] : g === '女' ? pools.female || [] : [...(pools.male || []), ...(pools.female || [])];
    if (!pool.length) return settings.narratorVoice || '白桦';
    const known = assignments[name];
    if (known && pool.includes(known)) return known;
    return pool[hashName(name) % pool.length];
}

export function buildStyle({ gender, age, tone, extra } = {}) {
    const bits = [];
    const g = normalizeGender(gender);
    if (g === '男') bits.push('男声');
    if (g === '女') bits.push('女声');
    if (age) bits.push(String(age));
    if (extra) bits.push(String(extra));
    if (tone) bits.push(`语气：${tone}`);
    return bits.join('，');
}

/**
 * 给一个片段决定 { voice, model, style }。
 * settings.fixedVoices: { "青禾": {voice, style?, model?} }
 */
export function resolveSegment(seg, settings = {}, assignments = {}) {
    if (seg.kind === 'dialogue') {
        const fixedRaw = settings.fixedVoices?.[seg.speaker];
        const fixed = typeof fixedRaw === 'string' ? { voice: fixedRaw } : fixedRaw;
        if (fixed?.voice) {
            const style =
                buildStyle({ gender: seg.gender, age: seg.age, tone: seg.tone, extra: fixed.style }) ||
                settings.defaultDialogueStyle ||
                '';
            return { voice: fixed.voice, model: fixed.model || 'preset', style };
        }
        const voice = pickNpcVoice(seg.speaker, seg.gender, settings, assignments);
        const style = buildStyle({
            gender: seg.gender,
            age: seg.age,
            tone: seg.tone,
            extra: settings.defaultDialogueStyle,
        });
        return { voice, model: 'preset', style };
    }

    const style = [settings.narratorStyle, seg.tone ? `语气：${seg.tone}` : ''].filter(Boolean).join('，');
    return { voice: settings.narratorVoice || '白桦', model: 'preset', style };
}
