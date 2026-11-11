-- AlterTable
ALTER TABLE "Transcript" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'subtitle',
ADD COLUMN     "title" TEXT;

