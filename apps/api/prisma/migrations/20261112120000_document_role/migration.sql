-- 学习笔记 PDF 支持：DocumentAsset 增加 role（source=对照文本等原始文档 / notes=学习笔记），
-- ImportFile 增加 docRole 记录导入阶段的判定。已有数据一律默认 source，不改变现有行为。

-- AlterTable
ALTER TABLE "DocumentAsset" ADD COLUMN     "role" TEXT NOT NULL DEFAULT 'source';

-- AlterTable
ALTER TABLE "ImportFile" ADD COLUMN     "docRole" TEXT NOT NULL DEFAULT 'source';
