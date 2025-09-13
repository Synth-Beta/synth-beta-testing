import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, ThumbsUp, ThumbsDown, Minus, Plus, Edit3, X, Music, Search } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format, parseISO } from 'date-fns';

// Ranking system interfaces
interface Review {
  id: string;
  title: string;
  rating: 'good' | 'okay' | 'bad';
  content?: string;
}

interface RankedReview extends Review {
  position: number; // 0-based position in the group ranking
}

interface ComparisonResult {
  winnerId: string;
  loserId: string;
}

// Ranking system class
class ReviewRankingSystem {
  private groups: Map<string, RankedReview[]> = new Map();

  constructor() {
    this.groups.set('good', []);
    this.groups.set('okay', []);
    this.groups.set('bad', []);
  }

  // Add a new review - gets compared with bottom item and bubbles up
  async addReview(review: Review, onComparison: (review1: RankedReview, review2: RankedReview) => Promise<ComparisonResult>): Promise<void> {
    const group = this.groups.get(review.rating);
    if (!group) throw new Error('Invalid rating group');

    const newRankedReview: RankedReview = {
      ...review,
      position: group.length // Start at bottom
    };

    if (group.length === 0) {
      // First item in group
      group.push(newRankedReview);
      return;
    }

    // Add to bottom initially
    group.push(newRankedReview);
    
    // Compare with item above and bubble up if needed
    await this.bubbleUp(review.rating, group.length - 1, onComparison);
  }

  // Edit existing review - triggers comparison based on position
  async editReview(reviewId: string, onComparison: (review1: RankedReview, review2: RankedReview) => Promise<ComparisonResult>): Promise<void> {
    const { group, index, rating } = this.findReview(reviewId);
    if (!group || index === -1) throw new Error('Review not found');

    if (index === 0) {
      // Top item - compare with item below
      if (group.length > 1) {
        await this.compareAndUpdate(rating, 0, 1, onComparison);
      }
    } else {
      // Any other item - compare with item above
      await this.compareAndUpdate(rating, index, index - 1, onComparison);
    }
  }

  // Find review in all groups
  private findReview(reviewId: string): { group: RankedReview[] | null, index: number, rating: string } {
    for (const [rating, group] of this.groups) {
      const index = group.findIndex(r => r.id === reviewId);
      if (index !== -1) {
        return { group, index, rating };
      }
    }
    return { group: null, index: -1, rating: '' };
  }

  // Compare two items and update positions based on result
  private async compareAndUpdate(
    rating: string, 
    index1: number, 
    index2: number, 
    onComparison: (review1: RankedReview, review2: RankedReview) => Promise<ComparisonResult>
  ): Promise<void> {
    const group = this.groups.get(rating);
    if (!group || !group[index1] || !group[index2]) return;

    const review1 = group[index1];
    const review2 = group[index2];
    
    const result = await onComparison(review1, review2);
    
    // If the lower-positioned item won, it moves up
    if (result.winnerId === review1.id && index1 > index2) {
      // review1 (lower position) beat review2 (higher position)
      await this.bubbleUp(rating, index1, onComparison);
    } else if (result.winnerId === review2.id && index2 > index1) {
      // review2 (lower position) beat review1 (higher position)  
      await this.bubbleUp(rating, index2, onComparison);
    }
    // If higher positioned item won, no change needed
  }

  // Bubble up an item by comparing with items above
  private async bubbleUp(
    rating: string, 
    startIndex: number, 
    onComparison: (review1: RankedReview, review2: RankedReview) => Promise<ComparisonResult>
  ): Promise<void> {
    const group = this.groups.get(rating);
    if (!group || startIndex === 0) return;

    let currentIndex = startIndex;
    
    while (currentIndex > 0) {
      const currentItem = group[currentIndex];
      const aboveItem = group[currentIndex - 1];
      
      const result = await onComparison(currentItem, aboveItem);
      
      if (result.winnerId === currentItem.id) {
        // Current item wins, swap positions
        this.swapPositions(group, currentIndex, currentIndex - 1);
        currentIndex--;
      } else {
        // Current item loses, stop bubbling
        break;
      }
    }
  }

