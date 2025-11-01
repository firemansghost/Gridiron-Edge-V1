# Team Aliases Configuration Guide

## Location

The team aliases file is located at:
```
apps/jobs/config/team_aliases.yml
```

This file maps team names from Odds API to your database team IDs.

## How to View/Edit

### Option 1: In Your Code Editor
Navigate to: `apps/jobs/config/team_aliases.yml`

### Option 2: Via GitHub Web Interface
1. Go to your GitHub repository
2. Navigate to: `apps/jobs/config/team_aliases.yml`
3. Click "Edit" to modify

### Option 3: Via Command Line
```bash
# View the file
cat apps/jobs/config/team_aliases.yml

# Edit with your preferred editor
code apps/jobs/config/team_aliases.yml  # VS Code
vim apps/jobs/config/team_aliases.yml   # Vim
```

## Format

The file uses YAML format:

```yaml
aliases:
  "Odds API Team Name": database-team-id
  "Another Team Name": another-team-id
```

## Common Issues

### Games Missing Odds Due to Team Name Mismatches

If the odds ingestion logs show "unmatched teams" or games don't get odds even though Odds API has them, you likely need to add aliases:

1. Check the logs from the odds ingestion workflow
2. Look for "unmatched teams" or team names that failed to resolve
3. Add entries to `team_aliases.yml` mapping those names to your database team IDs
4. Commit and push the changes
5. Re-run the odds ingestion workflow

### Example

If you see in logs:
```
[ODDSAPI] COULD_NOT_RESOLVE_TEAMS: "Texas A&M" @ "Alabama"
```

You would add to `team_aliases.yml`:
```yaml
aliases:
  "Texas A&M": texas-a-m
  "Texas A&M Aggies": texas-a-m
```

## Important Notes

- All target team IDs must be FBS teams only
- Team IDs should match your database `teams` table `id` column
- After modifying aliases, you need to rebuild jobs: `npm run build:jobs`
- The workflow will automatically use updated aliases after rebuild

