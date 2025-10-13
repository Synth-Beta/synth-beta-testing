# 🎯 Simplified Account Types System (4 Types)

**Updated:** January 11, 2025  
**Status:** Ready to Deploy

---

## 📊 **4 CORE ACCOUNT TYPES**

### **1. USER** (Default - Everyone starts here)
- **Who:** Regular concert-goers
- **Subscription:** Free or Premium ($4.99/mo)
- **Analytics:** Personal stats only

### **2. CREATOR** (Artists & Labels)
- **Who:** Musicians, bands, record labels
- **Subscription:** $29-$499/mo (tiered)
- **Analytics:** Artist performance, fan demographics, revenue insights
- **Sub-types via `business_info`:**
  - Solo Artist
  - Band
  - Record Label (manages multiple artists)

### **3. BUSINESS** (Venues, Promoters, Advertisers)
- **Who:** Venues, event promoters, advertisers
- **Subscription:** $49-$499/mo (tiered)
- **Analytics:** Event performance, audience demographics, campaign ROI
- **Sub-types via `business_info`:**
  - Single Venue
  - Multi-Venue Manager
  - Event Promoter
  - Advertiser

### **4. ADMIN** (Internal Only)
- **Who:** Platform administrators
- **Subscription:** N/A (internal)
- **Analytics:** Full platform access

---

## 🔧 **HOW SUB-TYPES WORK**

### **business_info JSONB Structure:**

#### **For CREATOR (Artist)**
```json
{
  "entity_type": "artist",
  "artist_name": "Taylor Swift",
  "artist_id": "uuid-here",
  "genres": ["pop", "country"],
  "spotify_id": "06HL4z0CvFAxyc27GXpf02"
}
```

#### **For CREATOR (Label)**
```json
{
  "entity_type": "label",
  "label_name": "Atlantic Records",
  "managed_artists": ["Ed Sheeran", "Bruno Mars", "Cardi B"],
  "artist_count": 3
}
```

#### **For BUSINESS (Venue)**
```json
{
  "entity_type": "venue",
  "venue_name": "Madison Square Garden",
  "venue_id": "uuid-here",
  "capacity": 20789,
  "city": "New York",
  "state": "NY"
}
```

#### **For BUSINESS (Multi-Venue)**
```json
{
  "entity_type": "venue",
  "managed_venues": ["MSG", "Barclays Center", "Radio City"],
  "venue_count": 3
}
```

#### **For BUSINESS (Promoter)**
```json
{
  "entity_type": "promoter",
  "company_name": "Live Nation",
  "events_managed": 150
}
```

#### **For BUSINESS (Advertiser)**
```json
{
  "entity_type": "advertiser",
  "company_name": "Red Bull",
  "monthly_budget": 5000,
  "campaign_count": 3
}
```

---

## 💰 **MONETIZATION TIERS**

### **USER**
| Tier | Price | Features |
|------|-------|----------|
| Free | $0 | Basic stats, limited history |
| Premium | $4.99/mo | Advanced stats, export, ad-free |

**Revenue:** 500 premium users × $4.99 = $2,495/mo = **$30K/year**

---

### **CREATOR**
| Tier | Price | Who It's For | Features |
|------|-------|--------------|----------|
| Artist Basic | $29/mo | Solo artists | 1 artist, basic analytics |
| Artist Pro | $69/mo | Solo artists | 1 artist, advanced analytics, revenue insights |
| Label Standard | $149/mo | Small labels | Up to 5 artists, portfolio analytics |
| Label Pro | $299/mo | Mid labels | Up to 20 artists, market intelligence |
| Label Enterprise | $499/mo | Major labels | Unlimited artists, API access, white-label |

**Example business_info tier detection:**
```typescript
const tier = profile.subscription_tier; // 'professional', 'enterprise'
const artistCount = profile.business_info?.artist_count || 1;
const isLabel = profile.business_info?.entity_type === 'label';
```

**Revenue:** 
- 150 artists × $50/mo avg = $7,500/mo
- 20 labels × $300/mo avg = $6,000/mo
- **Total: $162K/year**

---

### **BUSINESS**
| Tier | Price | Who It's For | Features |
|------|-------|--------------|----------|
| Venue | $49/mo | Single venue | 1 venue, basic analytics |
| Venue Pro | $99/mo | Single venue | 1 venue, advanced analytics |
| Multi-Venue | $199/mo | Venue managers | Up to 5 venues, portfolio view |
| Promoter | $149/mo | Event promoters | Campaign manager, targeting tools |
| Advertiser | $499+/mo | Ad agencies | Full ad platform, conversion tracking |

**Example business_info tier detection:**
```typescript
const entityType = profile.business_info?.entity_type; // 'venue', 'promoter', 'advertiser'
const venueCount = profile.business_info?.venue_count || 1;
const monthlyAdSpend = profile.business_info?.monthly_budget || 0;
```

**Revenue:**
- 80 venues × $75/mo avg = $6,000/mo
- 25 promoters × $149/mo = $3,725/mo
- 15 advertisers × $500/mo avg = $7,500/mo
- **Total: $207K/year**

---

## 🎯 **DASHBOARD ROUTING LOGIC**

