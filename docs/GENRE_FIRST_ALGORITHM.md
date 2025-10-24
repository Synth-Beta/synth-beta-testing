# Genre-First Personalized Feed Algorithm

## 🎯 Core Principle

**"Genre is the anchor, artist is the enhancer, song behavior is the signal."**

Instead of centering around specific artists or venues, the algorithm prioritizes:

1. **Genre Affinity** - The user's true musical preferences
2. **Artist Familiarity** - Known artists with novelty controls
3. **Song Behavior Signals** - Recent listening patterns and track metadata
4. **Social Proof** - Friend activity (reduced influence)
5. **Recency** - Event timing relevance
6. **Promotion Boost** - Business layer (applied last)

## ⚙️ Architecture Overview

### Base Scoring Model (0–100+ points)

| Component | Max Points | Purpose | How It Works |
|-----------|------------|---------|--------------|
| **Genre Affinity Score** | 45 | Core match strength | Weighted average of user's top genre affinities. Directly boosts events within those genres. |
| **Artist Familiarity Score** | 20 | Reinforce known artists | Gives extra points for artists the user listens to, with novelty penalty for over-exposure. |
| **Song Behavior Signal** | 15 | Capture listening depth | Derived from recently liked/played songs; uses track metadata to infer sub-genres and moods. |
| **Social Proof Score** | 5 | Friend-driven relevance | Small bump (1 point per friend interested, max 5). Keeps social texture without bias. |
| **Recency & Location Score** | 5 | Event timing relevance | 5 → 0 linear decay from now to 45 days out; 0 beyond 60 days. |
| **Promotion Boost** | 25 | Business layer | +10 (Basic), +18 (Premium), +25 (Featured). Always applied after organic scoring. |

**Total Possible: 115 points (capped at 100 before promotions)**

## 🎵 Genre-First Logic

### 1. Build User Genre Profile

The algorithm pulls genre preferences from multiple sources:

- **Listening Data** (Spotify/Apple APIs, song imports)
- **Followed Artists' Genres**
- **Liked Events**
- **Tag-based Self-selection** (if user sets preferences)

**Example Genre Profile:**
```
Genre        Weight
Indie Rock   0.42
Alt Pop      0.31
Neo-Soul     0.15
EDM          0.12
```

### 2. Apply to Events

For each event:
```sql
genre_affinity_score = Σ (event_genre_weight * user_genre_weight) * 45
```

If the event has multiple genres, average their affinities.

## 🎧 Artist Familiarity + Song Behavior

### Artist Familiarity (20 points max)

- Match event's artist(s) to user's top artists
- Linear scoring from 0–20 based on listen count percentile
- **Novelty Penalty**: -2 points for each recent event (max -6) to encourage discovery

### Song Behavior (15 points max)

- Pull metadata tags (mood, tempo, sub-genre) from recently played/liked songs
- If event's artists share tags with these songs → add up to 15 points
- Example: If user often plays "chill indie acoustic" songs, an acoustic night event scores high

## 👥 Social, Recency, and Promotion

| Factor | Description | Example Formula |
|--------|-------------|-----------------|
| **Social Proof** | 1 point per friend interested, capped at 5 | `min(friends_count * 1, 5)` |
| **Recency** | Linear decay for time proximity | `max(0, 5 - (days_until_event / 9))` |
| **Promotion Boost** | Fixed tier bonus | +10 / +18 / +25 depending on tier |

## 🎨 Novelty + Diversity Controls

### Novelty Penalty
- Slightly reduce artist familiarity score if the user has seen that artist in 2+ past events
- Encourages variety and discovery

### Diversity Rule
- **No more than 3 events per artist** in top 50 results
- Prevents single artists from dominating the feed

### Genre Exploration
- **5% of feed reserved** for adjacent genres based on clustering
- Example: If user loves Indie Rock, sprinkle in Dream Pop events

## 🧠 Scoring Formula

```sql
relevance_score = 
  (GenreAffinity * 0.45) +
  (ArtistFamiliarity * 0.20) +
  (SongBehavior * 0.15) +
  (SocialProof * 0.05) +
  (Recency * 0.05) +
  (PromotionBoost * promotion_tier_weight)
```

Then normalize to 0–100.

## 🔄 Algorithm Flow

