/** 播放队列：边合成边播、可打断、失败跳过。 */

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

export class SpeechPlayer {
    /**
     * @param {object} opt
     * @param {(state:object)=>void} [opt.onStatus]
     */
    constructor({ onStatus } = {}) {
        this.onStatus = onStatus;
        this._abort = null;
        this._audio = null;
        this._seq = 0;
    }

    get playing() {
        return !!this._audio;
    }

    stop() {
        this._seq++;
        try {
            this._abort?.abort();
        } catch {}
        this._abort = null;
        if (this._audio) {
            try {
                this._audio.pause();
                this._audio.src = '';
            } catch {}
            this._audio = null;
        }
        this.onStatus?.({ phase: 'idle' });
    }

    /**
     * @param {Array<{text:string, voice?:string, model?:string, style?:string, speaker?:string}>} items
     * @param {(item:object, signal:AbortSignal)=>Promise<{bytes:Uint8Array, mime:string}>} synth
     * @param {object} opt { concurrency:number }
     */
    async play(items, synth, { concurrency = 2 } = {}) {
        this.stop();
        const seq = ++this._seq;
        const ctrl = new AbortController();
        this._abort = ctrl;

        const total = items.length;
        if (!total) {
            this.onStatus?.({ phase: 'idle' });
            return { ok: 0, failed: 0 };
        }

        const state = items.map(() => ({ status: 'pending', url: '', promise: null, error: '' }));
        const urlOf = (bytes, mime) => URL.createObjectURL(new Blob([bytes], { type: mime }));
        const alive = () => seq === this._seq && !ctrl.signal.aborted;

        const report = (idx) =>
            this.onStatus?.({
                phase: 'playing',
                index: idx,
                total,
                items: items.map((it, i) => ({ speaker: it.speaker || '', text: it.text, ...state[i] })),
            });

        const startSynth = (i) => {
            if (i >= total || state[i].promise) return;
            state[i].status = 'synth';
            report(i);
            state[i].promise = (async () => {
                for (let attempt = 0; attempt < 2; attempt++) {
                    if (!alive()) return;
                    try {
                        const r = await synth(items[i], ctrl.signal);
                        if (!alive()) return;
                        state[i].url = urlOf(r.bytes, r.mime);
                        state[i].status = 'ready';
                        report(i);
                        return;
                    } catch (e) {
                        if (!alive()) return;
                        state[i].error = String(e?.message || e);
                        if (attempt === 0) await sleep(400);
                    }
                }
                state[i].status = 'error';
                report(i);
            })();
        };

        const playUrl = (url) =>
            new Promise((resolve) => {
                const audio = new Audio(url);
                this._audio = audio;
                const done = () => {
                    audio.onended = null;
                    audio.onerror = null;
                    if (this._audio === audio) this._audio = null;
                    resolve();
                };
                audio.onended = done;
                audio.onerror = done;
                audio.play().catch(() => done());
            });

        let ok = 0;
        let failed = 0;
        for (let i = 0; i < Math.min(concurrency, total); i++) startSynth(i);

        for (let i = 0; i < total; i++) {
            if (!alive()) break;
            startSynth(i + concurrency);
            await state[i].promise;
            if (!alive()) break;
            if (state[i].status === 'ready') {
                report(i);
                await playUrl(state[i].url);
                ok++;
                if (state[i].url) URL.revokeObjectURL(state[i].url);
                state[i].status = 'done';
                state[i].url = '';
            } else {
                failed++;
            }
            if (!alive()) break;
        }

        if (alive()) {
            this._abort = null;
            this.onStatus?.({ phase: 'idle' });
        }
        return { ok, failed };
    }
}
