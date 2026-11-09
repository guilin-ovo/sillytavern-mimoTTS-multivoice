/** 默认设置与归一化（纯函数）。 */

export const MODULE_ID = 'mimo_multivoice';

export const DEFAULTS = {
    enabled: true,
    apiKey: '',
    hostKey: 'official', // official | free
    narratorVoice: '白桦',
    narratorStyle: '低沉稳重的旁白，语速适中，吐字清晰',
    defaultDialogueStyle: '',
    // 旁白朗读范围：nonQuote 仅叙述 | all 全部（含台词） | off 不读
    narration: 'nonQuote',
    // 角色朗读范围：quote 仅引号 | all 整段 | off 不读
    dialogue: 'quote',
    readSystem: false,
    toneSources: 'bracket',
    maxChars: 120,
    concurrency: 2,
    autoPlay: true,
    fixedVoices: {
        青禾: { voice: '冰糖', style: '少女音，清脆' },
        柳玉娘: { voice: '茉莉', style: '成熟女性的温软嗓音' },
        顾野: { voice: '苏打', style: '年轻男声，冷静' },
    },
    pools: {
        male: ['苏打', '白桦'],
        female: ['冰糖', '茉莉'],
    },
    npcAssignments: {},
};

function asArray(v, fallback) {
    if (Array.isArray(v)) return v.filter(Boolean);
    if (typeof v === 'string') {
        return v
            .split(/[,，;；\n]/)
            .map((x) => x.trim())
            .filter(Boolean);
    }
    return fallback.slice();
}

/** 把存下来的设置补齐成完整结构，容错错误类型 */
export function normalizeSettings(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const out = { ...DEFAULTS, ...src };

    out.pools = {
        male: asArray(src.pools?.male, DEFAULTS.pools.male),
        female: asArray(src.pools?.female, DEFAULTS.pools.female),
    };

    if (typeof src.fixedVoices === 'string') {
        try {
            out.fixedVoices = JSON.parse(src.fixedVoices);
        } catch {
            out.fixedVoices = {};
        }
    }
    if (!out.fixedVoices || typeof out.fixedVoices !== 'object') out.fixedVoices = {};

    out.npcAssignments =
        src.npcAssignments && typeof src.npcAssignments === 'object' ? src.npcAssignments : {};

    out.maxChars = Math.max(0, Math.min(500, Number(out.maxChars) || 0));
    out.concurrency = Math.max(1, Math.min(4, Number(out.concurrency) || 1));
    if (!['nonQuote', 'all', 'off'].includes(out.narration)) out.narration = 'nonQuote';
    if (!['quote', 'all', 'off'].includes(out.dialogue)) out.dialogue = 'quote';
    if (!['bracket', 'bracket+paren'].includes(out.toneSources)) out.toneSources = 'bracket';
    if (!['official', 'free'].includes(out.hostKey)) out.hostKey = 'official';
    if (!out.narratorVoice) out.narratorVoice = '白桦';
    return out;
}

export const HOST_URLS = {
    official: 'https://api.xiaomimimo.com',
    free: 'https://token-plan-sgp.xiaomimimo.com',
};
