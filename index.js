/**
 * MiMo 多角色朗读 —— SillyTavern 扩展
 *
 * 一条消息 → 按 *** / 角色名字 / 性别 / 年龄 / [语气] / “台词” 切段
 *          → 每段指定音色（固定角色表 / 分性别 NPC 池 / 旁白）
 *          → 调 MiMo TTS 逐段合成，边播边合成、可打断。
 */

import { extension_settings, getContext } from '../../../extensions.js';
import { eventSource, event_types, saveSettingsDebounced } from '../../../../script.js';

import { MODULE_ID, normalizeSettings, HOST_URLS } from './scripts/settings.js';
import { segmentMessage } from './scripts/segmenter.js';
import { resolveSegment, CN_VOICES } from './scripts/voices.js';
import { synthesize } from './scripts/mimo.js';
import { SpeechPlayer } from './scripts/player.js';

const VERSION = '0.1.3';

const settings = () => {
    const raw = extension_settings[MODULE_ID];
    const s = normalizeSettings(raw);
    extension_settings[MODULE_ID] = s;
    return s;
};

function save() {
    saveSettingsDebounced();
}

/* ------------------------------------------------------------------ 播放 */

let player = null;
let statusEl = null;
let barEl = null;

function setStatus(state) {
    if (!statusEl) return;
    if (!state || state.phase !== 'playing') {
        statusEl.textContent = '';
        if (barEl) barEl.style.display = 'none';
        return;
    }
    const it = state.items?.[state.index];
    const done = state.items?.filter((x) => x.status === 'done').length ?? 0;
    statusEl.textContent = `朗读中 ${state.index + 1}/${state.total} ｜ ${it?.speaker || ''} ｜ 已完成 ${done}`;
    if (barEl) {
        barEl.style.display = 'flex';
        const t = barEl.querySelector('.mmv-bar-text');
        if (t) t.textContent = `${it?.speaker || ''}：${(it?.text || '').slice(0, 24)}…`;
    }
}

function getPlayer() {
    if (!player) player = new SpeechPlayer({ onStatus: setStatus });
    return player;
}

function stopSpeech() {
    getPlayer().stop();
}

/** 朗读一段文本 */
async function speakText(text) {
    const s = settings();
    if (!s.apiKey) {
        toastr?.warning?.('先在「MiMo 多角色朗读」里填 API Key');
        return;
    }
    const segments = segmentMessage(String(text || ''), {
        narration: s.narration,
        dialogue: s.dialogue,
        readSystem: s.readSystem,
        toneSources: s.toneSources,
        maxChars: s.maxChars,
    });
    if (!segments.length) {
        console.warn('[MiMo 朗读] 没有可朗读的片段');
        return;
    }

    const assignments = { ...s.npcAssignments };
    const items = segments.map((seg) => {
        const plan = resolveSegment(seg, s, assignments);
        if (seg.kind === 'dialogue' && !s.fixedVoices?.[seg.speaker] && !assignments[seg.speaker]) {
            assignments[seg.speaker] = plan.voice;
        }
        return {
            text: seg.text,
            voice: plan.voice,
            model: plan.model,
            style: plan.style,
            speaker: seg.speaker,
            kind: seg.kind,
        };
    });

    if (JSON.stringify(assignments) !== JSON.stringify(s.npcAssignments)) {
        s.npcAssignments = assignments;
        save();
    }

    console.log(
        '[MiMo 朗读] 片段：',
        items.map((i) => `${i.speaker}/${i.voice}: ${i.text.slice(0, 16)}…`),
    );

    await getPlayer().play(
        items,
        (item, signal) =>
            synthesize({
                text: item.text,
                style: item.style,
                voice: item.voice,
                model: item.model,
                apiKey: s.apiKey,
                host: HOST_URLS[s.hostKey] || HOST_URLS.official,
                signal,
            }),
        { concurrency: s.concurrency },
    );
}

/* ------------------------------------------------------------------ 设置界面 */

const voiceOptions = (selected) =>
    CN_VOICES.map(
        (v) =>
            `<option value="${v.id}" ${v.id === selected ? 'selected' : ''}>${v.id}（${v.note}）</option>`,
    ).join('');