```typescript
// src/utils/dashboardRouter.ts

export function getDashboardComponent(profile: Profile) {
  const { account_type, business_info, subscription_tier } = profile;
  
  switch (account_type) {
    case 'user':
      // All users get same dashboard (free or premium features based on tier)
      return subscription_tier === 'premium' 
        ? <UserPremiumDashboard />
        : <UserFreeDashboard />;
    
    case 'creator':
      // Check if artist or label
      if (business_info?.entity_type === 'label') {
        return <LabelDashboard 
          artistCount={business_info.artist_count}
          tier={subscription_tier}
        />;
      }
      return <ArtistDashboard tier={subscription_tier} />;
    
    case 'business':
      // Check business entity type
      const entityType = business_info?.entity_type;
      
      if (entityType === 'venue') {
        return <VenueDashboard 
          venueCount={business_info.venue_count || 1}
          tier={subscription_tier}
        />;
      }
      
      if (entityType === 'promoter') {
        return <PromoterDashboard tier={subscription_tier} />;
      }
      
      if (entityType === 'advertiser') {
        return <AdvertiserDashboard 
          monthlyBudget={business_info.monthly_budget}
          tier={subscription_tier}
        />;
      }
      
      // Default business dashboard
      return <BusinessDashboard />;
    
    case 'admin':
      return <AdminDashboard />;
    
    default:
      return <UserFreeDashboard />;
  }
}
```

---

## 🔐 **FEATURE GATING**

### **By Account Type:**
```typescript
// Check account type
if (profile.account_type === 'creator') {
  // Show creator-specific features
}
```

### **By Subscription Tier:**
```typescript
// Check tier within account type
if (profile.subscription_tier === 'enterprise') {
  // Show API access, white-label reports
}
```

### **By Entity Type (business_info):**
```typescript
// Check sub-type
if (profile.business_info?.entity_type === 'advertiser') {
  // Show ad campaign manager
}
```

---

## 📊 **ANALYTICS ACCESS MATRIX**

| Metric | User | Creator | Business | Admin |
|--------|------|---------|----------|-------|
| Personal stats | ✅ | ✅ | ✅ | ✅ |
| Event analytics | ❌ | ✅ (own events) | ✅ (own events) | ✅ (all) |
| Artist analytics | ❌ | ✅ (own/roster) | ❌ | ✅ (all) |
| Venue analytics | ❌ | ❌ | ✅ (own venues) | ✅ (all) |
| Campaign analytics | ❌ | ❌ | ✅ (own campaigns) | ✅ (all) |
| Fan/visitor demographics | ❌ | ✅ | ✅ | ✅ |
| Revenue insights | ❌ | ✅ (Pro+) | ✅ | ✅ |
| Platform metrics | ❌ | ❌ | ❌ | ✅ |
| Export data | Premium | ✅ | ✅ | ✅ |
| API access | ❌ | Enterprise | Enterprise | ✅ |

---

## 🚀 **UPGRADE PATHS**

### **User → Creator**
1. User clicks "Upgrade to Artist Account"
2. Fills out business info (artist name, genres, Spotify link)
3. Submits verification request
4. Admin approves → account_type = 'creator'

### **User → Business**
1. User clicks "Create Business Account"
2. Fills out business info (entity_type: venue/promoter/advertiser)
3. Provides business verification (tax ID, company name)
4. Admin approves → account_type = 'business'

### **Creator Tier Upgrades**
- Basic → Pro: Self-serve (click upgrade, pay)
- Pro → Enterprise: Contact sales

### **Business Tier Upgrades**
- Venue → Multi-Venue: Self-serve
- Promoter → Enterprise: Contact sales

---

## ✅ **BENEFITS OF 4-TYPE SYSTEM**

✅ **Simple to understand** - Clear user journey  
✅ **Flexible scaling** - Use business_info for sub-types  
✅ **Same revenue** - All monetization preserved ($400K+/year)  
✅ **Easy maintenance** - 4 permission sets vs 9  
✅ **Clear upgrades** - user → creator OR business  
✅ **Better UX** - Less confusing for users  

---

## 📝 **DATABASE STRUCTURE**

```sql
-- profiles table
CREATE TABLE profiles (
  ...
  account_type account_type DEFAULT 'user',  -- user, creator, business, admin
  subscription_tier subscription_tier DEFAULT 'free',
  business_info JSONB DEFAULT '{}',
  ...
);

-- Example business_info for different sub-types:
-- Artist: {"entity_type": "artist", "artist_name": "..."}
-- Label: {"entity_type": "label", "managed_artists": [...], "artist_count": 5}
-- Venue: {"entity_type": "venue", "venue_name": "...", "capacity": 20000}
-- Promoter: {"entity_type": "promoter", "company_name": "..."}
-- Advertiser: {"entity_type": "advertiser", "monthly_budget": 5000}
```

---

## 🎉 **TOTAL REVENUE POTENTIAL**

| Account Type | Annual Revenue |
|-------------|----------------|
| User Premium | $30,000 |
| Creator (Artists) | $108,000 |
| Creator (Labels) | $54,000 |
| Business (Venues) | $90,000 |
| Business (Promoters) | $45,000 |
| Business (Advertisers) | $72,000 |
| **TOTAL** | **$399,000/year** |

**Same ballpark, simpler system!** 🚀

---

**End of Simplified Account Types Guide**

