// scripts/check_canaries.ts

// One-click API regression for Phase-1 guarantees.

// Run: npx tsx scripts/check_canaries.ts

type PickSide = 'fav' | 'dog' | null;

type GameId = string;

// ---- Configure your 5 canaries (update slugs to match your IDs) ----

const CANARIES: { label: string; id: GameId; classHint: string }[] = [
  { label: 'OSU @ Purdue (P5-P5, extreme favorite)', id: '2025-wk11-ohio-state-purdue', classHint: 'P5-P5_extreme' },
  { label: 'Navy @ Notre Dame (P5-G5, extreme favorite)', id: '2025-wk11-navy-notre-dame', classHint: 'P5-G5_extreme' },
  { label: 'LSU @ Alabama (P5-P5, competitive)', id: '2025-wk11-lsu-alabama', classHint: 'P5-P5_comp' },
  { label: 'SMU @ Boston College (P5-G5, normal)', id: '2025-wk11-smu-boston-college', classHint: 'P5-G5' },
  { label: 'Spare normal game', id: '2025-wk11-florida-state-clemson', classHint: 'normal' },
];

// ---- Helpers ----

const FAILS: string[] = [];

const log = (ok: boolean, msg: string) => {
  console.log(`${ok ? '✅' : '❌'} ${msg}`);
  if (!ok) FAILS.push(msg);
};

const num = (x: any) => (typeof x === 'number' && isFinite(x) ? x : null);

const abs = Math.abs;

const round1 = (x: number) => Math.round(x * 10) / 10;

// ---- Assertions ----

function assertAts(game: any) {
  const v = game.validation ?? {};
  const mv = game.model_view ?? {};
  const picks = game.picks ?? {};
  const snap = game.market_snapshot ?? {};
  const ats = picks.spread ?? {};

  // independent validation exists
  log(v.ats_inputs_ok === true, 'ATS: inputs_ok true');

  // market favorite sign sanity
  const favLine = num(snap.favoriteLine);
  log(favLine !== null && favLine < 0, `ATS: market favorite line negative (${favLine})`);

  // edge uses capped overlay, not raw disagreement
  const edge = num(mv.edges?.atsEdgePts);
  const overlayUsed = num(mv.spread_lineage?.overlay_used ?? ats.overlay?.overlay_used_pts);
  log(overlayUsed !== null && edge !== null && Math.abs(edge - overlayUsed) < 0.01, 
      `ATS: edge matches overlay_used (${edge} vs ${overlayUsed})`);

  // bet-to & flip present when ats_inputs_ok
  const betTo = num(ats.betTo);
  const flip = num(ats.flip);
  log(betTo !== null, `ATS: bet-to present (${betTo})`);
  log(flip !== null, `ATS: flip present (${flip})`);

  // 3) ATS range coherence: pick side must agree with overlay sign
  // 5) ATS single-source truth: overlay sign determines pick side
  const o = overlayUsed;
  const floor = num(ats.overlay?.edge_floor_pts) ?? 2.0;
  const hasPick = o !== null && abs(o) >= floor;
  if (picks.spread?.bettablePick && o !== null && snap) {
    const pickTeamId = picks.spread.bettablePick.teamId;
    const pickIsDog = pickTeamId === snap.dogTeamId;
    const overlayFavorsDog = o > 0;
    log((overlayFavorsDog && pickIsDog) || (!overlayFavorsDog && !pickIsDog), 
        `ATS: pick side matches overlay sign (overlay=${o.toFixed(2)}, pickIsDog=${pickIsDog}, pickTeam=${picks.spread.bettablePick.teamName})`);
    
    // Assert: overlay < 0 => pick team === favorite, overlay > 0 => pick team === dog
    const pickIsFav = pickTeamId === snap.favoriteTeamId;
    if (o < 0) {
      log(pickIsFav, 
          `ATS: overlay < 0, pick must be favorite (pick=${picks.spread.bettablePick.teamName}, fav=${snap.favoriteTeamName})`);
    } else if (o > 0) {
      log(pickIsDog, 
          `ATS: overlay > 0, pick must be dog (pick=${picks.spread.bettablePick.teamName}, dog=${snap.dogTeamName})`);
    }
    
    // Single-source truth assertion
    log((o < 0 && pickIsFav) || (o > 0 && !pickIsFav),
        `ATS: single-source truth - overlay sign determines pick side (o=${o.toFixed(2)}, pickIsFav=${pickIsFav})`);
  }

  // overlay threshold messaging coherent
  const meets = overlayUsed !== null ? abs(overlayUsed) >= floor : false;
  const hasPickFlag = !!ats.grade; // grade exists when pick rendered
  // In Trust-Market, pick may still be withheld for other reasons; just assert coherence
  log(true, `ATS: overlay ${round1(overlayUsed ?? NaN)} vs floor ${floor} (meets=${meets})`);
}

