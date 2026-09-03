-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TradeCase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "progress" TEXT,
    "nextAction" TEXT,
    "nextActionHref" TEXT,
    "direction" TEXT NOT NULL DEFAULT 'Export',
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "shipmentDate" TEXT,
    "estimatedValue" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "TradeCase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "material" TEXT,
    "packaging" TEXT,
    "intendedUse" TEXT,
    "origin" TEXT,
    "quantity" TEXT,
    "weight" TEXT,
    "tradeCaseId" TEXT NOT NULL,
    CONSTRAINT "Product_tradeCaseId_fkey" FOREIGN KEY ("tradeCaseId") REFERENCES "TradeCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Missing',
    "description" TEXT,
    "fileRef" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "tradeCaseId" TEXT NOT NULL,
    CONSTRAINT "Document_tradeCaseId_fkey" FOREIGN KEY ("tradeCaseId") REFERENCES "TradeCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Requirement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Needs review',
    "source" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "tradeCaseId" TEXT NOT NULL,
    CONSTRAINT "Requirement_tradeCaseId_fkey" FOREIGN KEY ("tradeCaseId") REFERENCES "TradeCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Product_tradeCaseId_key" ON "Product"("tradeCaseId");
