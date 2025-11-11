# 🗓️ NOVEMBER 15, 2025 - DATA INGESTION REMINDER

## 🎯 **What to Do**

Your Odds API quota resets today! You'll have **20,000 fresh requests**.

---

## ✅ **Quick Checklist**

### **1. Verify API Reset** ⏱️ 2 minutes
Visit: https://the-odds-api.com/account/
- [ ] Confirm: 0 / 20,000 usage (reset successful)

---

### **2. Backfill Weeks 4-7** ⏱️ 20-30 minutes | 💰 ~5,000 requests

**Go to**: GitHub Actions → Historical Odds Backfill workflow

**Run with**:
```yaml
Season: 2025
Weeks: 4-7
Markets: spreads,totals
Regions: us
Credits limit: 1200
Dry run: false
Historical strict: true
Enable season fallback: true
Concurrency: 2
```

**Expected**: ~200-250 more games added

**Verify**:
```bash
cd C:\Users\Bobby\gridiron-edge-v1\Gridiron-Edge-V1
npx tsx scripts/check-data-availability.ts
```

Should show:
- Week 4: 50-70 games
- Week 5: 40-60 games
- Week 6: 45-65 games
- Week 7: 45-65 games

---

### **3. Check Week 9 Status** ⏱️ 2 minutes

Week 9 has 5,134 lines but games might not be marked final yet.

**Check in Supabase**:
```sql
SELECT status, COUNT(*) as count
FROM "Game"
WHERE season = 2025 AND week = 9
GROUP BY status;
```

- [ ] If all `final`: Week 9 data already available! ✅
- [ ] If not: Games still in progress, check again later

---

### **4. Run Calibration** ⏱️ 5 minutes | 💰 0 requests

```bash
npm run calibrate:ridge 2025 1-11
```

**Expected Results** (with ~500-550 games):
```
R²:   30-40% (currently 1.4%)
RMSE: 8-10 pts (currently 15.93 pts)
β₁:   5-7 (currently 0.50)
```

✅ **Success if**: R² ≥ 30% and RMSE ≤ 10 pts
⚠️ **Needs 2024 data if**: R² < 25%

---

### **5. (Optional) Check Week 12** ⏱️ 2 minutes

Week 12 games should be final by Nov 17-18.

**Check in Supabase**:
```sql
SELECT status, COUNT(*) as count
FROM "Game"
WHERE season = 2025 AND week = 12
GROUP BY status;
```

When all final, re-run calibration to include Week 12 (~45 more games).

---

## 📊 **Expected Progress**

| Metric | Nov 11 (Current) | Nov 15 (Target) | Improvement |
|--------|------------------|-----------------|-------------|
| **Games** | 293 | 500-550 | +70-90% |
| **R²** | 1.4% | 30-40% | 20-30x better! |
| **RMSE** | 15.93 pts | 8-10 pts | ~40% reduction |
| **β₁** | 0.50 | 5-7 | 10-14x stronger |

---

## 📚 **Full Documentation**

See: `docs/WORKFLOW_GUIDE_FOR_DATA_INGESTION.md`

---

## 🚨 **If Something Goes Wrong**

### **Workflow Fails**
- Check GitHub Actions logs
- Review `docs/WORKFLOW_GUIDE_FOR_DATA_INGESTION.md` troubleshooting section
- Ping the team/assistant

### **No Data Ingested**
- Verify API key still valid
- Check if The Odds API has data for those weeks
- Try one week at a time to isolate issue

### **Poor Calibration Results**
- If R² still < 20% after weeks 4-7: Plan to add 2024 data in December
- Check data distribution: Need more P5_P5 games (late-season weeks are best)

---

## ⏱️ **Total Time Required**
- API reset check: 2 min
- Backfill weeks 4-7: 20-30 min
- Verification: 5 min
- Calibration: 5 min
- **TOTAL: ~30-45 minutes**

---

## 💰 **API Cost Tracking**

| Task | Cost | Running Total | Remaining |
|------|------|---------------|-----------|
| Start | 0 | 0 | 20,000 |
| Weeks 4-7 backfill | ~5,000 | 5,000 | 15,000 |
| Buffer for retries | ~1,000 | 6,000 | 14,000 |

✅ **Safe**: 14,000 requests remaining for rest of month

---

**Set calendar reminder**: November 15, 2025 @ 9:00 AM
**Estimated completion**: 10:00 AM

🎯 **Goal**: Get to production-ready calibration (R² ≥ 30%, RMSE ≤ 10 pts)