function buildUI() {
    const s = settings();
    const html = `
<div id="mmv-panel" class="mmv-panel inline-drawer">
  <div class="inline-drawer-toggle inline-drawer-header">
    <b>MiMo 多角色朗读</b> <span class="mmv-ver">v${VERSION}</span>
    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
  </div>
  <div class="inline-drawer-content">
    <div class="mmv-hint">① 填 API Key ② 点「试听旁白」③ 打开自动朗读，或随时点「朗读最后一条」</div>
    <label class="checkbox_label"><input type="checkbox" id="mmv-auto" ${s.autoPlay ? 'checked' : ''}> 新消息自动朗读</label>

    <div class="mmv-row">
      <span>API Key</span>
      <input id="mmv-key" type="password" class="text_pole" placeholder="sk-…" value="${s.apiKey || ''}">
    </div>
    <div class="mmv-row">
      <span>通道</span>
      <select id="mmv-host" class="text_pole">
        <option value="official" ${s.hostKey === 'official' ? 'selected' : ''}>官方 api.xiaomimimo.com</option>
        <option value="free" ${s.hostKey === 'free' ? 'selected' : ''}>免费 token-plan-sgp</option>
      </select>
    </div>

    <hr>
    <div class="mmv-row">
      <span>旁白音色</span>
      <select id="mmv-narrator" class="text_pole">${voiceOptions(s.narratorVoice)}</select>
    </div>
    <div class="mmv-row">
      <span>旁白风格</span>
      <input id="mmv-narrator-style" class="text_pole" value="${s.narratorStyle}">
    </div>
    <div class="mmv-row">
      <span>旁白读什么</span>
      <select id="mmv-narration" class="text_pole">
        <option value="nonQuote" ${s.narration === 'nonQuote' ? 'selected' : ''}>只读非引号（叙述/动作）</option>
        <option value="all" ${s.narration === 'all' ? 'selected' : ''}>全部（含台词，会重复）</option>
        <option value="off" ${s.narration === 'off' ? 'selected' : ''}>不读旁白</option>
      </select>
    </div>
    <div class="mmv-row">
      <span>角色读什么</span>
      <select id="mmv-dialogue" class="text_pole">
        <option value="quote" ${s.dialogue === 'quote' ? 'selected' : ''}>只读引号内台词</option>
        <option value="all" ${s.dialogue === 'all' ? 'selected' : ''}>整段都读</option>
        <option value="off" ${s.dialogue === 'off' ? 'selected' : ''}>不读角色台词</option>
      </select>
    </div>
    <label class="checkbox_label"><input type="checkbox" id="mmv-system" ${s.readSystem ? 'checked' : ''}> 也朗读系统/状态块（积分、行囊）</label>
    <div class="mmv-row">
      <span>语气标签</span>
      <select id="mmv-tone" class="text_pole">
        <option value="bracket" ${s.toneSources === 'bracket' ? 'selected' : ''}>[方括号]</option>
        <option value="bracket+paren" ${s.toneSources === 'bracket+paren' ? 'selected' : ''}>[方括号] + （圆括号）</option>
      </select>
    </div>
    <div class="mmv-row">
      <span>单段最长字数</span>
      <input id="mmv-maxchars" type="number" min="0" max="500" step="10" class="text_pole" value="${s.maxChars}">
    </div>
    <div class="mmv-row">
      <span>合成并发</span>
      <input id="mmv-conc" type="number" min="1" max="4" class="text_pole" value="${s.concurrency}">
    </div>

    <hr>
    <div class="mmv-hint">固定角色（JSON，voice 可填预置音色名；以后支持克隆用 data: 开头）</div>
    <textarea id="mmv-fixed" class="text_pole mmv-json" rows="6">${JSON.stringify(s.fixedVoices, null, 2)}</textarea>
    <div class="mmv-row">
      <span>NPC 男声池</span>
      <input id="mmv-male" class="text_pole" value="${s.pools.male.join(',')}">
    </div>
    <div class="mmv-row">
      <span>NPC 女声池</span>
      <input id="mmv-female" class="text_pole" value="${s.pools.female.join(',')}">
    </div>
    <div class="mmv-hint">NPC 按“名字哈希 → 池里取一个”，同名永远同一音色，并记进设置。</div>

    <div class="mmv-buttons">
      <button id="mmv-test" class="menu_button">试听旁白</button>
      <button id="mmv-last" class="menu_button">朗读最后一条</button>
      <button id="mmv-stop" class="menu_button">停止</button>
    </div>
    <div id="mmv-status" class="mmv-status"></div>
  </div>
</div>`;

    const $target = $('#extensions_settings2').length
        ? $('#extensions_settings2')
        : $('#extensions_settings').length
          ? $('#extensions_settings')
          : $('#rm_extensions_block');
    if ($target.length) {
        $target.append(html);
    } else {
        // 兜底：挂到页面右下角，至少能用
        document.body.insertAdjacentHTML(
            'beforeend',
            `<div style="position:fixed;right:12px;bottom:64px;z-index:5000;max-width:360px">${html}</div>`,
        );
    }

    // ST 的 inline-drawer 默认收起；这里默认展开，省得用户找不到
    const $panel = $('#mmv-panel');
    $panel.find('> .inline-drawer-content').show();
    $panel
        .find('> .inline-drawer-header .inline-drawer-icon')
        .removeClass('down fa-circle-chevron-down')
        .addClass('up fa-circle-chevron-up');

    statusEl = document.getElementById('mmv-status');

    // 浮动状态条
    const bar = document.createElement('div');
    bar.id = 'mmv-bar';
    bar.innerHTML = `<span class="mmv-dot"></span><span class="mmv-bar-text"></span><button class="mmv-bar-stop menu_button">停止</button>`;
    document.body.appendChild(bar);
    barEl = bar;
    bar.querySelector('.mmv-bar-stop').addEventListener('click', stopSpeech);

    // 绑定
    const bind = (id, ev, fn) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener(ev, fn);
    };
    const saveSome = (patch) => {
        Object.assign(settings(), patch);
        save();
    };

    bind('mmv-auto', 'change', (e) => saveSome({ autoPlay: e.target.checked }));
    bind('mmv-key', 'input', (e) => saveSome({ apiKey: e.target.value.trim() }));
    bind('mmv-host', 'change', (e) => saveSome({ hostKey: e.target.value }));
    bind('mmv-narrator', 'change', (e) => saveSome({ narratorVoice: e.target.value }));
    bind('mmv-narrator-style', 'input', (e) => saveSome({ narratorStyle: e.target.value }));
    bind('mmv-narration', 'change', (e) => saveSome({ narration: e.target.value }));
    bind('mmv-dialogue', 'change', (e) => saveSome({ dialogue: e.target.value }));
    bind('mmv-system', 'change', (e) => saveSome({ readSystem: e.target.checked }));
    bind('mmv-tone', 'change', (e) => saveSome({ toneSources: e.target.value }));
    bind('mmv-maxchars', 'input', (e) => saveSome({ maxChars: Number(e.target.value) }));
    bind('mmv-conc', 'input', (e) => saveSome({ concurrency: Number(e.target.value) }));
    bind('mmv-male', 'input', (e) =>
        saveSome({ pools: { ...settings().pools, male: e.target.value.split(/[,，]/) } }),
    );
    bind('mmv-female', 'input', (e) =>
        saveSome({ pools: { ...settings().pools, female: e.target.value.split(/[,，]/) } }),
    );
    bind('mmv-fixed', 'input', (e) => {
        try {
            const parsed = JSON.parse(e.target.value);
            saveSome({ fixedVoices: parsed });
            e.target.classList.remove('mmv-invalid');
        } catch {
            e.target.classList.add('mmv-invalid');
        }
    });

    bind('mmv-test', 'click', () => speakText('这是一段旁白试听，用来确认音色和通道是否正常。'));
    bind('mmv-last', 'click', () => speakLast());
    bind('mmv-stop', 'click', stopSpeech);

    // 第一次点击时解锁音频播放（浏览器自动播放策略）
    const unlock = () => {
        try {
            const a = new Audio();
            a.volume = 0;
            a.play().catch(() => {});
        } catch {}
        document.removeEventListener('pointerdown', unlock);
        document.removeEventListener('keydown', unlock);
    };
    document.addEventListener('pointerdown', unlock, { once: true });
    document.addEventListener('keydown', unlock, { once: true });
}

