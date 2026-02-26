"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { useCustomerFeedback, useAddFeedbackResponse, useUpdateFeedbackFlag } from "../../hooks/useCustomerFeedback";
import type { CustomerListItem } from "@/types/customer";

interface FeedbackTabProps {
  customer: CustomerListItem | null;
}

export function FeedbackTab({ customer }: FeedbackTabProps) {
  const customerId = customer?.id || null;
  const { data: feedback = [], isLoading } = useCustomerFeedback(customerId);
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const [responseText, setResponseText] = useState("");

  const respondMutation = useAddFeedbackResponse();
  const flagMutation = useUpdateFeedbackFlag();

  const stats = useMemo(() => {
    if (feedback.length === 0) {
      return {
        avgRating: 0,
        totalReviews: 0,
        foodAvg: 0,
        serviceAvg: 0,
      };
    }

    const overallSum = feedback.reduce((sum, f: any) => sum + (f.overall_rating || 0), 0);
    const foodSum = feedback.reduce((sum, f: any) => sum + (f.food_rating || 0), 0);
    const serviceSum = feedback.reduce((sum, f: any) => sum + (f.service_rating || 0), 0);
    const foodCount = feedback.filter((f: any) => f.food_rating).length;
    const serviceCount = feedback.filter((f: any) => f.service_rating).length;

    return {
      avgRating: (overallSum / feedback.length).toFixed(1),
      totalReviews: feedback.length,
      foodAvg: foodCount > 0 ? (foodSum / foodCount).toFixed(1) : 0,
      serviceAvg: serviceCount > 0 ? (serviceSum / serviceCount).toFixed(1) : 0,
    };
  }, [feedback]);

  const handleRespond = async () => {
    if (!respondingTo || !responseText.trim()) return;
    await respondMutation.mutateAsync({ feedbackId: respondingTo, response: responseText });
    setRespondingTo(null);
    setResponseText("");
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <Card className="border-none shadow-sm bg-white dark:bg-card">
          <CardContent className="pt-4">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Avg Rating</p>
            <p className="text-2xl font-bold mt-2">⭐ {stats.avgRating}</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-white dark:bg-card">
          <CardContent className="pt-4">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Total Reviews</p>
            <p className="text-2xl font-bold mt-2">{stats.totalReviews}</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-white dark:bg-card">
          <CardContent className="pt-4">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Food Avg</p>
            <p className="text-2xl font-bold mt-2">⭐ {stats.foodAvg}</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-white dark:bg-card">
          <CardContent className="pt-4">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Service Avg</p>
            <p className="text-2xl font-bold mt-2">⭐ {stats.serviceAvg}</p>
          </CardContent>
        </Card>
      </div>

      {/* Feedback List */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : feedback.length === 0 ? (
          <div className="text-center p-8 text-muted-foreground">No feedback yet</div>
        ) : (
          (feedback as any[]).map((item) => (
            <Card key={item.id} className="border shadow-sm">
              <CardContent className="pt-4">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm">{"⭐".repeat(item.overall_rating)}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(item.created_at).toLocaleDateString()}
                      </span>
                      {item.is_flagged && (
                        <Badge variant="destructive" className="text-xs">Flagged</Badge>
                      )}
                    </div>
                    {item.comment && (
                      <p className="text-sm text-foreground mb-2">{item.comment}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={item.is_flagged ? "default" : "outline"}
                      onClick={() => flagMutation.mutate({ feedbackId: item.id, isFlagged: !item.is_flagged })}
                      className="h-8"
                    >
                      {item.is_flagged ? "Unflag" : "Flag"}
                    </Button>
                    {!item.response && (
                      <Button
                        size="sm"
                        onClick={() => setRespondingTo(item.id)}
                        className="h-8"
                      >
                        Respond
                      </Button>
                    )}
                  </div>
                </div>

                {/* Response */}
                {item.response && (
                  <div className="bg-muted/30 p-3 rounded-md text-sm mb-3">
                    <p className="font-medium text-xs text-muted-foreground mb-1">
                      Response by {item.responder ? `${item.responder.first_name} ${item.responder.last_name}`.trim() || item.responder.email : "Staff"}
                      {item.responded_at && (
                        <span className="text-xs text-muted-foreground/70 ml-2">
                          {new Date(item.responded_at).toLocaleDateString()}
                        </span>
                      )}
                    </p>
                    <p>{item.response}</p>
                  </div>
                )}

                {/* Respond Input */}
                {respondingTo === item.id && (
                  <div className="mt-3 space-y-2">
                    <Textarea
                      placeholder="Type your response..."
                      value={responseText}
                      onChange={(e) => setResponseText(e.target.value)}
                      rows={3}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={handleRespond}
                        disabled={!responseText.trim() || respondMutation.isPending}
                      >
                        Send
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setRespondingTo(null); setResponseText(""); }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
