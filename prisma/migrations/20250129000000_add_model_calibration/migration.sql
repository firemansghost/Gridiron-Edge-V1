-- CreateTable
CREATE TABLE "model_calibration" (
    "id" TEXT NOT NULL,
    "model_version" TEXT NOT NULL,
    "fit_label" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "feature_version" TEXT NOT NULL,
    "best_alpha" DECIMAL,
    "best_l1_ratio" DECIMAL,
    "grid_search_results" JSONB,
    "coefficients" JSONB NOT NULL,
    "intercept" DECIMAL NOT NULL,
    "scaler_params" JSONB NOT NULL,
    "train_rmse" DECIMAL,
    "train_r2" DECIMAL,
    "train_pearson" DECIMAL,
    "train_spearman" DECIMAL,
    "walk_forward_rmse" DECIMAL,
    "walk_forward_r2" DECIMAL,
    "walk_forward_pearson" DECIMAL,
    "walk_forward_spearman" DECIMAL,
    "slope" DECIMAL,
    "sign_agreement" DECIMAL,
    "gates_passed" BOOLEAN NOT NULL DEFAULT false,
    "gate_details" JSONB,
    "residual_summary" JSONB,
    "top_outliers" JSONB,
    "training_row_ids" TEXT[],
    "set_labels" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "model_calibration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "model_calibration_model_version_fit_label_key" ON "model_calibration"("model_version", "fit_label");

-- CreateIndex
CREATE INDEX "model_calibration_model_version_idx" ON "model_calibration"("model_version");

-- CreateIndex
CREATE INDEX "model_calibration_gates_passed_idx" ON "model_calibration"("gates_passed");

-- CreateIndex
CREATE INDEX "model_calibration_season_idx" ON "model_calibration"("season");