function speakLast() {
    const ctx = getContext();
    const chat = ctx.chat || [];
    for (let i = chat.length - 1; i >= 0; i--) {
        const m = chat[i];
        if (m && !m.is_user && m.mes) {
            speakText(m.mes);
            return;
        }
    }
    toastr?.info?.('没有找到可朗读的 AI 消息');
}

/* ------------------------------------------------------------------ 事件 */

function bindEvents() {
    const onMessage = (messageId) => {
        const s = settings();
        if (!s.autoPlay || !s.enabled) return;
        const ctx = getContext();
        const msg = typeof messageId === 'number' ? ctx.chat?.[messageId] : null;
        if (!msg || msg.is_user) return;
        speakText(msg.mes);
    };

    const safeOn = (name, fn) => {
        const evt = event_types?.[name];
        if (evt && eventSource) {
            try {
                eventSource.on(evt, fn);
            } catch (e) {
                console.warn('[MiMo 朗读] 绑定事件失败', name, e);
            }
        }
    };

    safeOn('MESSAGE_RECEIVED', onMessage);
    safeOn('GENERATION_STARTED', () => stopSpeech());
    safeOn('MESSAGE_SWIPED', () => stopSpeech());
    safeOn('MESSAGE_EDITED', () => stopSpeech());
    safeOn('CHAT_CHANGED', () => stopSpeech());
}

/* ------------------------------------------------------------------ 启动 */

jQuery(async () => {
    try {
        settings(); // 初始化默认值
        buildUI();
        bindEvents();
        console.log(`[MiMo 多角色朗读] 已加载 v${VERSION}`);
    } catch (e) {
        console.error('[MiMo 多角色朗读] 初始化失败', e);
    }
});
