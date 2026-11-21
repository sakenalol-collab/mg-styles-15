# 《斗破苍穹·续：无尽火域》第一卷"火种" · 3D 动画短片

> 同人创作，非官方。人物与世界观归原作者天蚕土豆所有。角色造型、场景、配乐均为原创，没有使用官方动画、漫画的任何素材或造型。

按同人续写剧本第一卷（四章）做的一支 **68 秒、1920×1080、24 fps** 的三渲二（toon 着色 + 描边）3D 动画。和仓库里其他片子一样，画面和声音全部由代码生成：画面用 Three.js 在无头浏览器里逐帧渲染，配乐和音效用仓库自带的 `lib/audio`（mgaudio）合成。

## 分镜

| 时间 | 章 | 镜头 | 台词/字幕（取自剧本） |
|---|---|---|---|
| 0–6.5 s | 第一章 二十年 | 夜，中州小山顶，萧炎背影，天上一道细缝 | 成为斗帝的第二十年…… |
| 6.5–9.5 s | | 被啃空的魔兽化成紫灰，紫研蹲在一旁 | "萧炎，这东西……不是咱们大陆的。" |
| 9.5–12.5 s | | 仰望那道缝，紫气渗出 | "源气能从那边流过来，别的东西自然也能。" |
| 12.5–21.5 s | 第二章 辞行 | 乌坦城魔石碑：男孩测出"斗之力三段"；萧炎按上石碑，石碑毫无反应；树下男孩手里多了一枚丹药 | "斗之力，三段！" / "不是没有。是这块石碑，测不出斗帝。" / "石头上的字，只是开始。" |
| 21.5–25 s | | 花宗花海小亭，萧炎向云韵抱拳 | "斗气大陆，我替你看着。" |
| 25–28.5 s | | 星陨阁崖边，萧炎向药老叩首 | "到了那边，别丢老夫的脸。" |
| 28.5–36.5 s | 第三章 大千 | 帝炎在掌心燃起，化作火龙撞进天缝，撕开千丈之门，一家人升空 | "门是我打开的。" / "走了。" |
| 36.5–41.5 s | | 位面通道，火罩中的一家与一个"行走的山岳"擦肩而过 | "刚才那个，是让人想打一架的那种。" |
| 41.5–45 s | | 北境冰原，地平线上一道紫色伤口 | "这是大千世界的最北边。" |
| 45–49.5 s | 第四章 无尽火域 | 伤口撕裂，邪族潮水涌来 | "薰儿，彩鳞。护住孩子，守住门。" |
| 49.5–57.5 s | | 帝炎化作火海向四面铺开；八色异火凝成佛怒火莲，射进裂缝炸开 | "佛怒——火莲。" |
| 57.5–68 s | | 夜空下烧不尽的火海，片名 | "就叫它，无尽火域。" / 二十多年前，他有一个三年之约…… |

## 文件

- `index.html`：页面骨架、字幕/章节卡/片名的 DOM 叠层
- `js/timeline.js`：镜头表、字幕、章节卡、转场（改时间点只需改这里，再同步改 `audio.py` 的音效时间）
- `js/scenes.js`：9 个场景（山顶、紫灰、魔石碑、花海、崖边、开门、通道、冰原、火域）
- `js/lib.js`：toon 材质与描边、风格化人物与姿势、程序化天空、天缝/门、火焰、粒子、地形
- `js/main.js`：渲染器、后期（泛光、调色、颗粒、遮幅）、`window.renderAt(t)`
- `audio.py`：配乐（古筝、箫、笛、弦乐、合唱、太鼓、锣）与音效

## 渲染

在仓库根目录：

```bash
npm install
npm install --no-save @fontsource/noto-serif-sc@5.2.8 @fontsource/ma-shan-zheng@5.2.8   # 字幕/书法字体（OFL）
pip install numpy scipy soundfile numba pedalboard pyloudnorm
python3 anime/doupo-vol1/audio.py                       # → anime/doupo-vol1/out/audio.wav
node harness/render.mjs anime/doupo-vol1                # → anime/doupo-vol1/out/video.mp4（自动合入音轨）
node harness/render.mjs anime/doupo-vol1 --stills 14,35,60   # 只出几张静帧
```

没有 GPU 的 Linux 上，用 Chromium 的 SwiftShader 软件渲染（约 1–3 秒/帧，默认开 3 个 worker）：

```bash
export MG_CHROME=/path/to/chrome MG_GPU_ARGS="--no-sandbox --use-angle=swiftshader --enable-unsafe-swiftshader"
```

## 云韵 · 原创角色模型（设计稿 v1）

按原著描写重新设计的云韵（青色系，原创造型，没有参照任何官方改编的角色设计）：`js/yunyun.js`。设计稿页面 `model.html` 有四种模式：

```bash
node harness/render.mjs anime/doupo-vol1 --page model.html --query mode=sheet --stills 0          # 三视图 + 配色
node harness/render.mjs anime/doupo-vol1 --page model.html --query mode=face --stills 0,0.62      # 面部特写
node harness/render.mjs anime/doupo-vol1 --page model.html --query mode=turn --noaudio --out anime/doupo-vol1/out/yunyun_turntable.mp4   # 8 秒转台
node harness/render.mjs anime/doupo-vol1 --page model.html --query mode=scene --noaudio --out anime/doupo-vol1/out/yunyun_flowers.mp4    # 花海镜头
```

短片里的人物目前仍是旧的简化造型；新模型确认后再推广到其他角色并重渲。

## 已知局限

- 没有配音，台词用字幕呈现。
- 人物是低多边形的风格化造型（无表情动画），镜头多用背影、侧影和远景来弥补。
- 剧本里火灵族巡察使、烛坤、小医仙送药、紫研送行等情节没有进这一版短片。
