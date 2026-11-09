/** MiMo TTS 客户端（浏览器 / Node 通用，不依赖 DOM）。 */

export const HOSTS = {
    official: 'https://api.xiaomimimo.com',
    free: 'https://token-plan-sgp.xiaomimimo.com',
};

const MODEL_IDS = {
    preset: 'mimo-v2.5-tts',
    design: 'mimo-v2.5-tts-voicedesign',
    clone: 'mimo-v2.5-tts-voiceclone',
};

export function buildRequest({ text, style = '', voice = '', model = 'preset' }) {
    const kind = MODEL_IDS[model] ? model : 'preset';
    const messages = [];
    if (style) messages.push({ role: 'user', content: style });
    messages.push({ role: 'assistant', content: text });

    const audio = { format: 'wav' };
    if (kind !== 'design' && voice) audio.voice = voice;

    return { model: MODEL_IDS[kind], messages, audio };
}

function base64ToBytes(b64) {
    if (typeof atob === 'function') {
        const bin = atob(b64);
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    }
    return new Uint8Array(Buffer.from(b64, 'base64'));
}

/**
 * 合成一段语音。
 * @returns {Promise<{bytes: Uint8Array, mime: string, ms: number}>}
 */
export async function synthesize({ text, style, voice, model, apiKey, host, signal }) {
    if (!apiKey) throw new Error('未填写 MiMo API Key');
    if (!text || !text.trim()) throw new Error('文本为空');

    const base = String(host || HOSTS.official).replace(/\/+$/, '');
    const url = /\/v1$/i.test(base) ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
    const body = buildRequest({ text, style, voice, model });

    const t0 = Date.now();
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
        body: JSON.stringify(body),
        signal,
    });
    if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`MiMo HTTP ${res.status}: ${detail.slice(0, 300)}`);
    }
    const data = await res.json();
    const b64 = data?.choices?.[0]?.message?.audio?.data;
    if (!b64) throw new Error('响应里没有 audio.data');
    return { bytes: base64ToBytes(b64), mime: 'audio/wav', ms: Date.now() - t0 };
}