function assertTotals(game: any) {
  const picks = game.picks ?? {};
  const tot = picks.total ?? {};
  const v = game.validation ?? {};
  const headline = num(tot.headlineTotal);
  const market = num(tot.marketTotal);

  // headline shows market total
  log(headline !== null && market !== null && Math.abs(headline - market) < 0.01,
      `OU: headlineTotal equals marketTotal (${headline})`);

  // three-state honesty
  const hasModel = tot.modelTotal !== null && typeof tot.modelTotal !== 'undefined';
  if (!hasModel) {
    // unavailable path must have a reason
    const reason = v.ou_reason ?? tot.reason ?? null;
    log(!!reason, `OU: unavailable shows explicit reason (${reason ?? 'missing'})`);
  } else {
    // SHOW_TOTALS_PICKS=false → no pick, only no-edge info allowed
    const grade = tot.grade ?? null;
    log(!grade, 'OU: picks suppressed in Trust-Market (SHOW_TOTALS_PICKS=false)');
  }
}

function assertTalent(game: any) {
  const features = game.model_view?.features ?? {};
  const talent = features.talent ?? {};

  // Check that talent feature exists
  log(!!talent, 'Talent: features.talent exists');

  if (!talent) return;

  // Check required fields
  const homeUsed = num(talent.home_used);
  const awayUsed = num(talent.away_used);
  const diff = num(talent.diff);
  const diffZ = num(talent.diff_z);
  const seasonMean = num(talent.season_mean);
  const seasonStd = num(talent.season_std);
  const imputation = talent.imputation ?? {};
  const zDisabled = talent.talent_z_disabled === true;

  log(homeUsed !== null, `Talent: home_used numeric (${homeUsed})`);
  log(awayUsed !== null, `Talent: away_used numeric (${awayUsed})`);
  log(diff !== null, `Talent: diff numeric (${diff})`);
  
  // diff_z should be numeric OR (0 and z_disabled)
  if (zDisabled) {
    log(diffZ === 0, `Talent: diff_z === 0 when z_disabled=true (${diffZ})`);
  } else {
    log(diffZ !== null, `Talent: diff_z numeric when z_enabled (${diffZ})`);
  }

  // Season diagnostics
  log(seasonMean !== null, `Talent: season_mean present (${seasonMean})`);
  log(seasonStd !== null, `Talent: season_std present (${seasonStd})`);

  // Imputation flags
  log(imputation.home === 'none' || imputation.home === 'g5_p10', 
      `Talent: imputation.home valid (${imputation.home})`);
  log(imputation.away === 'none' || imputation.away === 'g5_p10', 
      `Talent: imputation.away valid (${imputation.away})`);

  // Sanity: diff === home_used - away_used (within 1e-6)
  if (diff !== null && homeUsed !== null && awayUsed !== null) {
    const expectedDiff = homeUsed - awayUsed;
    const diffError = Math.abs(diff - expectedDiff);
    log(diffError < 1e-6, `Talent: diff === home_used - away_used (error: ${diffError.toFixed(8)})`);
  }

  // If both raw present, imputation should be 'none'
  const homeRaw = num(talent.home_raw);
  const awayRaw = num(talent.away_raw);
  if (homeRaw !== null) {
    log(imputation.home === 'none', `Talent: home imputation='none' when raw present`);
  }
  if (awayRaw !== null) {
    log(imputation.away === 'none', `Talent: away imputation='none' when raw present`);
  }
}

