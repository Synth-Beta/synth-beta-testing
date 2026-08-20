import { FormEvent, useState } from "react";
import { CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmailGateService } from "@/services/emailGateService";
import { useToast } from "@/hooks/use-toast";

export function NewsletterSignupForm() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast({
        title: "Invalid Email",
        description: "Please enter a valid email address.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const userIP = await EmailGateService.getUserIP();
      const success = await EmailGateService.submitEmail(email, userIP);

      if (success) {
        toast({
          title: "You're in!",
          description: "We'll keep you updated on new issues.",
        });
        setEmail("");
      } else {
        toast({
          title: "Error",
          description: "Something went wrong. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error submitting email:", error);
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <form onSubmit={handleSubmit} className="max-w-md mx-auto">
        <div className="flex flex-col sm:flex-row gap-3">
          <Input
            type="email"
            placeholder="Your email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="flex-1 bg-white/90 backdrop-blur-sm border-pink-200/50 text-gray-900 placeholder:text-gray-500 focus:ring-2 focus:ring-pink-500"
          />
          <Button
            type="submit"
            disabled={isSubmitting}
            variant="outline"
            className="border-pink-300 text-pink-600 hover:bg-pink-50"
          >
            {isSubmitting ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-pink-500" />
            ) : (
              "Notify me"
            )}
          </Button>
        </div>
      </form>
      <div className="flex items-center justify-center gap-6 mt-4 text-xs text-gray-500">
        <span className="flex items-center">
          <CheckCircle className="w-3.5 h-3.5 mr-1" />
          No spam
        </span>
        <span className="flex items-center">
          <CheckCircle className="w-3.5 h-3.5 mr-1" />
          Unsubscribe anytime
        </span>
      </div>
    </div>
  );
}
