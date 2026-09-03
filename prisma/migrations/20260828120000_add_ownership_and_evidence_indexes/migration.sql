-- CreateIndex
CREATE INDEX "TradeCase_userId_idx" ON "TradeCase"("userId");

-- CreateIndex
CREATE INDEX "Document_tradeCaseId_idx" ON "Document"("tradeCaseId");

-- CreateIndex
CREATE INDEX "Requirement_tradeCaseId_idx" ON "Requirement"("tradeCaseId");

-- CreateIndex
CREATE INDEX "RequirementEvaluation_tradeCaseId_idx" ON "RequirementEvaluation"("tradeCaseId");

-- CreateIndex
CREATE INDEX "EvaluationEvidence_evaluationId_idx" ON "EvaluationEvidence"("evaluationId");
