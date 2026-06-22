# SQL Organization

This directory contains all SQL files organized by purpose, keeping the root directory clean.

## 📁 Directory Structure

### `migrations/` (in `supabase/`)
- **Purpose**: Official database schema changes
- **Format**: Timestamped files (e.g., `20250105000001_add_feature.sql`)
- **Usage**: Applied automatically by Supabase CLI
- **Rule**: Only official, tested migrations go here

### `scripts/`
- **Purpose**: Utility scripts and functions
- **Examples**: 
  - `radius_search_functions.sql`
  - `create_review_functions.sql`
  - `venue_normalization_plan.sql`
- **Usage**: Manual execution for specific features

### `seeds/`
- **Purpose**: Sample/test data
- **Examples**:
  - `seed_review_data.sql`
  - `seed-artists.sql`
- **Usage**: Populate database with test data

### `analysis/`
- **Purpose**: Data analysis and reporting queries
- **Examples**:
  - `analyze_location_data.sql`
  - `analyze_venue_cities.sql`
  - `get_unique_venue_cities.sql`
- **Usage**: Understanding data patterns and quality

### `fixes/`
- **Purpose**: One-time fixes and patches
- **Examples**:
  - `fix_artist_venue_relationships_working.sql`
  - `comprehensive_venue_cleanup.sql`
  - `fix_venue_city_duplicates.sql`
- **Usage**: Manual fixes that don't need to be migrations

## 🚀 Migration Process

1. **Development**: Create scripts in appropriate folder
2. **Testing**: Test scripts manually
3. **Migration**: Convert to timestamped migration file
4. **Deploy**: Apply via Supabase CLI

## 📝 Naming Conventions

- **Migrations**: `YYYYMMDDHHMMSS_description.sql`
- **Scripts**: `feature_name.sql` or `action_description.sql`
- **Seeds**: `seed_table_name.sql`
- **Analysis**: `analyze_purpose.sql`
- **Fixes**: `fix_issue_description.sql`
