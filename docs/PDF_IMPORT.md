# PDF 导入（PDF_IMPORT）

## 支持文件

| 类型 | 处理 |
|---|---|
| PDF（中英对照） | PyMuPDF 文本提取 → 噪音过滤 → 段落聚合 → 中英配对（置信度评分） |
| TXT | 行聚合，中英分列 |
| SRT | 解析 → 判定滚动/普通字幕 → 滚动字幕行级去重 → 句子段 |
| MP3 / M4A / WAV / MP4 | 与文本文件按文件名匹配（`normalizeName`：去空格/括号/「对照|字幕|音频」等词） |

同一任务内 `Episode 23（中英文对照）.pdf` + `Episode 23.mp3` + `Episode 23 （英文字幕）.srt` 自动互相匹配。

## 解析器算法（services/pdf-parser/pdf_parser.py）

1. 逐页提取文本块（阅读顺序、bbox、字号）。
2. 页眉/页脚：跨页重复（阈值 50%）+ 典型噪音正则（公众号、页码、URL…），短行全页过滤。
3. 段落聚合：同语言相邻合并；短行+大字号 → HEADING；英文句末标点断段。
4. 中英配对：EN 组 + 紧随 ZH 组；长度比（中文字符≈英文词×1.2–2.5）评分；异常降置信度并记 warnings。
5. 未配对段落保留单语（不丢弃）；扫描页标记 `needsOcr`（不自动 OCR）。

## 时间戳对齐（@elp/learning-core `assignTimestampsFromSrt`）

**词汇锚点法**：整理文本与转写文本词形差异大，但罕见词（VP、Fortune、Caroline…）都会出现。

1. 统计 SRT 行级 cue 全文词频 df；
2. 每个段落取 df 最低、词长最长的 3 个区分词；
3. 顺序扫描 cue（指针单调前进），命中 ≥2 个区分词 → 锚点；
4. 段落区间 = 本锚点起点 → 下一锚点前一条 cue 终点；
5. 无锚点段落保持 null。

实测（Episode 23）：**21/35（60%）自动对齐**，区间单调；其余 40% 留给人工校对。后续可接 Whisper 提升覆盖率。

## 校对界面（/import/[jobId]）

- 文件列表（状态/段落数/错误/重试）
- 段落编辑：改中英文、拆分（句界）、合并（连续段）、上移/下移、删除
- 低置信度段醒目标记（左侧琥珀条 + 置信度百分比 + warnings）
- 发布：每个文本文件生成一个正式课程；原始 PDF/MP3 存为 DocumentAsset（可追溯、可重新编辑）

## 批量导入 248 篇

1. 导入中心一次多选（单任务 ≤100 文件）。
2. 建议每批 10–20 篇（PDF+MP3+SRT 同名一组）。
3. 任务列表轮询状态（PENDING→RUNNING→REVIEWING→COMPLETED / PARTIALLY_FAILED / FAILED）。
4. 失败文件可单独重试；sha256 自动去重（DUPLICATE 状态）。
