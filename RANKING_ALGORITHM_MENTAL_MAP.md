# 🧠 Concert Ranking Algorithm - Mental Map

## Overview
This document serves as a comprehensive mental map for the concert ranking algorithm. It explains the logic, scenarios, and fixes applied to ensure the ranking system works correctly.

## 🎯 Core Algorithm Logic

### 5 Main Scenarios

#### 1. **ADD NEW REVIEW**
- **Trigger**: User adds a new concert review
- **Comparison**: Compares with the **bottom item in the entire list**
- **Logic**: New review starts at the end, then bubbles up through comparisons
- **State**: Uses `currentReviewsForComparison` to ensure correct array

#### 2. **EDIT #1 (NORMAL)**
- **Trigger**: User edits the #1 review without moving down
- **Comparison**: Compares with the **item directly below**
- **Logic**: If chosen yourself → stay #1 and stop, if chosen other → move down
- **State**: Normal editing flow

#### 3. **EDIT #1 (MOVING DOWN)**
- **Trigger**: User edits #1 review and chooses the comparison (moves down)
- **Comparison**: Compares with the **item directly below**
- **Logic**: 
  - If chosen yourself → **STOP comparing** (this was the bug!)
  - If chosen other → continue comparing with next item below
- **State**: Uses `isNumberOneMovingDown` flag for special logic

#### 4. **EDIT OTHER POSITIONS**
- **Trigger**: User edits any review that's not #1
- **Comparison**: Compares with the **item directly above**
- **Logic**: If chosen yourself → move up and continue, if chosen other → stay and stop
- **State**: Normal editing flow

#### 5. **ALL COMPARISONS**
- **State Management**: Uses `currentReviewsForComparison` for correct array
- **Consistency**: Ensures all comparisons use up-to-date data
- **Cleanup**: Resets comparison state when done

## 🔧 Key Fixes Applied

### Fix 1: Number One Moving Down Bug
**Problem**: When #1 moved down and chose itself, it continued comparing instead of stopping.
**Solution**: Added special case `else if (isNumberOneMovingDown)` to stop comparing.

### Fix 2: Add Review Comparison Bug
**Problem**: When adding new review, showed "No other concerts to compare with".
**Solution**: Added `currentReviewsForComparison` state to track correct array.

### Fix 3: State Management
**Problem**: Comparisons used stale data from old `reviews` state.
**Solution**: Always use `currentReviewsForComparison` when available.

## 🧠 Mental Map Structure

```
handleRankingChoice()
├── We chose ourselves
│   ├── Normal #1 editing → Stay #1 and stop
│   ├── Number one moving down → Stop comparing
│   └── Other positions → Move up and continue
└── We chose comparison
    ├── #1 chose comparison → Move down and continue
    └── Other positions → Stay in place and stop

getComparisonReview()
├── #1 moving down mode → Compare with below
├── New review added → Compare with last in entire list
├── Editing #1 → Compare with below
└── Other positions → Compare with above
```

## 🚨 Critical Points to Remember

1. **Never break the `isNumberOneMovingDown` logic** - it's the most complex part
2. **Always use `currentReviewsForComparison`** for accurate data
3. **Reset all flags** when ranking is complete
4. **New reviews compare with bottom** of entire list, not same rating group
5. **#1 moving down is special** - it has its own comparison logic

## 🔄 State Flow

```
Add Review → Update Array → Set Comparison State → Show Modal → Handle Choice → Update Array → Continue/Stop
Edit Review → Update Array → Set Comparison State → Show Modal → Handle Choice → Update Array → Continue/Stop
```

## 📝 Code Comments

The code now includes comprehensive mental map comments with 🧠 emojis to make it easy to understand and maintain. Each scenario is clearly marked and explained.

## 🎉 Success Criteria

- ✅ Add new review compares with bottom item
- ✅ Edit #1 (normal) stays #1 if chosen
- ✅ Edit #1 (moving down) stops if chosen yourself
- ✅ Edit other positions move up if chosen
- ✅ All comparisons use correct data
- ✅ State is properly managed and cleaned up

---

**Remember**: This algorithm is complex but working correctly. Any future changes should be made carefully and tested thoroughly!
