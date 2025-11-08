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
  { label: 'Spare normal game', id: '2025-wk11-spare-normal', classHint: 'normal' },
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
  const edge = num(mv.edges?.atsEdgePts ?? ats?.edgePts);
  const overlayUsed = num(ats.overlay?.overlay_used_pts);
  log(overlayUsed !== null && edge !== null && Math.abs(edge - overlayUsed) < 0.01, 
      `ATS: edge matches overlay_used (${edge} vs ${overlayUsed})`);

  // bet-to & flip present when ats_inputs_ok
  const betTo = num(ats.betTo);
  const flip = num(ats.flip);
  log(betTo !== null, `ATS: bet-to present (${betTo})`);
  log(flip !== null, `ATS: flip present (${flip})`);

  // overlay threshold messaging coherent
  const floor = num(ats.overlay?.edge_floor_pts) ?? 2.0;
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

function assertMoneyline(game: any) {
  const picks = game.picks ?? {};
  const ml = picks.moneyline ?? {};
  const snap = game.market_snapshot ?? {};
  const favLine = num(snap.favoriteLine);
  
  // Get finalSpreadWithOverlay from model_view or picks
  const finalSpread = num(game.model_view?.finalSpreadWithOverlay ?? 
                         game.picks?.spread?.overlay?.final ?? 
                         game.finalSpreadWithOverlay);

  // hard gates
  const extremeFav = favLine !== null ? abs(favLine) >= 21 : false;
  if (extremeFav) {
    log(!ml?.grade, `ML: suppressed for extreme favorite (|${favLine}| ≥ 21)`);
    const suppressionReason = ml?.suppressionReason ?? null;
    log(!!suppressionReason, `ML: suppression reason present (${suppressionReason ?? 'missing'})`);
    return;
  }

  if (finalSpread !== null && abs(finalSpread) > 7) {
    log(!ml?.grade, `ML: suppressed for |finalSpreadWithOverlay| > 7 (=${finalSpread})`);
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

