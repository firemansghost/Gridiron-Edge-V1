/**
 * Standardized Tooltip Content
 * 
 * Centralized tooltip messages for consistent explanations across the application
 */

export const TOOLTIP_CONTENT = {
  // ATS Edge explanations
  ATS_EDGE_FORMULA: "ATS Edge = (Model favorite spread) - (Market favorite spread). Positive means model thinks the favorite should lay more points. Negative means model thinks favorite should lay fewer points.",
  
  ATS_EDGE_SIMPLE: "ATS Edge measures how much our model disagrees with the market spread. Positive = model thinks favorite should lay more, negative = model thinks favorite should lay fewer.",
  
  // Total Edge explanations
  TOTAL_EDGE_FORMULA: "Total Edge = Model Total - Market Total. Positive means model thinks Over (higher scoring), negative means model thinks Under (lower scoring).",
  
  TOTAL_EDGE_SIMPLE: "Total Edge shows how much our model disagrees with the market total. Positive = model thinks Over, negative = model thinks Under.",
  
  // Talent Component explanations
  TALENT_COMPONENT: "Roster talent contribution to each team's power rating. Sourced from 247 Sports Composite talent ratings. Decays as the season progresses (100% weight at week 0, 0% at week 8+) as game statistics become more reliable. This is separate from Home Field Advantage (HFA).",
  
  TALENT_DECAY: "Talent influence decreases linearly from 100% at week 0 to 0% at week 8+ as game statistics become more reliable indicators of team strength.",
  
  TALENT_SOURCE: "Data sourced from 247 Sports Composite Talent Ratings via CFBD API. Includes roster talent composite, blue-chip percentage, and recruiting class signal.",
  
  // Grade/Confidence Thresholds
  GRADE_THRESHOLDS: "Confidence grades based on edge magnitude: A ≥ 4.0 pts (high confidence), B ≥ 3.0 pts (medium confidence), C ≥ 2.0 pts (low confidence). Only picks with 2.0+ pts edge are shown.",
  
  GRADE_A: "Grade A: High confidence pick with edge ≥ 4.0 points. Strongest betting opportunities.",
  
  GRADE_B: "Grade B: Medium confidence pick with edge ≥ 3.0 points. Good betting opportunities.",
  
  GRADE_C: "Grade C: Low confidence pick with edge ≥ 2.0 points. Use with caution.",
  
  // Home Field Advantage
  HFA: "Home Field Advantage (HFA) is a constant points value (typically 2.0-3.0) awarded to the home team. This accounts for factors like crowd noise, travel distance, and familiarity. Separate from talent component.",
  
  // Power Rating
  POWER_RATING: "A team's overall strength rating combining offensive and defensive capabilities. Higher numbers indicate stronger teams. Used to predict game outcomes and calculate point spreads.",
  
  // Confidence (data quality)
  CONFIDENCE: "A measure (0-1 scale) of how reliable this rating is, based on data quality and coverage. Higher confidence means more reliable predictions.",
  
  // Model Information
  MODEL_VERSION: "Ratings Model v1 uses feature-based power ratings calculated from offensive and defensive statistics. Click version number to view changelog.",
  
  // Spread explanations
  SPREAD_FORMAT: "Spread is shown in favorite-centric format: the favorite always shows -X.X (laying points). Our model calculates its own spread prediction based on team ratings.",
  
  MODEL_FAVORITE: "Our model's predicted favorite team and spread. The favorite always shows -X.X (laying points).",
  
  MARKET_FAVORITE: "The betting market's favorite team and spread. This is what you'd actually bet against.",
  
  // Total explanations
  TOTAL_EXPLANATION: "The total points expected to be scored by both teams combined. You can bet over or under this number.",
  
  MODEL_TOTAL: "Our model's predicted total points for this game, based on team offensive/defensive ratings and pace.",
  
  MARKET_TOTAL: "The best available total points line from the betting market (prefers SGO source, then latest). This is what you'd actually bet against.",
  
  // Edge general
  EDGE_GENERAL: "Edge is the difference between our model's prediction and the betting market (in points). Positive edge means our model thinks the market is mispriced, creating a betting opportunity.",
  
  SPREAD_EDGE: "Difference between our model's spread prediction and the market spread. Higher positive edge = stronger betting opportunity on the spread.",
  
  TOTAL_EDGE_VALUE: "Difference between our model's total prediction and the market total. Positive edge suggests over, negative suggests under.",
  
  MAX_EDGE: "The larger of ATS edge or Total edge (absolute value). This is the strongest betting opportunity for this game.",
  
  // Recommended Picks
  RECOMMENDED_PICKS: "These are our model's betting recommendations based on comparing our predictions to the market. Grades (A/B/C) indicate confidence level based on edge magnitude. Always do your own research before placing bets.",
  
  // Weather
  WEATHER: "Game-time weather forecast from Visual Crossing for the game date and kickoff time. Weather can affect scoring, especially wind and precipitation.",
  
  // Injuries
  INJURIES: "Player injury reports from ESPN. OUT = confirmed out, QUESTIONABLE = may not play, PROBABLE = likely to play, DOUBTFUL = unlikely to play.",
  
  // Line Movement
  LINE_MOVEMENT: "Shows how the betting lines have moved over time. Green dot = opening line, Red dot = closing line. Line movement can indicate where sharp money is going. Labels show exact values at Open and Close.",
  
  // Betting Lines
  MARKET_LINES: "Current betting market lines for this game. These are the lines you would bet against at sportsbooks.",
} as const;

