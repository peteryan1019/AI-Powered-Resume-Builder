/*
  Warnings:

  - You are about to drop the column `password` on the `User` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[googleid]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `googleid` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "password",
ADD COLUMN     "googleid" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "User_googleid_key" ON "User"("googleid");
