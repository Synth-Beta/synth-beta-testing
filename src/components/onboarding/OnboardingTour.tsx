import React, { useState, useEffect } from 'react';
import Joyride, { Step, CallBackProps, STATUS, ACTIONS, EVENTS } from 'react-joyride';
import { OnboardingService } from '@/services/onboardingService';
import { useAuth } from '@/hooks/useAuth';

interface OnboardingTourProps {
  run: boolean;
  onFinish: () => void;
  onViewChange?: (view: 'feed' | 'search' | 'profile' | 'chat') => void;
}

// Helper function to wait for an element to appear in the DOM using MutationObserver for better reliability
const waitForElement = (
  selector: string,
  timeout: number = 8000,
  checkInterval: number = 50
): Promise<HTMLElement> => {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    // First, check if element already exists
    const existingElement = document.querySelector(selector) as HTMLElement | null;
    if (existingElement && existingElement.offsetParent !== null && 
        existingElement.getBoundingClientRect().width > 0) {
      resolve(existingElement);
      return;
    }
    
    // Use MutationObserver to watch for DOM changes
    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector) as HTMLElement | null;
      
      if (element) {
        const rect = element.getBoundingClientRect();
        const isVisible = element.offsetParent !== null && rect.width > 0 && rect.height > 0;
        
        if (isVisible) {
          observer.disconnect();
          resolve(element);
          return;
        }
      }
      
      // Check timeout
      if (Date.now() - startTime >= timeout) {
        observer.disconnect();
        reject(new Error(`Timeout waiting for element: ${selector}`));
        return;
      }
    });
    
    // Observe the entire document for changes
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false,
    });
    
    // Also do periodic checks as fallback
    const checkIntervalId = setInterval(() => {
      const element = document.querySelector(selector) as HTMLElement | null;
      
      if (element) {
        const rect = element.getBoundingClientRect();
        const isVisible = element.offsetParent !== null && rect.width > 0 && rect.height > 0;
        
        if (isVisible) {
          clearInterval(checkIntervalId);
          observer.disconnect();
          resolve(element);
          return;
        }
      }
      
      // Check timeout
      if (Date.now() - startTime >= timeout) {
        clearInterval(checkIntervalId);
        observer.disconnect();
        reject(new Error(`Timeout waiting for element: ${selector}`));
      }
    }, checkInterval);
  });
};