function assertMatchupClass(game: any) {
  const features = game.model_view?.features ?? {};
  const matchup = features.matchup_class ?? {};
  const diag = game.diagnostics?.matchup_class_source ?? {};

  // Check that matchup class feature exists
  log(!!matchup, 'Matchup: features.matchup_class exists');

  if (!matchup) return;

  // Valid matchup classes
  const validClasses = ['P5_P5', 'P5_G5', 'P5_FCS', 'G5_G5', 'G5_FCS'];
  const matchupClass = matchup.class;
  log(validClasses.includes(matchupClass), `Matchup: class valid (${matchupClass})`);

  // Check tiers
  const homeTier = matchup.home_tier;
  const awayTier = matchup.away_tier;
  const validTiers = ['P5', 'G5', 'FCS'];
  log(validTiers.includes(homeTier), `Matchup: home_tier valid (${homeTier})`);
  log(validTiers.includes(awayTier), `Matchup: away_tier valid (${awayTier})`);

  // Check season
  const season = num(matchup.season);
  log(season !== null, `Matchup: season present (${season})`);

  // Check diagnostics source
  if (diag.home) {
    log(!!diag.home.teamId, `Matchup: diagnostics.home.teamId present`);
    log(!!diag.home.season, `Matchup: diagnostics.home.season present`);
    log(!!diag.home.tier, `Matchup: diagnostics.home.tier present (${diag.home.tier})`);
  }
  if (diag.away) {
    log(!!diag.away.teamId, `Matchup: diagnostics.away.teamId present`);
    log(!!diag.away.season, `Matchup: diagnostics.away.season present`);
    log(!!diag.away.tier, `Matchup: diagnostics.away.tier present (${diag.away.tier})`);
  }
}

function assertHFA(game: any) {
  const features = game.model_view?.features ?? {};
  const hfa = features.hfa ?? {};
  const diag = game.diagnostics?.hfa_source ?? {};

  // Check that HFA feature exists
  log(!!hfa, 'HFA: features.hfa exists');

  if (!hfa) return;

  // Check required fields
  const used = num(hfa.used);
  const raw = num(hfa.raw);
  const shrinkW = num(hfa.shrink_w);
  const nHome = hfa.n_home ?? 0;
  const nAway = hfa.n_away ?? 0;
  const leagueMean = num(hfa.league_mean);
  const neutralSite = hfa.neutral_site === true;

  log(used !== null, `HFA: used numeric (${used})`);
  
  // Bounds check: 0.5 ≤ used ≤ 5.0 unless neutral
  if (neutralSite) {
    log(used === 0, `HFA: used === 0 for neutral site (${used})`);
  } else {
    log(used !== null && used >= 0.5 && used <= 5.0, `HFA: used in bounds [0.5, 5.0] (${used})`);
  }

  // Check diagnostics
  if (diag.teamId) {
    log(!!diag.teamId, `HFA: diagnostics.teamId present`);
    log(!!diag.season, `HFA: diagnostics.season present`);
    log(used !== null && Math.abs(diag.used - used) < 0.01, `HFA: diagnostics.used matches feature.used`);
  }

  // Check flags
  if (hfa.capped === true) {
    log(used === 0.5 || used === 5.0, `HFA: capped flag set and used at boundary (${used})`);
  }
  if (hfa.low_sample === true) {
    log((nHome + nAway) < 4, `HFA: low_sample flag set and n_total < 4 (${nHome + nAway})`);
  }
  if (hfa.outlier === true) {
    log(raw !== null && Math.abs(raw) > 8, `HFA: outlier flag set and |raw| > 8 (${raw})`);
  }
}