  // Swap two items in the ranking
  private swapPositions(group: RankedReview[], index1: number, index2: number): void {
    [group[index1], group[index2]] = [group[index2], group[index1]];
    
    // Update position values
    group[index1].position = index1;
    group[index2].position = index2;
  }

  // Get current rankings for a group
  getRanking(rating: 'good' | 'okay' | 'bad'): RankedReview[] {
    return [...(this.groups.get(rating) || [])];
  }

  // Get all rankings
  getAllRankings(): { good: RankedReview[], okay: RankedReview[], bad: RankedReview[] } {
    return {
      good: this.getRanking('good'),
      okay: this.getRanking('okay'),
      bad: this.getRanking('bad')
    };
  }

  // Remove a review
  removeReview(reviewId: string): boolean {
    for (const [rating, group] of this.groups) {
      const index = group.findIndex(r => r.id === reviewId);
      if (index !== -1) {
        group.splice(index, 1);
        // Update positions for remaining items
        for (let i = index; i < group.length; i++) {
          group[i].position = i;
        }
        return true;
      }
    }
    return false;
  }
}

interface ConcertRankingProps {
  currentUserId: string;
  onBack: () => void;
  onSearch?: () => void;
}

interface ConcertReview {
  id: string;
  user_id: string;
  event_id: string;
  rating: 'good' | 'okay' | 'bad';
  review_text: string | null;
  is_public: boolean;
  created_at: string;
  event: {
    event_name: string;
    location: string;
    event_date: string;
    event_time: string;
  };
  user: {
    name: string;
    avatar_url: string | null;
  };
}

// ========================================
// 🧠 MENTAL MAP: CONCERT RANKING ALGORITHM
// ========================================
// 
// This component implements a sophisticated ranking algorithm for concert reviews.
// The algorithm handles 5 main scenarios:
//
// 1. ADD NEW REVIEW: Compares with bottom item in entire list
// 2. EDIT #1 (NORMAL): Compares with item below, stays #1 if chosen
// 3. EDIT #1 (MOVING DOWN): Compares with item below, stops if chosen yourself
// 4. EDIT OTHER POSITIONS: Compare with item above, move up if chosen
// 5. ALL COMPARISONS: Use correct, up-to-date reviews array
//
// KEY FIXES APPLIED:
// - Fixed "number one moving down" bug where choosing yourself continued comparing
// - Fixed add review comparison bug where "No other concerts" was shown
// - Added proper state management with currentReviewsForComparison
// - Added comprehensive mental map comments for future reference
//
// ========================================