export const OnboardingTour = ({ run, onFinish, onViewChange }: OnboardingTourProps) => {
  const { user } = useAuth();
  const [runTour, setRunTour] = useState(run);
  const [stepIndex, setStepIndex] = useState<number | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  // Use a ref to track if we need to resume at a specific step
  // This prevents controlled mode issues
  const resumeAtStepRef = React.useRef<number | null>(null);

  useEffect(() => {
    setRunTour(run);
    if (!run) {
      setStepIndex(undefined);
      setIsLoading(false);
      setLoadingMessage('');
    }
  }, [run]);

  // Clear stepIndex as soon as step 3 tooltip becomes visible
  // This ensures buttons work immediately when step 3 appears
  useEffect(() => {
    if (runTour && stepIndex === 2) {
      // Poll for tooltip to appear, then clear stepIndex immediately
      const checkInterval = setInterval(() => {
        const tooltip = document.querySelector('[data-joyride]') || 
                       document.querySelector('.react-joyride__tooltip') ||
                       document.querySelector('[role="dialog"]');
        
        if (tooltip) {
          console.log('Step 3 tooltip detected, clearing stepIndex for button clicks');
          setStepIndex(undefined);
          clearInterval(checkInterval);
        }
      }, 50);

      // Clear after 2 seconds max
      setTimeout(() => {
        clearInterval(checkInterval);
        if (stepIndex === 2) {
          console.log('Timeout clearing stepIndex');
          setStepIndex(undefined);
        }
      }, 2000);

      return () => clearInterval(checkInterval);
    }
  }, [runTour, stepIndex]);

  // If we need to resume at step 3, set stepIndex only for the first render
  useEffect(() => {
    if (runTour && resumeAtStepRef.current === 2 && stepIndex === undefined) {
      console.log('Resuming tour at step 3, setting stepIndex briefly');
      setStepIndex(2);
      // Clear it immediately after render
      setTimeout(() => {
        console.log('Clearing stepIndex after resume');
        setStepIndex(undefined);
        resumeAtStepRef.current = null;
      }, 50);
    }
  }, [runTour, stepIndex]);

  // If we need to resume at step 5, set stepIndex only for the first render
  useEffect(() => {
    if (runTour && resumeAtStepRef.current === 4 && stepIndex === undefined) {
      console.log('Resuming tour at step 5, setting stepIndex briefly');
      setStepIndex(4);
      // Clear it immediately after render to allow buttons to work
      setTimeout(() => {
        console.log('Clearing stepIndex after resume step 5');
        setStepIndex(undefined);
        resumeAtStepRef.current = null;
      }, 50);
    }
  }, [runTour, stepIndex]);

  // If we need to resume at step 6, set stepIndex only for the first render
  useEffect(() => {
    if (runTour && resumeAtStepRef.current === 5 && stepIndex === undefined) {
      console.log('Resuming tour at step 6, setting stepIndex briefly');
      setStepIndex(5);
      // Clear it immediately after render to allow buttons to work
      setTimeout(() => {
        console.log('Clearing stepIndex after resume step 6');
        setStepIndex(undefined);
        resumeAtStepRef.current = null;
      }, 50);
    }
  }, [runTour, stepIndex]);

  const steps: Array<Step & { before?: () => void | Promise<void> }> = [
    {
      target: 'body',
      content: (
        <div className="space-y-2">
          <h3 className="text-lg font-bold">Welcome to Synth! 🎵</h3>
          <p>
            Let&apos;s take a quick tour of the app to help you discover shows, connect with friends, and share your concert experiences.
          </p>
        </div>
      ),
      placement: 'center',
      disableBeacon: true,
      before: () => {
        if (onViewChange) {
          onViewChange('feed');
        }
      },
    },
    {
      target: '[data-tour="feed-toggle"]',
      content: (
        <div className="space-y-2">
          <h3 className="text-lg font-bold">Toggle Your Feed</h3>
          <p>
            Switch between different feed types: Hand Picked Events, Trending Events, Friends Interested, and more. Each feed shows you different perspectives on what&apos;s happening.
          </p>
        </div>
      ),
      placement: 'bottom',
      disableBeacon: true,
      before: async () => {
        if (onViewChange) {
          onViewChange('feed');
        }
        await new Promise(resolve => setTimeout(resolve, 300));
        await new Promise(resolve => requestAnimationFrame(resolve));
        try {
          const element = await waitForElement('[data-tour="feed-toggle"]', 5000);
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await new Promise(resolve => setTimeout(resolve, 400));
        } catch (error) {
          console.error('Step 2: Element not found:', error);
          throw error;
        }
      },
    },
    {
      target: '[data-tour="discover-vibes"]',
      content: (
        <div className="space-y-2">
          <h3 className="text-lg font-bold">Discover by Vibes</h3>
          <p>
            Browse Vibes lets you explore events by mood and scene. You can also use the Map & Calendar view to see events by location and date. Try different vibes to find shows that match your energy!
          </p>
        </div>
      ),
      placement: 'bottom',
      disableBeacon: true,
      before: async () => {
        console.log('Step 3 before: Checking if discover view is ready');
        
        // Ensure we're on discover view
        if (onViewChange) {
          onViewChange('search');
        }
        
        // Wait for React state update
        await new Promise(resolve => setTimeout(resolve, 200));
        await new Promise(resolve => requestAnimationFrame(resolve));
        await new Promise(resolve => requestAnimationFrame(resolve));
        
        // Wait for element (should already be loaded from useEffect pre-load)
        console.log('Step 3 before: Waiting for element...');
        const element = await waitForElement('[data-tour="discover-vibes"]', 10000);
        console.log('Step 3 before: Element found!', element);
        
        // Scroll into view
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await new Promise(resolve => setTimeout(resolve, 400));
        
        // Verify visibility
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0 || element.offsetParent === null) {
          console.error('Step 3 before: Element not visible!', rect);
          throw new Error('Target element not visible');
        }
        
        console.log('Step 3 before: Element verified and ready');
      },
    },
    {
      target: '[data-tour="create-review"]',
      content: (
        <div className="space-y-2">
          <h3 className="text-lg font-bold">Share Your Experience</h3>
          <p>
            Tap the pink plus button to create a review for any show you&apos;ve attended. Share photos, rate the performance, and let your friends know what you thought!
          </p>
        </div>
      ),
      placement: 'top',
      disableBeacon: true,
      before: async () => {
        if (onViewChange) {
          onViewChange('feed');
        }
        await new Promise(resolve => setTimeout(resolve, 300));
        await new Promise(resolve => requestAnimationFrame(resolve));
        try {
          const element = await waitForElement('[data-tour="create-review"]', 5000);
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await new Promise(resolve => setTimeout(resolve, 400));
        } catch (error) {
          console.error('Step 4: Element not found:', error);
          throw error;
        }
      },
    },
    {
      target: '[data-tour="chat"]',
      content: (
        <div className="space-y-2">
          <h3 className="text-lg font-bold">Connect with Friends</h3>
          <p>
            Use the messages icon to chat with friends, join group conversations about shows, and stay connected with your concert community.
          </p>
        </div>
      ),
      placement: 'top',
      disableBeacon: true,
      before: async () => {
        // View should already be changed from STEP_AFTER handler
        // Just verify it's loaded and wait for button
        console.log('Step 5 before: Verifying chat view is loaded');
        
        try {
          // Verify chat view is present
          const messagesHeading = Array.from(document.querySelectorAll('h1')).find(
            h1 => h1.textContent?.trim() === 'Messages'
          );
          
          if (!messagesHeading) {
            console.warn('Step 5 before: Messages heading not found, waiting...');
            await new Promise(resolve => setTimeout(resolve, 300));
          }
          
          console.log('Step 5 before: Waiting for chat navigation button...');
          const element = await waitForElement('[data-tour="chat"]', 8000);
          console.log('Step 5 before: Chat navigation button found!');
          
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await new Promise(resolve => setTimeout(resolve, 400));
        } catch (error) {
          console.error('Step 5: Element not found:', error);
          // Don't throw - allow step to proceed even if element not found
        }
      },
    },
    {
      target: '[data-tour="profile-passport"]',
      content: (
        <div className="space-y-2">
          <h3 className="text-lg font-bold">Your Live Music Passport</h3>
          <p>
            Check out your profile and Live Music Passport! See your identity, stamps, achievements, timeline, and bucket list. Track your concert journey all in one place.
          </p>
        </div>
      ),
      placement: 'top',
      disableBeacon: true,
      before: async () => {
        console.log('Step 6 before: Navigating to profile view');
        if (onViewChange) {
          onViewChange('profile');
        }
        // Wait for React to process state update and start rendering
        await new Promise(resolve => setTimeout(resolve, 400));
        await new Promise(resolve => requestAnimationFrame(resolve));
        await new Promise(resolve => requestAnimationFrame(resolve));
        try {
          console.log('Step 6 before: Waiting for profile-passport element...');
          const element = await waitForElement('[data-tour="profile-passport"]', 6000);
          console.log('Step 6 before: Profile-passport element found!');
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await new Promise(resolve => setTimeout(resolve, 400));
        } catch (error) {
          console.error('Step 6: Element not found:', error);
          // Don't throw - allow step to proceed even if element not found
        }
      },
    },
    {
      target: 'body',
      content: (
        <div className="space-y-2">
          <h3 className="text-lg font-bold">You&apos;re All Set! 🎉</h3>
          <p>
            You&apos;ve completed the tour! Start exploring shows, connecting with friends, and sharing your concert experiences. Have fun!
          </p>
        </div>
      ),
      placement: 'center',
      disableBeacon: true,
      before: async () => {
        if (onViewChange) {
          onViewChange('feed');
        }
        await new Promise(resolve => setTimeout(resolve, 500));
      },
    },
  ];

  const handleJoyrideCallback = async (data: CallBackProps) => {
    const { status, type, index, action } = data;

    // Pause tour and show loading when leaving step 2 (index 1) to load step 3
    if (type === EVENTS.STEP_AFTER && action === ACTIONS.NEXT && index === 1 && onViewChange) {
      console.log('Step 2 completed: Pausing tour to load discover view');
      
      // Pause the tour
      setRunTour(false);
      setIsLoading(true);
      setLoadingMessage('Loading discover page...');
      
      // Navigate to discover view
      onViewChange('search');
      
      // Wait for React to process the navigation
      await new Promise(resolve => setTimeout(resolve, 300));
      await new Promise(resolve => requestAnimationFrame(resolve));
      await new Promise(resolve => requestAnimationFrame(resolve));
      
      // Wait for the element to be ready
      try {
        await waitForElement('[data-tour="discover-vibes"]', 15000);
        console.log('Step 3 target is ready, resuming tour');
        
        // Small delay to ensure everything is rendered
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Resume the tour at step 3 (index 2)
        // Use ref to track we need to resume at step 3, but don't use controlled mode
        // Instead, we'll briefly set stepIndex in useEffect, then clear it
        resumeAtStepRef.current = 2;
        setIsLoading(false);
        setLoadingMessage('');
        setStepIndex(undefined); // Start with undefined
        // Small delay to ensure state is cleared before resuming
        await new Promise(resolve => setTimeout(resolve, 100));
        setRunTour(true);
      } catch (error) {
        console.error('Step 3 target not ready, resuming anyway:', error);
        // Resume anyway - the before handler will try again
        setIsLoading(false);
        setLoadingMessage('');
        setStepIndex(undefined); // Ensure it's undefined
        await new Promise(resolve => setTimeout(resolve, 100));
        setRunTour(true);
      }
      return; // Exit early to prevent other handlers from running
    }

    // Clear stepIndex immediately when step 3 is shown (STEP_BEFORE with index 2)
    // This ensures buttons work as soon as step 3 appears
    if (type === EVENTS.STEP_BEFORE && index === 2) {
      console.log('Step 3 shown, immediately clearing stepIndex to enable buttons');
      // Clear immediately, synchronously if possible
      setStepIndex(undefined);
      // Force a re-render to ensure buttons are clickable
      setTimeout(() => {
        const button = document.querySelector('[data-test-id="button-primary"]') as HTMLButtonElement;
        if (button) {
          console.log('Button found, ensuring it is clickable');
          button.style.pointerEvents = 'auto';
          button.style.cursor = 'pointer';
        }
      }, 0);
    }
    
    // Also clear stepIndex on STEP_AFTER for step 3 to ensure next button works
    if (type === EVENTS.STEP_AFTER && index === 2 && stepIndex === 2) {
      console.log('Step 3 completed, clearing stepIndex');
      setStepIndex(undefined);
    }

    // Clear stepIndex immediately when step 5 is shown (STEP_BEFORE with index 4)
    // This ensures buttons work as soon as step 5 appears
    if (type === EVENTS.STEP_BEFORE && index === 4) {
      console.log('Step 5 shown, immediately clearing stepIndex to enable buttons');
      // Clear immediately, synchronously if possible
      setStepIndex(undefined);
      // Force a re-render and make button clickable using multiple strategies
      setTimeout(() => {
        // Try all possible button selectors
        const buttonSelectors = [
          '[data-action="primary"]',
          '[data-test-id="button-primary"]',
          'button[class*="buttonNext"]',
          'button:contains("Next")',
          '.react-joyride__tooltip button:last-child',
          '.react-joyride__tooltip [role="button"]:last-child',
          'button[aria-label*="Next"]',
        ];
        
        // Use a Set to track which buttons we've already processed
        const processedButtons = new Set<HTMLElement>();
        
        for (const selector of buttonSelectors) {
          try {
            const buttons = Array.from(document.querySelectorAll(selector)) as HTMLElement[];
            buttons.forEach(button => {
              // Skip if we've already processed this button
              if (processedButtons.has(button)) return;
              
              const text = button.textContent || '';
              if (text.includes('Next') || text.includes('Step 5')) {
                console.log(`Step 5 button found with selector: ${selector}`);
                processedButtons.add(button);
                
                // Just ensure the button is enabled and clickable
                // Don't override handlers - let Joyride handle clicks naturally
                button.style.pointerEvents = 'auto';
                button.style.cursor = 'pointer';
                button.style.zIndex = '99999';
                button.style.position = 'relative';
                
                // Remove any disabled attribute
                button.removeAttribute('disabled');
                if (button instanceof HTMLButtonElement) {
                  button.disabled = false;
                  // Force enable by setting disabled to false multiple ways
                  button.setAttribute('aria-disabled', 'false');
                }
              }
            });
          } catch (e) {
            // Invalid selector, continue
          }
        }
        
        // Also search all buttons if we didn't find with selectors
        const allButtons = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[];
        allButtons.forEach(button => {
          if (processedButtons.has(button)) return;
          
          const text = button.textContent || '';
          if (text.includes('Next') && text.includes('Step 5')) {
            console.log('Step 5 button found by text search');
            processedButtons.add(button);
            button.style.pointerEvents = 'auto';
            button.style.cursor = 'pointer';
            button.style.zIndex = '99999';
            button.style.position = 'relative';
            button.disabled = false;
            button.removeAttribute('disabled');
            button.setAttribute('aria-disabled', 'false');
          }
        });
        
        // Also ensure overlay isn't blocking
        const overlays = document.querySelectorAll('[class*="overlay"]') as NodeListOf<HTMLElement>;
        overlays.forEach(overlay => {
          overlay.style.pointerEvents = 'none';
          overlay.style.zIndex = '1';
        });
      }, 0);
      
      // Also try after a longer delay to catch buttons that render later
      setTimeout(() => {
        setStepIndex(undefined);
        const buttons = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[];
        buttons.forEach(button => {
          const text = button.textContent || '';
          if (text.includes('Next')) {
            button.style.pointerEvents = 'auto !important';
            button.style.cursor = 'pointer !important';
            button.disabled = false;
          }
        });
      }, 100);
    }
    
    // Also clear stepIndex on STEP_AFTER for step 5 to ensure next button works
    if (type === EVENTS.STEP_AFTER && index === 4 && stepIndex === 4) {
      console.log('Step 5 completed, clearing stepIndex');
      setStepIndex(undefined);
    }

    // Pause tour and show loading when leaving step 5 (index 4) to load step 6 (profile)
    if (type === EVENTS.STEP_AFTER && action === ACTIONS.NEXT && index === 4 && onViewChange) {
      console.log('Step 5 completed: Pausing tour to load profile view');
      
      // Pause the tour
      setRunTour(false);
      setIsLoading(true);
      setLoadingMessage('Loading Profile page...');
      
      // Navigate to profile view
      onViewChange('profile');
      
      // Wait for the profile view to load
      try {
        console.log('Step 5 completed: Waiting for profile view to load...');
        await new Promise(resolve => setTimeout(resolve, 500));
        await new Promise(resolve => requestAnimationFrame(resolve));
        await new Promise(resolve => requestAnimationFrame(resolve));
        await new Promise(resolve => requestAnimationFrame(resolve));
        
        // Wait for profile-passport element to appear (indicates profile view is loaded)
        let profileViewReady = false;
        let attempts = 0;
        while (!profileViewReady && attempts < 100) {
          const profilePassport = document.querySelector('[data-tour="profile-passport"]');
          
          if (profilePassport) {
            console.log('Profile view is ready, resuming tour');
            profileViewReady = true;
            break;
          }
          
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }
        
        if (!profileViewReady) {
          console.warn('Profile view loading timeout, proceeding anyway');
        }
        
        // Wait a bit more for profile to render
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Clear loading state
        setIsLoading(false);
        setLoadingMessage('');
        
        // Resume tour at step 6 (index 5) - DON'T use controlled mode
        // Just resume without stepIndex to allow buttons to work
        resumeAtStepRef.current = 5;
        setStepIndex(undefined); // Start with undefined - no controlled mode
        // Small delay to ensure state is cleared before resuming
        await new Promise(resolve => setTimeout(resolve, 100));
        setRunTour(true);
        
        // Clear resumeAtStepRef after a brief moment
        setTimeout(() => {
          resumeAtStepRef.current = null;
        }, 200);
      } catch (error) {
        console.error('Profile view loading error:', error);
        // Still resume, let before handler deal with it
        setIsLoading(false);
        setLoadingMessage('');
        resumeAtStepRef.current = 5;
        setStepIndex(undefined); // Start with undefined - no controlled mode
        await new Promise(resolve => setTimeout(resolve, 100));
        setRunTour(true);
        setTimeout(() => {
          resumeAtStepRef.current = null;
        }, 200);
      }
      return; // Early return to prevent other handlers from running
    }

    // Pause tour and show loading when leaving step 4 (index 3) to load step 5 (chat)
    if (type === EVENTS.STEP_AFTER && action === ACTIONS.NEXT && index === 3 && onViewChange) {
      console.log('Step 4 completed: Pausing tour to load chat view');
      
      // Pause the tour
      setRunTour(false);
      setIsLoading(true);
      setLoadingMessage('Loading Chat page...');
      
      // Navigate to chat view
      onViewChange('chat');
      
      // Wait for the chat view to load
      try {
        console.log('Step 4 completed: Waiting for chat view to load...');
        await new Promise(resolve => setTimeout(resolve, 500));
        await new Promise(resolve => requestAnimationFrame(resolve));
        await new Promise(resolve => requestAnimationFrame(resolve));
        await new Promise(resolve => requestAnimationFrame(resolve));
        
        // Wait for "Messages" heading to appear (indicates chat view is loaded)
        let chatViewReady = false;
        let attempts = 0;
        while (!chatViewReady && attempts < 100) {
          const messagesHeading = Array.from(document.querySelectorAll('h1')).find(
            h1 => h1.textContent?.trim() === 'Messages'
          );
          
          if (messagesHeading) {
            console.log('Chat view is ready, resuming tour');
            chatViewReady = true;
            break;
          }
          
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }
        
        if (!chatViewReady) {
          console.warn('Chat view loading timeout, proceeding anyway');
        }
        
        // Wait a bit more for chat list to render
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Clear loading state
        setIsLoading(false);
        setLoadingMessage('');
        
        // Resume tour at step 5 (index 4) - DON'T use controlled mode
        // Just resume without stepIndex to allow buttons to work
        resumeAtStepRef.current = 4;
        setStepIndex(undefined); // Start with undefined - no controlled mode
        // Small delay to ensure state is cleared before resuming
        await new Promise(resolve => setTimeout(resolve, 100));
        setRunTour(true);
        
        // Clear stepIndex again after resume to ensure buttons work
        setTimeout(() => {
          setStepIndex(undefined);
          resumeAtStepRef.current = null;
        }, 200);
      } catch (error) {
        console.error('Chat view loading error:', error);
        // Still resume, let before handler deal with it
        setIsLoading(false);
        setLoadingMessage('');
        resumeAtStepRef.current = 4;
        setStepIndex(undefined); // Start with undefined - no controlled mode
        await new Promise(resolve => setTimeout(resolve, 100));
        setRunTour(true);
        setTimeout(() => {
          setStepIndex(undefined);
          resumeAtStepRef.current = null;
        }, 200);
      }
      return; // Early return to prevent other handlers from running
    }

    // Handle tour completion
    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      setRunTour(false);
      setStepIndex(undefined);
      setIsLoading(false);
      setLoadingMessage('');
      if (user) {
        await OnboardingService.completeTour(user.id);
      }
      onFinish();
    }

    // Handle errors
    if (type === EVENTS.TARGET_NOT_FOUND) {
      console.error('Joyride: Target not found for step', index, data);
      // Don't block progression - let user skip if needed
    }
  };

  // Show loading screen while step 3 loads
  if (isLoading) {
    return (
      <div className="fixed inset-0 z-[9999] bg-[#fcfcfc] flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#cc2486] mx-auto"></div>
          <p className="text-lg font-medium text-gray-700">{loadingMessage}</p>
        </div>
      </div>
    );
  }

  if (!runTour) {
    return null;
  }

  return (
    <Joyride
      steps={steps}
      run={runTour}
      {...(typeof stepIndex === 'number' ? { stepIndex } : {})}
      continuous
      disableScrolling={false}
      showProgress
      showSkipButton
      spotlightClicks={true}
      callback={handleJoyrideCallback}
      disableOverlayClose={false}
      styles={{
        options: {
          primaryColor: '#cc2486',
          textColor: '#0e0e0e',
          backgroundColor: '#fcfcfc',
          arrowColor: '#fcfcfc',
          overlayColor: 'rgba(0, 0, 0, 0)',
          zIndex: 10000,
          width: 'max(320px, min(393px, 90vw))',
        },
        tooltip: {
          borderRadius: 12,
          padding: 20,
          maxWidth: '393px',
          fontSize: '14px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
        },
        tooltipContainer: {
          textAlign: 'left',
        },
        buttonNext: {
          backgroundColor: '#cc2486',
          borderRadius: 8,
          fontSize: 14,
          padding: '10px 20px',
          fontWeight: 600,
          color: '#fff',
          border: 'none',
          outline: 'none',
          cursor: 'pointer !important',
          pointerEvents: 'auto !important',
          zIndex: 10001,
        },
        buttonBack: {
          color: '#5d646f',
          fontSize: 14,
          marginRight: 10,
          border: 'none',
          outline: 'none',
        },
        buttonSkip: {
          color: '#5d646f',
          fontSize: 14,
          border: 'none',
          outline: 'none',
        },
        overlay: {
          mixBlendMode: 'normal',
          backgroundColor: 'rgba(0, 0, 0, 0)',
          cursor: 'default',
          pointerEvents: 'none', // Allow clicks through overlay
        },
        spotlight: {
          borderRadius: 12,
          boxShadow: '0 0 0 4px rgba(204, 36, 134, 0.6), 0 0 30px rgba(204, 36, 134, 0.4)',
          backgroundColor: 'transparent',
        },
        spotlightLegacy: {
          borderRadius: 12,
        },
      }}
      locale={{
        back: 'Back',
        close: 'Close',
        last: 'Finish',
        next: 'Next',
        skip: 'Skip Tour',
      }}
    />
  );
};