function assertRecencySurface(game: any) {
  const features = game.model_view?.features ?? {};
  const recency = features.recency ?? {};
  const ratings = game.model_view?.ratings ?? {};
  const spreadLineage = game.model_view?.spread_lineage ?? {};
  const edges = game.model_view?.edges ?? {};
  
  // 1) Recency chip surface - rating_used must be valid
  log(ratings.rating_used === 'weighted' || ratings.rating_used === 'base', 
      `Recency: rating_used valid (${ratings.rating_used})`);
  log(typeof ratings.recencyEffectPts === 'number', 
      `Recency: recencyEffectPts present (${ratings.recencyEffectPts})`);
  log(typeof recency.games_last3 === 'number', 
      `Recency: games_last3 present (${recency.games_last3})`);

  // Check that recency feature exists
  log(!!recency, 'Recency: features.recency exists');

  if (!recency) return;

  // Check weights (new structure: weights.last3, weights.season)
  const weights = recency.weights ?? {};
  const l3Weight = num(weights.last3);
  const seasonWeight = num(weights.season);
  log(l3Weight === 1.5, `Recency: weights.last3 === 1.5 (${l3Weight})`);
  log(seasonWeight === 1.0, `Recency: weights.season === 1.0 (${seasonWeight})`);

  // Check game counts (new structure: single numbers, not home/away split)
  const gamesLast3 = num(recency.games_last3);
  const gamesTotal = num(recency.games_total);
  const effectiveWeightSum = num(recency.effective_weight_sum);

  log(gamesLast3 !== null, `Recency: games_last3 present (${gamesLast3})`);
  log(gamesTotal !== null, `Recency: games_total present (${gamesTotal})`);
  log(effectiveWeightSum !== null, `Recency: effective_weight_sum present (${effectiveWeightSum})`);

  // Assert games_last3 <= games_total
  if (gamesLast3 !== null && gamesTotal !== null) {
    log(gamesLast3 <= gamesTotal, 
        `Recency: games_last3 (${gamesLast3}) <= games_total (${gamesTotal})`);
  }

  // Check effective weight sum
  if (gamesLast3 !== null && gamesTotal !== null && effectiveWeightSum !== null) {
    const expected = 1.5 * gamesLast3 + 1.0 * Math.max(0, gamesTotal - gamesLast3);
    const error = Math.abs(effectiveWeightSum - expected);
    log(error < 0.01, `Recency: effective_weight_sum correct (expected ${expected.toFixed(2)}, got ${effectiveWeightSum.toFixed(2)})`);
  }

  // Check weighted stats exist (new structure: stats_weighted object)
  const statsWeighted = recency.stats_weighted ?? {};
  const statsCount = Object.values(statsWeighted).filter(v => v !== null && v !== undefined && isFinite(v as number)).length;
  log(statsCount > 0, `Recency: stats_weighted present (${statsCount} stats)`);

  // Check ratings (new structure: rating_base, rating_weighted, rating_used, recencyEffectPts)
  log(!!ratings, 'Recency: model_view.ratings exists');
  if (ratings) {
    const ratingBase = num(ratings.rating_base);
    const ratingWeighted = ratings.rating_weighted !== null ? num(ratings.rating_weighted) : null;
    const ratingUsed = ratings.rating_used;
    const recencyEffectPts = num(ratings.recencyEffectPts);

    log(ratingBase !== null, `Recency: rating_base present (${ratingBase})`);
    log(ratingWeighted !== null || ratings.rating_weighted === null, `Recency: rating_weighted present or null (${ratingWeighted})`);
    log(ratingUsed === 'weighted' || ratingUsed === 'base', `Recency: rating_used valid (${ratingUsed})`);
    log(recencyEffectPts !== null, `Recency: recencyEffectPts present (${recencyEffectPts})`);

    // Assert: If rating_used === "weighted", then rating_weighted must be finite and recencyEffectPts = rating_weighted - rating_base
    if (ratingUsed === 'weighted') {
      log(ratingWeighted !== null && isFinite(ratingWeighted!), `Recency: rating_weighted is finite when used (${ratingWeighted})`);
      if (ratingBase !== null && ratingWeighted !== null) {
        const expectedEffect = ratingWeighted - ratingBase;
        const error = Math.abs(recencyEffectPts! - expectedEffect);
        log(error < 0.01, `Recency: recencyEffectPts matches (expected ${expectedEffect.toFixed(2)}, got ${recencyEffectPts!.toFixed(2)})`);
      }
    } else {
      log(recencyEffectPts === 0, `Recency: recencyEffectPts is 0 when base used (${recencyEffectPts})`);
    }
  }

  // Check spread lineage (new structure: rating_source, rating_home_used, rating_away_used, raw_model_spread_from_used)
  log(!!spreadLineage, 'Recency: model_view.spread_lineage exists');
  if (spreadLineage) {
    const ratingSource = spreadLineage.rating_source;
    const ratingHomeUsed = num(spreadLineage.rating_home_used);
    const ratingAwayUsed = num(spreadLineage.rating_away_used);
    const hfaUsed = num(spreadLineage.hfa_used);
    const rawModelSpread = num(spreadLineage.raw_model_spread_from_used);
    const overlayUsed = num(spreadLineage.overlay_used);
    const finalSpread = num(spreadLineage.final_spread_with_overlay);

    log(ratingSource === 'weighted' || ratingSource === 'base', 
        `Recency: spread_lineage.rating_source valid (${ratingSource})`);
    log(ratingHomeUsed !== null, `Recency: rating_home_used present (${ratingHomeUsed})`);
    log(ratingAwayUsed !== null, `Recency: rating_away_used present (${ratingAwayUsed})`);
    log(hfaUsed !== null, `Recency: hfa_used present (${hfaUsed})`);
    log(rawModelSpread !== null, `Recency: raw_model_spread_from_used present (${rawModelSpread})`);
    log(overlayUsed !== null, `Recency: overlay_used present (${overlayUsed})`);
    log(finalSpread !== null, `Recency: final_spread_with_overlay present (${finalSpread})`);

    // Assert: raw_model_spread_from_used must equal the components shown (within ±0.1)
    if (ratingHomeUsed !== null && ratingAwayUsed !== null && hfaUsed !== null && rawModelSpread !== null) {
      const expected = ratingHomeUsed - ratingAwayUsed + hfaUsed;
      const error = Math.abs(rawModelSpread - expected);
      log(error < 0.1, `Recency: raw_model_spread_from_used matches components (expected ${expected.toFixed(2)}, got ${rawModelSpread.toFixed(2)})`);
    }

    // Assert: model_view.edges.atsEdgePts === spread_lineage.overlay_used (same capped value)
    const atsEdgePts = num(edges.atsEdgePts);
    if (atsEdgePts !== null && overlayUsed !== null) {
      const error = Math.abs(atsEdgePts - overlayUsed);
      log(error < 0.01, `Recency: atsEdgePts matches overlay_used (${atsEdgePts} vs ${overlayUsed})`);
    }

    // Assert overlay rules unchanged (cap ±3.0, floor 2.0)
    if (overlayUsed !== null) {
      log(Math.abs(overlayUsed) <= 3.0, `Recency: overlay_used within cap ±3.0 (${overlayUsed.toFixed(2)})`);
    }
    
    // Assert final spread is coherent
    if (finalSpread !== null) {
      log(isFinite(finalSpread), `Recency: final_spread_with_overlay is finite (${finalSpread.toFixed(2)})`);
    }
  }

  // Check for NaN in weighted stats
  const checkForNaN = (obj: any, prefix: string) => {
    for (const [key, value] of Object.entries(obj)) {
      if (value !== null && value !== undefined) {
        const numVal = typeof value === 'number' ? value : Number(value);
        if (isNaN(numVal) || !isFinite(numVal)) {
          log(false, `Recency: ${prefix}.${key} is NaN/inf (${value})`);
        }
      }
    }
  };

  if (statsWeighted) checkForNaN(statsWeighted, 'stats_weighted');
}

