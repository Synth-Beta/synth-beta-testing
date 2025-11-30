# 3NF Analysis: city_centers Table

## Table Schema
```sql
CREATE TABLE public.city_centers (
  id UUID PRIMARY KEY,
  normalized_name TEXT NOT NULL,
  state TEXT,
  country TEXT DEFAULT 'US',
  center_latitude DECIMAL(10, 8) NOT NULL,
  center_longitude DECIMAL(11, 8) NOT NULL,
  aliases TEXT[] DEFAULT '{}',
  event_count INTEGER DEFAULT 0,
  population INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(normalized_name, state, country)
);
```

## 3NF Requirements Check

### ✅ First Normal Form (1NF)
- All attributes are atomic (single values)
- No repeating groups (aliases is an array, but PostgreSQL arrays are atomic at the column level)
- **PASS**

### ✅ Second Normal Form (2NF)
- Must be in 1NF ✓
- No partial dependencies on composite keys
- Primary key: `id` (single column, no composite key issues)
- Candidate key: `(normalized_name, state, country)` - all attributes depend on the full key
- **PASS**

### ✅ Third Normal Form (3NF)
- Must be in 2NF ✓
- No transitive dependencies (non-key attributes must not depend on other non-key attributes)

**Dependency Analysis:**
- `center_latitude` → depends on `(normalized_name, state, country)` ✓ (direct dependency on candidate key)
- `center_longitude` → depends on `(normalized_name, state, country)` ✓ (direct dependency on candidate key)
- `aliases` → depends on `(normalized_name, state, country)` ✓ (direct dependency on candidate key)
- `population` → depends on `(normalized_name, state, country)` ✓ (direct dependency on candidate key)
- `event_count` → **calculated/derived value** from `events` table (not a transitive dependency)
- `created_at`, `updated_at` → system timestamps (not dependencies)

**No transitive dependencies found:**
- There are no cases where A → B → C (where A is a non-key attribute)
- All attributes depend directly on the primary/candidate key

**PASS** ✅

## Special Consideration: event_count

The `event_count` field is a **materialized aggregate** (denormalized for performance):
- It's calculated from the `events` table via an UPDATE statement
- It's not a transitive dependency (doesn't violate 3NF)
- It's a common optimization pattern (materialized views/aggregates)
- Similar to having a `total_sales` column that's updated from `order_items`

**This is acceptable denormalization** and does not violate 3NF because:
1. It's not creating a transitive dependency within the table
2. It's a performance optimization (avoids expensive COUNT queries)
3. It's updated separately, maintaining data integrity

## Conclusion

✅ **The `city_centers` table is in 3NF**

The table structure follows all normalization rules:
- Atomic values
- No partial dependencies
- No transitive dependencies
- Proper key relationships

The `event_count` field is a performance optimization (materialized aggregate) that doesn't violate normalization principles.

