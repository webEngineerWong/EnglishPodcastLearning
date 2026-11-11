# 数据库（DATABASE）

PostgreSQL + Prisma 6。本地：Docker（`pnpm db:up`），端口 5433，库名 `elp`。

## 模型（16）

| 模型 | 用途 |
|---|---|
| User | 用户（第一版单用户自动创建；结构支持多用户） |
| Category | 课程分类 |
| Course | 课程（title/difficulty/tags/notes/status，sourceJobId 关联导入任务） |
| AudioAsset | 音频（storageKey 指向存储，多个/课程） |
| DocumentAsset | 文档（原始 PDF/TXT/SRT 保留；importFileId 关联导入文件） |
| Transcript | 字幕/文本（status: DRAFT/REVIEWED/PUBLISHED） |
| TranscriptParagraph | 段落（type/textEn/textZh/**startTimeMs?/endTimeMs?**/pageStart/pageEnd/confidence/reviewStatus） |
| TranscriptSentence | 句子（预留逐句时间轴） |
| LearningProgress | 播放位置（userId+courseId+audioAssetId 维度，completedAt 完成标记） |
| LearningSession | 学习会话（durationMs 累计，30 分钟内心跳合并） |
| Vocabulary | 全局词表（word 唯一） |
| UserVocabulary | 用户生词（status: NEW/LEARNING/MASTERED，来源段落/课程） |
| Favorite | 收藏（COURSE/PARAGRAPH） |
| ImportJob / ImportFile | 导入任务与文件（parsedJson 草稿快照，sha256 重复检测） |
| StorageObject | 存储对象索引（key/driver/mime/sha256） |

## 关键约束

- `TranscriptParagraph.startTimeMs/endTimeMs` 可空：**没有准确时间就保持 null，严禁伪造**。
- `Course`↔`AudioAsset` 一对多：支持一个课程多个音频。
- `DocumentAsset.importFileId` 唯一：发布幂等（已发布的导入文件被跳过）。
- 迁移：`apps/api/prisma/migrations/`（init → favorite_unique → para_importfile_nonunique）。

## 常用操作

```bash
pnpm db:migrate     # 开发迁移（交互）
pnpm db:seed        # 种子（演示课程 + 合成 WAV）
pnpm --filter @elp/api prisma studio
```