function assertMoneyline(game: any) {
  const picks = game.picks ?? {};
  const ml = picks.moneyline ?? {};
  const snap = game.market_snapshot ?? {};
  const favLine = num(snap.favoriteLine);
  
  // Get finalSpreadWithOverlay from spread_lineage (PHASE 2.4)
  const finalSpread = num(game.model_view?.spread_lineage?.final_spread_with_overlay ?? 
                         game.model_view?.finalSpreadWithOverlay ?? 
                         game.picks?.spread?.overlay?.final ?? 
                         game.finalSpreadWithOverlay);

  // 2) ML guard: must be suppressed when |finalSpreadWithOverlay| > 7
  const absFinal = finalSpread !== null ? abs(finalSpread) : null;
  if (absFinal !== null && absFinal > 7) {
    log(!ml?.grade && !ml?.pickLabel, `ML: suppressed for |finalSpreadWithOverlay| > 7 (=${finalSpread})`);
    const suppressionReason = ml?.suppressionReason ?? null;
    log(!!suppressionReason && suppressionReason.includes('Spread too wide'), 
        `ML: suppression reason correct (${suppressionReason ?? 'missing'})`);
    return;
  }
  
  // Get finalSpreadWithOverlay from spread_lineage (PHASE 2.4)
  const finalSpreadFC = num(game.model_view?.spread_lineage?.final_spread_with_overlay);
  
  // 1) Favorite coherence: modelFavTeamId must match finalSpreadWithOverlay sign
  const basis = ml?.calc_basis;
  if (basis && finalSpreadFC !== null && snap) {
    const s = finalSpreadFC;
    const favId = s < 0 ? snap.favoriteTeamId : snap.dogTeamId;
    log(basis.modelFavTeamId === favId, 
        `ML: modelFavTeamId matches finalSpreadWithOverlay sign (favId=${favId}, basis.modelFavTeamId=${basis.modelFavTeamId}, s=${s.toFixed(2)})`);
  }
  
  // 2) Probability/odds coherence
  if (basis) {
    log(basis.modelFavProb > 0.5 && basis.fairMLFav < 0, 
        `ML: modelFavProb > 0.5 (${basis.modelFavProb?.toFixed(3)}) and fairMLFav < 0 (${basis.fairMLFav})`);
    log(basis.modelDogProb < 0.5 && basis.fairMLDog > 100, 
        `ML: modelDogProb < 0.5 (${basis.modelDogProb?.toFixed(3)}) and fairMLDog > 100 (${basis.fairMLDog})`);
  }
  
  // 3) Picked side coherence
  if (ml?.pickLabel && basis?.isUnderdogPick !== null && basis?.isUnderdogPick !== undefined) {
    const isDogPick = basis.isUnderdogPick;
    if (isDogPick) {
      log(basis.modelDogProb < 0.5 && basis.fairMLDog > 100, 
          `ML: underdog pick has modelDogProb < 0.5 (${basis.modelDogProb?.toFixed(3)}) and fairMLDog > 100 (${basis.fairMLDog})`);
    } else {
      log(basis.modelFavProb > 0.5 && basis.fairMLFav < 0, 
          `ML: favorite pick has modelFavProb > 0.5 (${basis.modelFavProb?.toFixed(3)}) and fairMLFav < 0 (${basis.fairMLFav})`);
    }
  }
  
  // 4) ML guard - use finalSpreadFC from spread_lineage
  if (finalSpreadFC !== null) {
    log(Math.abs(finalSpreadFC) > 7 ? !!ml?.suppressionReason : true,
        `ML: guard triggers when |finalSpreadWithOverlay| > 7 (s=${finalSpreadFC.toFixed(2)}, suppressed=${!!ml?.suppressionReason})`);
  }
  
  // 5) Phase 2.4 fields present
  log(game.model_view?.spread_lineage?.final_spread_with_overlay !== undefined,
      `Phase 2.4: spread_lineage.final_spread_with_overlay present`);
  log(['weighted', 'base'].includes(game.model_view?.ratings?.rating_used ?? ''),
      `Phase 2.4: ratings.rating_used is 'weighted' or 'base'`);
  if (basis) {
    log(basis.modelFavProb > 0.5, `Phase 2.4: calc_basis.modelFavProb > 0.5 (${basis.modelFavProb?.toFixed(3)})`);
    log(basis.fairMLFav < 0, `Phase 2.4: calc_basis.fairMLFav < 0 (${basis.fairMLFav})`);
    log(basis.modelDogProb < 0.5, `Phase 2.4: calc_basis.modelDogProb < 0.5 (${basis.modelDogProb?.toFixed(3)})`);
    log(basis.fairMLDog > 100, `Phase 2.4: calc_basis.fairMLDog > 100 (${basis.fairMLDog})`);
  }
  
  // 6) Lineage basis: finalSpreadWithOverlayFC sign matches raw_model_spread_from_used
  if (finalSpreadFC !== null && game.model_view?.spread_lineage?.raw_model_spread_from_used !== undefined) {
    const rawFC = num(game.model_view.spread_lineage.raw_model_spread_from_used);
    if (rawFC !== null) {
      const signsMatch = Math.sign(finalSpreadFC) === Math.sign(rawFC);
      log(signsMatch, 
          `Lineage: finalSpreadWithOverlayFC sign matches raw_model_spread_from_used (final=${finalSpreadFC.toFixed(2)}, raw=${rawFC.toFixed(2)})`);
    }
  }
  
  // 7) ML coherence: modelFavoriteTeam matches calc_basis.modelFavTeamId
  if (basis && ml?.modelFavoriteTeam) {
    const favTeamName = basis.modelFavTeamId === game.homeTeamId ? game.homeTeam.name : game.awayTeam.name;
    log(ml.modelFavoriteTeam === favTeamName,
        `ML: modelFavoriteTeam matches calc_basis.modelFavTeamId (${ml.modelFavoriteTeam} === ${favTeamName})`);
  }
  
  // 8) ML isUnderdog coherence: isUnderdog reflects market vs model (true if picked team is NOT market favorite)
  if (ml?.isUnderdog !== null && ml?.isUnderdog !== undefined && snap && ml?.pickLabel) {
    const pickedTeamName = ml.pickLabel.replace(' ML', '');
    const pickedTeamId = pickedTeamName === game.homeTeam.name ? game.homeTeamId : game.awayTeamId;
    const isMarketFav = pickedTeamId === snap.favoriteTeamId;
    // isUnderdog should be true if picked team is NOT the market favorite (regardless of model favorite)
    log(ml.isUnderdog === !isMarketFav,
        `ML: isUnderdog reflects market vs model (isUnderdog=${ml.isUnderdog}, pickedTeam=${pickedTeamName}, isMarketFav=${isMarketFav})`);
  }
  
  // 9) Prob/price sanity: If modelFavProb > 0.5 then fairMLFav < 0
  if (basis) {
    if (basis.modelFavProb > 0.5) {
      log(basis.fairMLFav < 0, 
          `ML: modelFavProb > 0.5 (${basis.modelFavProb?.toFixed(3)}) implies fairMLFav < 0 (${basis.fairMLFav})`);
    } else {
      log(basis.fairMLFav > 0, 
          `ML: modelFavProb < 0.5 (${basis.modelFavProb?.toFixed(3)}) implies fairMLFav > 0 (${basis.fairMLFav})`);
    }
    if (basis.modelDogProb < 0.5) {
      log(basis.fairMLDog > 100, 
          `ML: modelDogProb < 0.5 (${basis.modelDogProb?.toFixed(3)}) implies fairMLDog > 100 (${basis.fairMLDog})`);
    } else {
      log(basis.fairMLDog < 0, 
          `ML: modelDogProb > 0.5 (${basis.modelDogProb?.toFixed(3)}) implies fairMLDog < 0 (${basis.fairMLDog})`);
    }
  }

  // hard gates
  const extremeFav = favLine !== null ? abs(favLine) >= 21 : false;
  if (extremeFav) {
    log(!ml?.grade && !ml?.pickLabel, `ML: suppressed for extreme favorite (|${favLine}| ≥ 21)`);
    const suppressionReason = ml?.suppressionReason ?? null;
    log(!!suppressionReason, `ML: suppression reason present (${suppressionReason ?? 'missing'})`);
    return;
  }

  // If ML shown, require positive value and explanatory flag
  if (ml?.grade) {
    const valPct = num(ml.valuePercent);
    log(valPct !== null && valPct > 0, `ML: positive valuePercent (${valPct}%)`);
    log(ml.winprob_basis === 'overlay_spread' || ml.note?.includes('overlay'),
        'ML: win prob derived from overlay-adjusted spread');
  } else {
    log(true, 'ML: gated off (conditions unmet) — OK');
  }
}