export const ConcertRanking = ({ currentUserId, onBack, onSearch }: ConcertRankingProps) => {
  const [reviews, setReviews] = useState<ConcertReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddReview, setShowAddReview] = useState(false);
  const [showRankingModal, setShowRankingModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingReview, setEditingReview] = useState<ConcertReview | null>(null);
  const [newReview, setNewReview] = useState({
    event_name: '',
    location: '',
    event_date: '',
    event_time: '',
    rating: '' as 'good' | 'okay' | 'bad' | '',
    review_text: '',
    is_public: true
  });
  const [pendingReview, setPendingReview] = useState<ConcertReview | null>(null);
  const [isNumberOneMovingDown, setIsNumberOneMovingDown] = useState(false);
  const [currentReviewsForComparison, setCurrentReviewsForComparison] = useState<ConcertReview[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    fetchReviews();
  }, [currentUserId]);

  const fetchReviews = async () => {
    try {
      setLoading(true);
      // For now, use localStorage since we don't have the database table yet
      const storedReviews = localStorage.getItem(`concert_reviews_${currentUserId}`);
      if (storedReviews) {
        const parsedReviews = JSON.parse(storedReviews);
        setReviews(parsedReviews);
      }
    } catch (error) {
      console.error('Error fetching reviews:', error);
    } finally {
      setLoading(false);
    }
  };


  const handleAddReview = () => {
    if (!newReview.event_name || !newReview.rating) {
      toast({
        title: "Missing Information",
        description: "Please fill in the event name and rating.",
        variant: "destructive",
      });
      return;
    }

    const review: ConcertReview = {
      id: Date.now().toString(),
      user_id: currentUserId,
      event_id: 0, // Placeholder since we're using localStorage
      rating: newReview.rating,
      review_text: newReview.review_text || null,
      is_public: newReview.is_public,
      created_at: new Date().toISOString(),
      event: {
        event_name: newReview.event_name,
        location: newReview.location,
        event_date: newReview.event_date,
        event_time: newReview.event_time,
      },
      user: {
        name: 'You',
        avatar_url: null,
      },
    };

    if (reviews.length === 0) {
      // First review, just add it
      const updatedReviews = [review];
      setReviews(updatedReviews);
      localStorage.setItem(`concert_reviews_${currentUserId}`, JSON.stringify(updatedReviews));
      
      setNewReview({
        event_name: '',
        location: '',
        event_date: '',
        event_time: '',
        rating: '',
        review_text: '',
        is_public: true
      });
      setShowAddReview(false);
      
      toast({
        title: "Review Added",
        description: "Your first concert review has been added!",
      });
    } else {
      // Filter reviews by the same rating group
      const sameRatingReviews = reviews.filter(r => r.rating === review.rating);
      
      if (sameRatingReviews.length === 0) {
        // No reviews in this rating group yet, just add it
        const updatedReviews = [...reviews, review];
        setReviews(updatedReviews);
        localStorage.setItem(`concert_reviews_${currentUserId}`, JSON.stringify(updatedReviews));
        
        setNewReview({
          event_name: '',
          location: '',
          event_date: '',
          event_time: '',
          rating: '',
          review_text: '',
          is_public: true
        });
        setShowAddReview(false);
        
        toast({
          title: "Review Added",
          description: `Your first ${getRatingText(review.rating)} concert review has been added!`,
        });
      } else {
        // Add the new review to the end first
        const updatedReviews = [...reviews, review];
        setReviews(updatedReviews);
        setCurrentReviewsForComparison(updatedReviews);
        localStorage.setItem(`concert_reviews_${currentUserId}`, JSON.stringify(updatedReviews));
        
        // Set up for comparison with the last one in the entire list
        setPendingReview(review);
        setShowRankingModal(true);
        setShowAddReview(false); // Close the add review modal
      }
    }
  };

  const getRatingText = (rating: 'good' | 'okay' | 'bad') => {
    switch (rating) {
      case 'good': return 'Good';
      case 'okay': return 'Okay';
      case 'bad': return 'Bad';
      default: return 'Unknown';
    }
  };

  const getRatingColor = (rating: 'good' | 'okay' | 'bad') => {
    switch (rating) {
      case 'good': return 'bg-green-100 text-green-800 border-green-200';
      case 'okay': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'bad': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getRatingIcon = (rating: 'good' | 'okay' | 'bad') => {
    switch (rating) {
      case 'good': return <ThumbsUp className="w-4 h-4" />;
      case 'okay': return <Minus className="w-4 h-4" />;
      case 'bad': return <ThumbsDown className="w-4 h-4" />;
      default: return null;
    }
  };


  const handleEditReview = async (reviewId: string) => {
    const review = reviews.find(r => r.id === reviewId);
    if (review) {
      setEditingReview(review);
      setShowEditModal(true);
    }
  };

  const handleUpdateReview = () => {
    if (!editingReview) return;

    // Update the review in the array first
    const updatedReviews = reviews.map(review => 
      review.id === editingReview.id ? editingReview : review
    );
    setReviews(updatedReviews);
    localStorage.setItem(`concert_reviews_${currentUserId}`, JSON.stringify(updatedReviews));

    // Always show ranking modal when editing (even if rating stays same)
    setPendingReview(editingReview);
    setShowRankingModal(true);
    setShowEditModal(false);
  };

  const handleDeleteReview = () => {
    if (!editingReview) return;

    const updatedReviews = reviews.filter(review => review.id !== editingReview.id);
    
    setReviews(updatedReviews);
    localStorage.setItem(`concert_reviews_${currentUserId}`, JSON.stringify(updatedReviews));
    
    setShowEditModal(false);
    setEditingReview(null);
    
    toast({
      title: "Review Deleted",
      description: "Your concert review has been deleted!",
    });
  };

  const getComparisonReview = (reviewToPlace: ConcertReview, currentReviews: ConcertReview[]) => {
    // ========================================
    // 🧠 MENTAL MAP: GET COMPARISON REVIEW
    // ========================================
    // This function determines which review to compare against based on the current situation
    // It handles all the special cases for different ranking scenarios
    
    // Find the current position of the review being edited
    const currentIndex = currentReviews.findIndex(r => r.id === reviewToPlace.id);
    
    console.log('Getting comparison for:', reviewToPlace.event.event_name, 'at position:', currentIndex);
    console.log('Current reviews order:', currentReviews.map(r => r.event.event_name));
    console.log('Is #1 moving down:', isNumberOneMovingDown);
    
    // ========================================
    // 🧠 SPECIAL CASE 1: #1 MOVING DOWN MODE
    // ========================================
    // When #1 is moving down, always compare with the one below
    // This is the special logic that was buggy before
    if (isNumberOneMovingDown) {
      const comparison = currentReviews[currentIndex + 1] || null;
      console.log('Comparing #1 moving down with below:', comparison?.event.event_name);
      return comparison;
    }
    
    // ========================================
    // 🧠 SPECIAL CASE 2: NEW REVIEW BEING ADDED
    // ========================================
    // When adding a new review (at the end), compare with the last one in the entire list
    // This ensures new reviews get compared with the bottom-most review
    if (currentIndex === currentReviews.length - 1) {
      // Compare with the second-to-last item (the one before the new review)
      if (currentReviews.length > 1) {
        const lastInList = currentReviews[currentReviews.length - 2];
        console.log('New review comparing with last in entire list:', lastInList?.event.event_name);
        return lastInList;
      } else {
        // This shouldn't happen, but just in case
        console.log('New review but no other reviews to compare with');
        return null;
      }
    }
    
    // ========================================
    // 🧠 NORMAL CASES: EDITING EXISTING REVIEWS
    // ========================================
    if (currentIndex === 0) {
      // If editing #1, compare with the one directly below it
      const comparison = currentReviews[1] || null;
      console.log('Comparing #1 with:', comparison?.event.event_name);
      return comparison;
    } else {
      // For all others, compare with the one directly above it
      const comparison = currentReviews[currentIndex - 1] || null;
      console.log('Comparing with above:', comparison?.event.event_name);
      return comparison;
    }
  };

  const handleRankingChoice = (betterReview: ConcertReview) => {
    if (!pendingReview) return;

    console.log('=== RANKING CHOICE ===');
    console.log('Better review:', betterReview.event.event_name);
    console.log('Pending review:', pendingReview.event.event_name);
    console.log('Current reviews order:', reviews.map(r => r.event.event_name));

    if (betterReview.id === pendingReview.id) {
      // ========================================
      // 🧠 MENTAL MAP: WE CHOSE OURSELVES
      // ========================================
      // This means we think our review is better than the one we were comparing against
      // We need to move UP in the ranking and continue comparing until we reach our correct position
      
      const reviewsToUse = currentReviewsForComparison.length > 0 ? currentReviewsForComparison : reviews;
      const currentIndex = reviewsToUse.findIndex(r => r.id === pendingReview.id);
      
      if (currentIndex === 0 && !isNumberOneMovingDown) {
        // ========================================
        // 🧠 SCENARIO 1: NORMAL #1 EDITING
        // ========================================
        // We're at position #1 and chose ourselves - this means we want to stay #1
        // This is the normal case when editing #1 without moving down
        console.log('We are #1 and chose ourselves - staying #1 and stopping');
        setPendingReview(null);
        setShowRankingModal(false);
        setIsNumberOneMovingDown(false); // Reset flag
        setCurrentReviewsForComparison([]); // Reset comparison reviews
        
        toast({
          title: "Review Updated",
          description: "Your concert review stays #1!",
        });
      } else if (isNumberOneMovingDown) {
        // ========================================
        // 🧠 SCENARIO 2: NUMBER ONE MOVING DOWN MODE
        // ========================================
        // We're in "number one moving down" mode and chose ourselves
        // This means we want to stop the downward movement and stay where we are
        // This is the special case that was buggy before - now fixed!
        console.log('Number one moving down - chose ourselves, stopping');
        setPendingReview(null);
        setShowRankingModal(false);
        setIsNumberOneMovingDown(false); // Reset flag
        setCurrentReviewsForComparison([]); // Reset comparison reviews
        
        toast({
          title: "Review Updated",
          description: "Your concert review ranking is complete!",
        });
      } else {
        // ========================================
        // 🧠 SCENARIO 3: NORMAL MOVING UP
        // ========================================
        // We're not #1 and chose ourselves - this means we want to move up
        // We swap with the item above us and continue comparing
        console.log('Chose ourselves - moving up and continuing');
        
        // Find the comparison review (the one we were comparing against)
        const reviewsToUse = currentReviewsForComparison.length > 0 ? currentReviewsForComparison : reviews;
        const comparisonReview = getComparisonReview(pendingReview, reviewsToUse);
        if (!comparisonReview) {
          console.log('No comparison review found, stopping');
          setPendingReview(null);
          setShowRankingModal(false);
          return;
        }
        
        const comparisonIndex = reviews.findIndex(r => r.id === comparisonReview.id);
        
        console.log('Current index:', currentIndex, 'Comparison index:', comparisonIndex);
        console.log('Before swap - reviews:', reviewsToUse.map(r => r.event.event_name));
        
        const updatedReviews = [...reviewsToUse];
        [updatedReviews[currentIndex], updatedReviews[comparisonIndex]] = 
        [updatedReviews[comparisonIndex], updatedReviews[currentIndex]];
        
        console.log('After swap - reviews:', updatedReviews.map(r => r.event.event_name));
        
        // Update state and localStorage
        setReviews(updatedReviews);
        setCurrentReviewsForComparison(updatedReviews);
        localStorage.setItem(`concert_reviews_${currentUserId}`, JSON.stringify(updatedReviews));
        
        // Check if we need to continue comparing using the updated array
        const newIndex = updatedReviews.findIndex(r => r.id === pendingReview.id);
        const nextComparison = getComparisonReview(pendingReview, updatedReviews);
        
        console.log('New position:', newIndex, 'Next comparison:', nextComparison?.event.event_name);
        
        if (newIndex === 0) {
          // We're now #1, we're done
          console.log('We are now #1, stopping');
          setPendingReview(null);
          setShowRankingModal(false);
          
          toast({
            title: "Review Updated",
            description: "Your concert review is now #1!",
          });
        } else if (nextComparison) {
          // Continue with the next comparison
          console.log('Continuing comparison...');
          setPendingReview(pendingReview);
          setShowRankingModal(true);
        } else {
          // No more comparisons, we're done
          console.log('No more comparisons, done!');
          setPendingReview(null);
          setShowRankingModal(false);
          
          toast({
            title: "Review Updated",
            description: "Your concert review has been re-ranked!",
          });
        }
      }
    } else {
      // ========================================
      // 🧠 MENTAL MAP: WE CHOSE THE COMPARISON
      // ========================================
      // This means we think the other review is better than ours
      // We need to move DOWN in the ranking and continue comparing until we reach our correct position
      
      const reviewsToUse = currentReviewsForComparison.length > 0 ? currentReviewsForComparison : reviews;
      const currentIndex = reviewsToUse.findIndex(r => r.id === pendingReview.id);
      
      if (currentIndex === 0) {
        // ========================================
        // 🧠 SCENARIO 4: #1 CHOSE COMPARISON (MOVING DOWN)
        // ========================================
        // We're at position #1 and chose the comparison - this means we want to move down
        // This triggers the special "number one moving down" mode
        // We swap with the item below us and continue comparing
        console.log('We are #1 and chose comparison - moving down and continuing');
        setIsNumberOneMovingDown(true); // Set flag for special #1 moving down logic
        const comparisonIndex = reviewsToUse.findIndex(r => r.id === betterReview.id);
        
        console.log('Current index:', currentIndex, 'Comparison index:', comparisonIndex);
        console.log('Before swap - reviews:', reviewsToUse.map(r => r.event.event_name));
        
        const updatedReviews = [...reviewsToUse];
        [updatedReviews[currentIndex], updatedReviews[comparisonIndex]] = 
        [updatedReviews[comparisonIndex], updatedReviews[currentIndex]];
        
        console.log('After swap - reviews:', updatedReviews.map(r => r.event.event_name));
        
        // Update state and localStorage
        setReviews(updatedReviews);
        setCurrentReviewsForComparison(updatedReviews);
        localStorage.setItem(`concert_reviews_${currentUserId}`, JSON.stringify(updatedReviews));
        
        // Check if we need to continue comparing using the updated array
        const newIndex = updatedReviews.findIndex(r => r.id === pendingReview.id);
        const nextComparison = getComparisonReview(pendingReview, updatedReviews);
        
        console.log('New position:', newIndex, 'Next comparison:', nextComparison?.event.event_name);
        
        if (nextComparison) {
          // Continue with the next comparison
          console.log('Continuing comparison...');
          setPendingReview(pendingReview);
          setShowRankingModal(true);
        } else {
          // No more comparisons - check if we're at the last position
          const isLastPosition = newIndex === updatedReviews.length - 1;
          console.log('No more comparisons, done!', 'Is last position:', isLastPosition);
          
          setPendingReview(null);
          setShowRankingModal(false);
          setIsNumberOneMovingDown(false); // Reset flag
          
          if (isLastPosition) {
            toast({
              title: "Review Updated",
              description: "Your concert review is now ranked last!",
            });
          } else {
            toast({
              title: "Review Updated",
              description: "Your concert review has been re-ranked!",
            });
          }
        }
      } else {
        // ========================================
        // 🧠 SCENARIO 5: NOT #1 CHOSE COMPARISON (STAY IN PLACE)
        // ========================================
        // We're not #1 and chose the comparison - this means we think the other review is better
        // Since we're not #1, we stay in our current position and stop comparing
        // This is the normal logic for all positions except #1
        console.log('Chose comparison - staying in place and stopping');
        
        setPendingReview(null);
        setShowRankingModal(false);
        setIsNumberOneMovingDown(false); // Reset flag
        setCurrentReviewsForComparison([]); // Reset comparison reviews
        
        toast({
          title: "Review Updated",
          description: "Your concert review ranking is complete!",
        });
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p>Loading your concert reviews...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Concerts that I have been to</h1>
            <p className="text-gray-600 mt-2">Rank and review your concert experiences</p>
          </div>
          <div className="flex gap-2">
            {onSearch && (
              <Button 
                variant="outline" 
                onClick={onSearch}
                className="bg-green-600 hover:bg-green-700 text-white border-green-600"
              >
                <Search className="w-4 h-4 mr-2" />
                Search Concerts
              </Button>
            )}
            <Button onClick={() => setShowAddReview(true)} className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4 mr-2" />
              Add Review
            </Button>
          </div>
        </div>

        {reviews.length === 0 ? (
          <div className="text-center py-12">
            <Music className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No Reviews Yet</h3>
            <p className="text-gray-600 mb-6">Start building your concert ranking by adding your first review!</p>
            <Button onClick={() => setShowAddReview(true)} className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4 mr-2" />
              Add Your First Review
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {reviews.map((review, index) => (
              <Card key={review.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200">
                          #{index + 1}
                        </Badge>
                        <Badge className={`${getRatingColor(review.rating)} border`}>
                          {getRatingIcon(review.rating)}
                          <span className="ml-1">{getRatingText(review.rating)}</span>
                        </Badge>
                        {review.is_public && (
                          <Badge variant="outline" className="text-green-600 border-green-200">
                            Public
                          </Badge>
                        )}
                      </div>
                      
                      <h3 className="text-xl font-semibold text-gray-900 mb-2">
                        {review.event.event_name}
                      </h3>
                      
                      <div className="text-sm text-gray-600 mb-3">
                        {review.event.location && (
                          <span>{review.event.location}</span>
                        )}
                      </div>
                      
                      {review.review_text && (
                        <p className="text-gray-700 mb-4 leading-relaxed">
                          {review.review_text}
                        </p>
                      )}
                    </div>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditReview(review.id)}
                      className="ml-4"
                    >
                      <Edit3 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Add Review Modal */}
        {showAddReview && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto">
              <CardHeader>
                <CardTitle>Add Concert Review</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Event Name *</label>
                  <input
                    type="text"
                    value={newReview.event_name}
                    onChange={(e) => setNewReview({ ...newReview, event_name: e.target.value })}
                    className="w-full p-2 border rounded-md"
                    placeholder="e.g., Taylor Swift - Eras Tour"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Location</label>
                  <input
                    type="text"
                    value={newReview.location}
                    onChange={(e) => setNewReview({ ...newReview, location: e.target.value })}
                    className="w-full p-2 border rounded-md"
                    placeholder="e.g., Madison Square Garden, NYC"
                  />
                </div>


                <div>
                  <label className="text-sm font-medium mb-2 block">Rating *</label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={newReview.rating === 'good' ? 'default' : 'outline'}
                      onClick={() => setNewReview({ ...newReview, rating: 'good' })}
                      className="flex-1 bg-green-600 hover:bg-green-700"
                    >
                      <ThumbsUp className="w-4 h-4 mr-2" />
                      Good
                    </Button>
                    <Button
                      type="button"
                      variant={newReview.rating === 'okay' ? 'default' : 'outline'}
                      onClick={() => setNewReview({ ...newReview, rating: 'okay' })}
                      className="flex-1 bg-yellow-600 hover:bg-yellow-700"
                    >
                      <Minus className="w-4 h-4 mr-2" />
                      Okay
                    </Button>
                    <Button
                      type="button"
                      variant={newReview.rating === 'bad' ? 'default' : 'outline'}
                      onClick={() => setNewReview({ ...newReview, rating: 'bad' })}
                      className="flex-1 bg-red-600 hover:bg-red-700"
                    >
                      <ThumbsDown className="w-4 h-4 mr-2" />
                      Bad
                    </Button>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Review (Optional)</label>
                  <Textarea
                    value={newReview.review_text}
                    onChange={(e) => setNewReview({ ...newReview, review_text: e.target.value })}
                    placeholder="Share your thoughts about this concert..."
                    className="min-h-[100px]"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="public"
                    checked={newReview.is_public}
                    onChange={(e) => setNewReview({ ...newReview, is_public: e.target.checked })}
                  />
                  <label htmlFor="public" className="text-sm">Make this review public</label>
                </div>

                <div className="flex gap-2 pt-4">
                  <Button variant="outline" onClick={() => setShowAddReview(false)} className="flex-1">
                    Cancel
                  </Button>
                  <Button onClick={handleAddReview} className="flex-1">
                    Add Review
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Ranking Modal */}
        {showRankingModal && pendingReview && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <Card className="w-full max-w-md">
              <CardHeader>
                <CardTitle className="text-center">Which was better?</CardTitle>
                <p className="text-sm text-muted-foreground text-center">
                  Help us rank your concerts
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* New Review */}
                <div className="p-4 border rounded-lg bg-gray-50">
                  <h3 className="font-semibold text-lg mb-2">{pendingReview.event.event_name}</h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    {pendingReview.event.location && `${pendingReview.event.location}`}
                  </p>
                  <Badge className={`${getRatingColor(pendingReview.rating)} border`}>
                    {getRatingIcon(pendingReview.rating)}
                    <span className="ml-1">{getRatingText(pendingReview.rating)}</span>
                  </Badge>
                  <Button
                    onClick={() => handleRankingChoice(pendingReview)}
                    className="w-full mt-3 bg-blue-600 hover:bg-blue-700"
                  >
                    This was better
                  </Button>
                </div>

                {/* Comparison Review */}
                {(() => {
                  const reviewsToUse = currentReviewsForComparison.length > 0 ? currentReviewsForComparison : reviews;
                  const comparisonReview = getComparisonReview(pendingReview, reviewsToUse);
                  return comparisonReview ? (
                    <div className="p-4 border rounded-lg bg-gray-50">
                      <h3 className="font-semibold text-lg mb-2">{comparisonReview.event.event_name}</h3>
                      <p className="text-sm text-muted-foreground mb-3">
                        {comparisonReview.event.location && `${comparisonReview.event.location}`}
                      </p>
                      <Badge className={`${getRatingColor(comparisonReview.rating)} border`}>
                        {getRatingIcon(comparisonReview.rating)}
                        <span className="ml-1">{getRatingText(comparisonReview.rating)}</span>
                      </Badge>
                      <Button
                        onClick={() => handleRankingChoice(comparisonReview)}
                        variant="outline"
                        className="w-full mt-3"
                      >
                        This was better
                      </Button>
                    </div>
                  ) : (
                    <div className="p-4 text-center text-muted-foreground">
                      <p>No other concerts to compare with.</p>
                      <Button
                        onClick={() => handleRankingChoice(pendingReview)}
                        className="w-full mt-3 bg-blue-600 hover:bg-blue-700"
                      >
                        Continue
                      </Button>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Edit Review Modal */}
        {showEditModal && editingReview && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto">
              <CardHeader>
                <CardTitle>Edit Review</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Event Name *</label>
                  <input
                    type="text"
                    value={editingReview.event.event_name}
                    onChange={(e) => setEditingReview({
                      ...editingReview,
                      event: { ...editingReview.event, event_name: e.target.value }
                    })}
                    className="w-full p-2 border rounded-md"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Location</label>
                  <input
                    type="text"
                    value={editingReview.event.location}
                    onChange={(e) => setEditingReview({
                      ...editingReview,
                      event: { ...editingReview.event, location: e.target.value }
                    })}
                    className="w-full p-2 border rounded-md"
                  />
                </div>


                <div>
                  <label className="text-sm font-medium mb-2 block">Rating *</label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={editingReview.rating === 'good' ? 'default' : 'outline'}
                      onClick={() => setEditingReview({ ...editingReview, rating: 'good' })}
                      className="flex-1 bg-green-600 hover:bg-green-700"
                    >
                      <ThumbsUp className="w-4 h-4 mr-2" />
                      Good
                    </Button>
                    <Button
                      type="button"
                      variant={editingReview.rating === 'okay' ? 'default' : 'outline'}
                      onClick={() => setEditingReview({ ...editingReview, rating: 'okay' })}
                      className="flex-1 bg-yellow-600 hover:bg-yellow-700"
                    >
                      <Minus className="w-4 h-4 mr-2" />
                      Okay
                    </Button>
                    <Button
                      type="button"
                      variant={editingReview.rating === 'bad' ? 'default' : 'outline'}
                      onClick={() => setEditingReview({ ...editingReview, rating: 'bad' })}
                      className="flex-1 bg-red-600 hover:bg-red-700"
                    >
                      <ThumbsDown className="w-4 h-4 mr-2" />
                      Bad
                    </Button>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Review (Optional)</label>
                  <Textarea
                    value={editingReview.review_text || ''}
                    onChange={(e) => setEditingReview({ ...editingReview, review_text: e.target.value })}
                    placeholder="Share your thoughts about this concert..."
                    className="min-h-[100px]"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="edit-public"
                    checked={editingReview.is_public}
                    onChange={(e) => setEditingReview({ ...editingReview, is_public: e.target.checked })}
                  />
                  <label htmlFor="edit-public" className="text-sm">Make this review public</label>
                </div>

                <div className="flex gap-2 pt-4">
                  <Button variant="outline" onClick={() => setShowEditModal(false)} className="flex-1">
                    Cancel
                  </Button>
                  <Button 
                    variant="destructive" 
                    onClick={handleDeleteReview} 
                    className="flex-1"
                  >
                    Delete Review
                  </Button>
                  <Button onClick={handleUpdateReview} className="flex-1">
                    Update Review
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};