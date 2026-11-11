-- CreateIndex
CREATE UNIQUE INDEX "Favorite_userId_type_courseId_key" ON "Favorite"("userId", "type", "courseId");