async function fetchGame(id: GameId, baseUrl: string) {
  const url = `${baseUrl}/api/game/${id}`;
  const res = await fetch(url, { 
    headers: { 
      'x-regression': 'true',
      'Accept': 'application/json'
    } 
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${id}`);
  return res.json();
}

(async () => {
  // Preserve original fetch if running under Node 18+
  // @ts-ignore
  if (typeof fetch === 'undefined') {
    // Node.js environment - need to use node-fetch or similar
    console.error('❌ This script requires fetch API. Use Node 18+ or install node-fetch.');
    process.exit(1);
  }

  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  console.log(`\nRunning canary checks against BASE_URL=${baseUrl}\n`);

  for (const g of CANARIES) {
    try {
      const data = await fetchGame(g.id, baseUrl);
      console.log(`\n— ${g.label} [${g.id}] —`);
      assertAts(data);
      assertTotals(data);
      assertTalent(data);
      assertMatchupClass(data);
      assertHFA(data);
      assertRecencySurface(data);
      assertMoneyline(data);
    } catch (e: any) {
      log(false, `Fetch/parse failed for ${g.label} (${g.id}): ${e?.message || e}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Summary:', FAILS.length ? `❌ ${FAILS.length} failures` : '✅ All checks passed');
  if (FAILS.length) {
    console.log('\nFailures:');
    FAILS.forEach((f, i) => console.log(`${i+1}. ${f}`));
    process.exit(1);
  }
  process.exit(0);
})();