### Step 1: Genre Profile Building
1. Aggregate genre signals from multiple sources
2. Normalize weights (sum = 1.0)
3. Filter out genres with <1% weight

### Step 2: Event Scoring
1. **Genre Affinity**: Match event genres to user's genre profile
2. **Artist Familiarity**: Check artist match with novelty penalty
3. **Song Behavior**: Analyze recent listening patterns
4. **Social Proof**: Count friend interest
5. **Recency**: Calculate time-based score
6. **Promotion Boost**: Apply tier-based bonus

### Step 3: Diversity Controls
1. **Artist Diversity**: Max 3 events per artist
2. **Genre Exploration**: 5% reserved for adjacent genres
3. **Novelty Penalty**: Reduce scores for over-exposed artists

### Step 4: Final Ranking
1. Sort by total relevance score (DESC)
2. Apply diversity rules
3. Mix in exploration events
4. Return paginated results

## 📊 Score Ranges

- **0-20**: Low relevance (poor matches)
- **21-40**: Medium relevance (some matches)
- **41-60**: High relevance (good matches)
- **61-80**: Very high relevance (strong matches)
- **81-100+**: Excellent relevance (perfect matches + promotion boost)

## 🎯 Key Benefits

### For Users
- **Better Discovery**: Genre-first approach surfaces relevant events
- **Reduced Echo Chambers**: Novelty penalty encourages exploration
- **Balanced Feed**: Diversity controls prevent artist domination
- **Personalized**: Based on actual listening behavior, not just explicit preferences

### For Business
- **Monetizable**: Promotion boost system supports paid placements
- **Authentic**: Promotions don't compromise organic relevance
- **Scalable**: Algorithm handles large user bases efficiently

### For Event Organizers
- **Fair Distribution**: Diversity controls prevent single artists from dominating
- **Quality Matches**: Genre-first approach ensures relevant audiences
- **Promotion Value**: Clear ROI for paid promotion tiers

## 🔧 Technical Implementation

### Database Functions
- `get_user_genre_profile()` - Builds user's genre preferences
- `get_user_song_behavior_signals()` - Analyzes listening patterns
- `calculate_artist_familiarity_with_novelty()` - Artist scoring with penalty
- `calculate_song_behavior_score()` - Song-based relevance
- `get_genre_exploration_events()` - Finds adjacent genre events

### Performance Optimizations
- **Indexed Queries**: Optimized for fast genre/artist lookups
- **Caching**: Genre profiles cached for session duration
- **Batch Processing**: Efficient bulk scoring operations
- **Pagination**: Smart offset/limit for large result sets

## 🚀 Future Enhancements

### Planned Features
- **Mood-based Scoring**: Time-of-day and seasonal preferences
- **Location Awareness**: Geographic proximity weighting
- **Collaborative Filtering**: User similarity-based recommendations
- **Machine Learning**: Continuous algorithm improvement
- **A/B Testing**: Algorithm variant testing framework

### Advanced Analytics
- **Genre Evolution**: Track how user preferences change over time
- **Discovery Metrics**: Measure exploration vs. exploitation balance
- **Engagement Prediction**: Forecast user interest in events
- **Promotion Effectiveness**: ROI analysis for paid placements

## 📈 Success Metrics

### User Engagement
- **Click-through Rate**: Events clicked vs. shown
- **Interest Rate**: Events marked as interested
- **Discovery Rate**: New artists/genres discovered
- **Session Duration**: Time spent browsing events

### Business Metrics
- **Promotion ROI**: Revenue per promoted event
- **Conversion Rate**: Interest → attendance conversion
- **User Retention**: Algorithm impact on user engagement
- **Revenue Growth**: Promotion system monetization

## 🔍 Monitoring & Debugging

### Algorithm Health Checks
- **Score Distribution**: Ensure balanced scoring across users
- **Diversity Metrics**: Track artist/genre distribution
- **Novelty Impact**: Measure exploration vs. exploitation
- **Promotion Balance**: Organic vs. promoted content ratio

### Performance Monitoring
- **Query Performance**: Database query execution times
- **Cache Hit Rates**: Genre profile cache effectiveness
- **Memory Usage**: Algorithm resource consumption
- **Scalability**: Performance under load

This genre-first algorithm represents a significant improvement over artist-centric approaches, providing better discovery, reduced echo chambers, and a more authentic user experience while maintaining strong business value through the promotion system.
