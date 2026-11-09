# MiMo 多角色朗读（SillyTavern / TauriTavern 扩展）

把一条 AI 消息按角色切成多段，**每段用不同音色 + 不同语气**调用小米 MiMo TTS 合成，边合成边播放。
纯页面扩展：没有 Node 后端，桌面酒馆、TauriTavern（桌面/手机）都能用。

## 安装

### TauriTavern（桌面 / 安卓）

扩展抽屉 → **安装扩展** → 填本仓库地址：

```
https://github.com/guilin-ovo/sillytavern-mimoTTS-multivoice.git
```

（TauriTavern 只接受匿名 https Git，不含子模块 / LFS。）

也可以手动放置目录（无 `.git` 则不能自动更新）：

```
<数据目录>/data/extensions/third-party/sillytavern-mimoTTS-multivoice/
```

### SillyTavern

```
cd SillyTavern/public/scripts/extensions/third-party
git clone https://github.com/guilin-ovo/sillytavern-mimoTTS-multivoice.git
```

或把本仓库整个文件夹放进 `data/default-user/extensions/`，然后重启酒馆。

## 首次配置

1. 扩展面板里填 **API Key**（`sk-…`），通道默认「官方 api.xiaomimimo.com」；也可切「免费 token-plan-sgp」。
2. 点 **试听旁白** 验证 key 和通道。
3. 打开 **新消息自动朗读**（默认开），或随时点 **朗读最后一条**。

## 分段规则

消息按 `***` 分块，每块头部识别：

```
（旁白）                      → 整块交给旁白音色
角色名字：青禾，              → 角色
性别：女，
年龄：少女，
叙述……[语气标签]“台词……”   → 叙述给旁白，引号给角色，方括号当语气
```

- `“修仙者”三个字` 这类**强调词**自动识别为叙述，不当台词
- `系统积分 / 行囊` 这类状态块默认不读（可开）
- 超长句按标点切到「单段最长字数」以内

## 音色分配

| 类型 | 规则 |
|---|---|
| 旁白 | 设定里的旁白音色（默认白桦） |
| 固定角色 | 「固定角色」JSON 手填，例：`"青禾": {"voice":"冰糖","style":"少女音，清脆"}` |
| 其他角色（NPC） | 按 `性别` 进男/女池，用**名字哈希**取一个；同名永远同一音色，并记进设置 |

中文预置音色：冰糖 / 茉莉（女）、苏打 / 白桦（男）。

## 已知限制（v0.1）

- 只有预置音色；克隆 / 音色设计还没接到界面（`scripts/mimo.js` 已支持 `clone` / `design` 模型 ID）
- 没有消息内逐段播放条，只有右下角悬浮状态条
- 自动朗读需要先在页面上点过任意位置（浏览器自动播放策略）
- 一条消息 = N 次请求（N 一般 8–18），首段约 2–7 秒出声

## 目录

```
manifest.json     扩展清单
index.js          入口：设置面板 / 事件 / 播放调度
style.css         面板与悬浮条样式
scripts/
  segmenter.js    文本分段（纯函数）
  voices.js       音色分配（固定表 + NPC 池 + 哈希）
  mimo.js         MiMo API 客户端
  player.js       播放队列（预取 / 打断 / 失败跳过）
  settings.js     默认设置与归一化
```
