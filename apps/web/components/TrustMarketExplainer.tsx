/**
 * Trust-Market Explainer Component
 * 
 * Explains what Trust-Market mode is and why some games show "PASS"
 * even when the raw model has a disagreement with the market.
 */

'use client';

import React from 'react';
import { InfoTooltip } from './InfoTooltip';

export function TrustMarketExplainer() {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
      <div className="flex items-start gap-2 mb-2">
        <h3 className="text-sm font-semibold text-blue-900">
          What is Trust-Market mode?
        </h3>
        <InfoTooltip 
          content="Trust-Market = humility filter. If the model disagrees with the line by more than we trust, or the data is noisy, we cap the edge to zero and treat it as a PASS, even if the raw number looks juicy."
          position="top"
        />
      </div>
      <p className="text-xs text-blue-800 leading-relaxed">
        Your model has an ego. The betting market doesn't care.
      </p>
      <p className="text-xs text-blue-800 leading-relaxed mt-2">
        Trust-Market mode lets the raw model spit out its numbers, then asks: "Is this disagreement with the closing line realistically tradable, or are we just being loud and wrong?"
      </p>
      <p className="text-xs text-blue-800 leading-relaxed mt-2">
        When our raw edge gets too big, data quality is sketchy, or inputs look weird, Trust-Market caps the edge to 0 and calls the game a PASS. You'll still see the raw model number for context, but the "official" pick list only uses the Trust-Market version.
      </p>
      <div className="mt-3 pt-3 border-t border-blue-200">
        <p className="text-xs font-semibold text-blue-900">
          TL;DR
        </p>
        <p className="text-xs text-blue-800 mt-1">
          <span className="font-semibold">Raw model</span> = what the math thinks.
        </p>
        <p className="text-xs text-blue-800">
          <span className="font-semibold">Official (Trust-Market)</span> = what we're actually willing to bet.
        </p>
      </div>
    </div>
  );
}

