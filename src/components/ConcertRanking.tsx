import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, ThumbsUp, ThumbsDown, Minus, Plus, Edit3, X, Music } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format, parseISO } from 'date-fns';

interface ConcertRankingProps {
  currentUserId: string;
  onBack: () => void;
}

interface ConcertReview {
  id: string;
  user_id: string;
  event_id: number;
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

export const ConcertRanking = ({ currentUserId, onBack }: ConcertRankingProps) => {
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
  const { toast } = useToast();

  useEffect(() => {
    fetchReviews();
  }, [currentUserId]);

  const fetchReviews = async () => {
    try {
      // For now, we'll use local storage since we don't have the database table yet
      const storedReviews = localStorage.getItem(`concert_reviews_${currentUserId}`);
      if (storedReviews) {
        setReviews(JSON.parse(storedReviews));
      } else {
        setReviews([]);
      }
    } catch (error) {
      console.error('Error fetching reviews:', error);
      toast({
        title: "Error",
        description: "Failed to load concert reviews",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getRatingColor = (rating: 'good' | 'okay' | 'bad') => {
    switch (rating) {
      case 'good': return "bg-green-100 text-green-800 border-green-200";
      case 'okay': return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case 'bad': return "bg-red-100 text-red-800 border-red-200";
      default: return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const getRatingText = (rating: 'good' | 'okay' | 'bad') => {
    switch (rating) {
      case 'good': return "It was good";
      case 'okay': return "It was okay";
      case 'bad': return "It was bad";
      default: return "";
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

  const handleAddReview = async () => {
    if (!newReview.event_name || !newReview.rating) {
      toast({
        title: "Missing Information",
        description: "Please fill in event name and rating",
        variant: "destructive",
      });
      return;
    }

    try {
      const review: ConcertReview = {
        id: Date.now().toString(),
        user_id: currentUserId,
        event_id: 0, // Will be set when we have actual events
        rating: newReview.rating,
        review_text: newReview.review_text || null,
        is_public: newReview.is_public,
        created_at: new Date().toISOString(),
        event: {
          event_name: newReview.event_name,
          location: newReview.location,
          event_date: newReview.event_date,
          event_time: newReview.event_time
        },
        user: {
          name: "You", // Will be replaced with actual user data
          avatar_url: null
        }
      };

      // If this is the first review, add it directly
      if (reviews.length === 0) {
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
          description: "Your first concert review has been saved!",
        });
      } else {
        // If there are existing reviews, show ranking modal
        setPendingReview(review);
        setShowRankingModal(true);
        setShowAddReview(false);
      }
    } catch (error) {
      console.error('Error adding review:', error);
      toast({
        title: "Error",
        description: "Failed to add review",
        variant: "destructive",
      });
    }
  };

  const getReviewsByRating = (rating: 'good' | 'okay' | 'bad') => {
    return reviews.filter(review => review.rating === rating);
  };

  const findOptimalPosition = (reviewToPlace: ConcertReview, sameRatingReviews: ConcertReview[]) => {
    if (sameRatingReviews.length === 0) {
      // If no other reviews with same rating, find position based on rating hierarchy
      const ratingOrder = { 'good': 0, 'okay': 1, 'bad': 2 };
      const targetRatingOrder = ratingOrder[reviewToPlace.rating];
      
      let insertIndex = 0;
      for (let i = 0; i < reviews.length; i++) {
        if (ratingOrder[reviews[i].rating] > targetRatingOrder) {
          insertIndex = i;
          break;
        }
        insertIndex = i + 1;
      }
      return insertIndex;
    }

    // For same rating group, we'll let the user decide through comparisons
    return sameRatingReviews[0] ? reviews.findIndex(r => r.id === sameRatingReviews[0].id) : 0;
  };

  const handleRankingChoice = (betterReview: ConcertReview) => {
    if (!pendingReview) return;

    let updatedReviews: ConcertReview[];
    
    if (betterReview.id === pendingReview.id) {
      // The review being placed is better
      const sameRatingReviews = getReviewsByRating(pendingReview.rating);
      const optimalPosition = findOptimalPosition(pendingReview, sameRatingReviews);
      
      // Remove the review from its current position if it exists
      const filteredReviews = reviews.filter(r => r.id !== pendingReview.id);
      
      // Insert at optimal position
      updatedReviews = [
        ...filteredReviews.slice(0, optimalPosition),
        pendingReview,
        ...filteredReviews.slice(optimalPosition)
      ];
    } else {
      // The existing review is better
      const betterIndex = reviews.findIndex(r => r.id === betterReview.id);
      
      // Remove the review from its current position if it exists
      const filteredReviews = reviews.filter(r => r.id !== pendingReview.id);
      
      // Place after the better review
      updatedReviews = [
        ...filteredReviews.slice(0, betterIndex + 1),
        pendingReview,
        ...filteredReviews.slice(betterIndex + 1)
      ];
    }

    setReviews(updatedReviews);
    localStorage.setItem(`concert_reviews_${currentUserId}`, JSON.stringify(updatedReviews));
    
    setPendingReview(null);
    setShowRankingModal(false);
    setNewReview({
      event_name: '',
      location: '',
      event_date: '',
      event_time: '',
      rating: '',
      review_text: '',
      is_public: true
    });
    
    toast({
      title: "Review Added",
      description: "Your concert review has been ranked and saved!",
    });
  };

  const handleEditReview = (reviewId: string) => {
    const review = reviews.find(r => r.id === reviewId);
    if (review) {
      setEditingReview(review);
      setShowEditModal(true);
    }
  };

  const handleUpdateReview = () => {
    if (!editingReview) return;

    // If rating changed, we need to re-rank
    const originalReview = reviews.find(r => r.id === editingReview.id);
    const ratingChanged = originalReview?.rating !== editingReview.rating;
    
    if (ratingChanged) {
      // Show ranking modal for re-ranking
      setPendingReview(editingReview);
      setShowRankingModal(true);
      setShowEditModal(false);
    } else {
      // Just update without re-ranking
      const updatedReviews = reviews.map(review => 
        review.id === editingReview.id ? editingReview : review
      );
      
      setReviews(updatedReviews);
      localStorage.setItem(`concert_reviews_${currentUserId}`, JSON.stringify(updatedReviews));
      
      setEditingReview(null);
      setShowEditModal(false);
      
      toast({
        title: "Review Updated",
        description: "Your concert review has been updated!",
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading concert reviews...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <div className="flex-1">
            <h1 className="text-2xl font-bold">Concert Rankings</h1>
            <p className="text-muted-foreground">Rate and review your concert experiences</p>
          </div>
          <Button onClick={() => setShowAddReview(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Review
          </Button>
        </div>

        {/* Add Review Modal */}
        {showAddReview && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Add Concert Review</CardTitle>
                <Button variant="ghost" size="icon" onClick={() => setShowAddReview(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Event Name *</label>
                  <input
                    type="text"
                    value={newReview.event_name}
                    onChange={(e) => setNewReview(prev => ({ ...prev, event_name: e.target.value }))}
                    className="w-full p-2 border rounded-md"
                    placeholder="e.g., Taylor Swift - Eras Tour"
                  />
                </div>
                
                <div>
                  <label className="text-sm font-medium mb-2 block">Venue</label>
                  <input
                    type="text"
                    value={newReview.location}
                    onChange={(e) => setNewReview(prev => ({ ...prev, location: e.target.value }))}
                    className="w-full p-2 border rounded-md"
                    placeholder="e.g., Madison Square Garden"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">How was it? *</label>
                  <div className="flex gap-2">
                    <Button
                      variant={newReview.rating === 'good' ? 'default' : 'outline'}
                      onClick={() => setNewReview(prev => ({ ...prev, rating: 'good' }))}
                      className={`flex-1 ${newReview.rating === 'good' ? 'bg-green-600 hover:bg-green-700' : ''}`}
                    >
                      <ThumbsUp className="w-4 h-4 mr-2" />
                      Good
                    </Button>
                    <Button
                      variant={newReview.rating === 'okay' ? 'default' : 'outline'}
                      onClick={() => setNewReview(prev => ({ ...prev, rating: 'okay' }))}
                      className={`flex-1 ${newReview.rating === 'okay' ? 'bg-yellow-600 hover:bg-yellow-700' : ''}`}
                    >
                      <Minus className="w-4 h-4 mr-2" />
                      Okay
                    </Button>
                    <Button
                      variant={newReview.rating === 'bad' ? 'default' : 'outline'}
                      onClick={() => setNewReview(prev => ({ ...prev, rating: 'bad' }))}
                      className={`flex-1 ${newReview.rating === 'bad' ? 'bg-red-600 hover:bg-red-700' : ''}`}
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
                    onChange={(e) => setNewReview(prev => ({ ...prev, review_text: e.target.value }))}
                    placeholder="Share your thoughts about the concert..."
                    className="min-h-[100px]"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="public"
                    checked={newReview.is_public}
                    onChange={(e) => setNewReview(prev => ({ ...prev, is_public: e.target.checked }))}
                    className="rounded"
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
                  Comparing {getRatingText(pendingReview.rating)} concerts
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* New Review */}
                <div className="p-4 border-2 border-blue-200 rounded-lg bg-blue-50">
                  <h3 className="font-semibold text-lg mb-2">{pendingReview.event.event_name}</h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    {pendingReview.event.location && `${pendingReview.event.location} • `}
                    {format(new Date(pendingReview.created_at), 'MMM d, yyyy')}
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

                {/* Existing Reviews - Only show same rating group */}
                {getReviewsByRating(pendingReview.rating).map((review) => (
                  <div key={review.id} className="p-4 border rounded-lg bg-gray-50">
                    <h3 className="font-semibold text-lg mb-2">{review.event.event_name}</h3>
                    <p className="text-sm text-muted-foreground mb-3">
                      {review.event.location && `${review.event.location} • `}
                      {format(new Date(review.created_at), 'MMM d, yyyy')}
                    </p>
                    <Badge className={`${getRatingColor(review.rating)} border`}>
                      {getRatingIcon(review.rating)}
                      <span className="ml-1">{getRatingText(review.rating)}</span>
                    </Badge>
                    <Button
                      onClick={() => handleRankingChoice(review)}
                      variant="outline"
                      className="w-full mt-3"
                    >
                      This was better
                    </Button>
                  </div>
                ))}

                {/* If no same rating reviews, show message */}
                {getReviewsByRating(pendingReview.rating).length === 0 && (
                  <div className="p-4 text-center text-muted-foreground">
                    <p>No other {getRatingText(pendingReview.rating).toLowerCase()} concerts to compare with.</p>
                    <p className="text-sm mt-2">This will be placed based on rating hierarchy.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Edit Review Modal */}
        {showEditModal && editingReview && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Edit Concert Review</CardTitle>
                <Button variant="ghost" size="icon" onClick={() => setShowEditModal(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Event Name *</label>
                  <input
                    type="text"
                    value={editingReview.event.event_name}
                    onChange={(e) => setEditingReview(prev => prev ? {
                      ...prev,
                      event: { ...prev.event, event_name: e.target.value }
                    } : null)}
                    className="w-full p-2 border rounded-md"
                    placeholder="e.g., Taylor Swift - Eras Tour"
                  />
                </div>
                
                <div>
                  <label className="text-sm font-medium mb-2 block">Venue</label>
                  <input
                    type="text"
                    value={editingReview.event.location}
                    onChange={(e) => setEditingReview(prev => prev ? {
                      ...prev,
                      event: { ...prev.event, location: e.target.value }
                    } : null)}
                    className="w-full p-2 border rounded-md"
                    placeholder="e.g., Madison Square Garden"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">How was it? *</label>
                  <div className="flex gap-2">
                    <Button
                      variant={editingReview.rating === 'good' ? 'default' : 'outline'}
                      onClick={() => setEditingReview(prev => prev ? { ...prev, rating: 'good' } : null)}
                      className={`flex-1 ${editingReview.rating === 'good' ? 'bg-green-600 hover:bg-green-700' : ''}`}
                    >
                      <ThumbsUp className="w-4 h-4 mr-2" />
                      Good
                    </Button>
                    <Button
                      variant={editingReview.rating === 'okay' ? 'default' : 'outline'}
                      onClick={() => setEditingReview(prev => prev ? { ...prev, rating: 'okay' } : null)}
                      className={`flex-1 ${editingReview.rating === 'okay' ? 'bg-yellow-600 hover:bg-yellow-700' : ''}`}
                    >
                      <Minus className="w-4 h-4 mr-2" />
                      Okay
                    </Button>
                    <Button
                      variant={editingReview.rating === 'bad' ? 'default' : 'outline'}
                      onClick={() => setEditingReview(prev => prev ? { ...prev, rating: 'bad' } : null)}
                      className={`flex-1 ${editingReview.rating === 'bad' ? 'bg-red-600 hover:bg-red-700' : ''}`}
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
                    onChange={(e) => setEditingReview(prev => prev ? { ...prev, review_text: e.target.value } : null)}
                    placeholder="Share your thoughts about the concert..."
                    className="min-h-[100px]"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="edit-public"
                    checked={editingReview.is_public}
                    onChange={(e) => setEditingReview(prev => prev ? { ...prev, is_public: e.target.checked } : null)}
                    className="rounded"
                  />
                  <label htmlFor="edit-public" className="text-sm">Make this review public</label>
                </div>

                <div className="flex gap-2 pt-4">
                  <Button variant="outline" onClick={() => setShowEditModal(false)} className="flex-1">
                    Cancel
                  </Button>
                  <Button onClick={handleUpdateReview} className="flex-1">
                    Update Review
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Reviews List */}
        <div className="space-y-4">
          {reviews.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Music className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No reviews yet</h3>
                <p className="text-muted-foreground mb-4">
                  Start reviewing your concert experiences!
                </p>
                <Button onClick={() => setShowAddReview(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Your First Review
                </Button>
              </CardContent>
            </Card>
          ) : (
            reviews.map((review, index) => {
              const eventDateTime = review.event.event_date ? 
                parseISO(`${review.event.event_date}T${review.event.event_time || '19:00'}`) : 
                new Date();
              
              return (
                <Card key={review.id} className="overflow-hidden">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <Avatar className="w-12 h-12">
                        <AvatarImage src={review.user.avatar_url || undefined} />
                        <AvatarFallback>
                          {review.user.name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <h3 className="font-semibold text-lg">{review.event.event_name}</h3>
                            <p className="text-sm text-muted-foreground">
                              {review.event.location && `${review.event.location} • `}
                              {format(eventDateTime, 'MMM d, yyyy')}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className={`${getRatingColor(review.rating)} border`}>
                              {getRatingIcon(review.rating)}
                              <span className="ml-1">{getRatingText(review.rating)}</span>
                            </Badge>
                            {review.is_public ? (
                              <Badge variant="outline" className="text-xs">Public</Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs">Private</Badge>
                            )}
                          </div>
                        </div>

                        {review.review_text && (
                          <p className="text-sm text-muted-foreground mb-3 line-clamp-3">
                            {review.review_text}
                          </p>
                        )}

                        <div className="flex items-center justify-between mt-3">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                              #{index + 1} • {format(new Date(review.created_at), 'MMM d, yyyy')}
                            </span>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleEditReview(review.id)}
                          >
                            <Edit3 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
