/**
 * Public Feedback — mobile-first feedback form accessible via token link.
 * No authentication required.
 */

import { useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, MessageSquare, Star } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { EntityId } from "@/domain/identity/types";
import type { FeedbackAnswer } from "@/domain/experience/types";
import {
  getFeedbackFormByToken,
  submitFeedbackResponse,
  analyzeSentiment,
  ensureExperienceDemoSeeded,
} from "@/domain/experience/experience-service";
import type { FeedbackForm } from "@/domain/experience/types";

export default function PublicFeedbackPage() {
  const { token } = useParams<{ token: string }>();
  const [form] = useState<FeedbackForm | undefined>(() => {
    if (!token) return undefined;
    ensureExperienceDemoSeeded("org_public" as EntityId, "prop_public" as EntityId);
    return getFeedbackFormByToken(token);
  });
  const [answers, setAnswers] = useState<Record<string, string | number>>({});
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!token || !form) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F8F5] p-4">
        <Card className="w-full max-w-md p-8 text-center">
          <MessageSquare className="w-12 h-12 text-[#66706A] mx-auto mb-4" />
          <h1 className="text-xl font-bold text-[#17201B] mb-2">Feedback Form Not Found</h1>
          <p className="text-sm text-[#66706A]">This feedback link is invalid or has expired.</p>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F8F5] p-4">
        <Card className="w-full max-w-md p-8 text-center">
          <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-[#17201B] mb-2">Thank You!</h1>
          <p className="text-sm text-[#66706A]">Your feedback has been submitted. We appreciate your time.</p>
        </Card>
      </div>
    );
  }

  const handleRating = (questionId: string, value: number) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleText = (questionId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleYesNo = (questionId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleSubmit = () => {
    setError(null);
    const requiredQuestions = form.questions.filter((q) => q.required);
    for (const q of requiredQuestions) {
      if (answers[q.id] === undefined || answers[q.id] === "") {
        setError(`Please answer: ${q.text}`);
        return;
      }
    }

    try {
      const feedbackAnswers: FeedbackAnswer[] = form.questions.map((q) => ({
        questionId: q.id,
        value: answers[q.id] ?? "",
        category: q.category,
      }));

      const textAnswer = form.questions.find((q) => q.type === "TEXT");
      const textValue = textAnswer ? String(answers[textAnswer.id] ?? "") : "";
      const ratingQuestions = form.questions.filter((q) => q.type === "RATING");
      const avgRating =
        ratingQuestions.length > 0
          ? ratingQuestions.reduce((sum, q) => sum + (Number(answers[q.id]) || 0), 0) / ratingQuestions.length
          : 0;

      const sentiment = textValue ? analyzeSentiment(textValue, avgRating || undefined) : undefined;

      submitFeedbackResponse({
        formId: form.id,
        organizationId: form.organizationId,
        propertyId: form.propertyId,
        guestName: guestName.trim() || undefined,
        guestEmail: guestEmail.trim() || undefined,
        answers: feedbackAnswers,
        overallRating: avgRating || undefined,
        sentiment,
        source: "PUBLIC_LINK",
      });

      setSubmitted(true);
    } catch (err) {
      setError("Something went wrong. Please try again.");
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F8F5] py-8 px-4">
      <div className="max-w-lg mx-auto">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-[#17201B]">{form.name}</h1>
          <p className="text-sm text-[#66706A] mt-1">{form.description}</p>
        </div>

        <Card className="p-6 space-y-6">
          {/* Guest info */}
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-[#17201B]">Your Name (optional)</label>
              <input
                className="mt-1 w-full border border-[#E3E7E3] rounded-lg px-3 py-2 text-sm"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="Anonymous"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-[#17201B]">Email (optional)</label>
              <input
                className="mt-1 w-full border border-[#E3E7E3] rounded-lg px-3 py-2 text-sm"
                type="email"
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
                placeholder="For follow-up only"
              />
            </div>
          </div>

          {/* Questions */}
          {form.questions.map((q) => (
            <div key={q.id}>
              <label className="text-sm font-medium text-[#17201B]">
                {q.text}
                {q.required && <span className="text-red-500 ml-1">*</span>}
              </label>

              {q.type === "RATING" && (
                <div className="flex items-center gap-1 mt-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => handleRating(q.id, star)}
                      className="p-1"
                    >
                      <Star
                        className={`w-8 h-8 ${
                          star <= (Number(answers[q.id]) || 0)
                            ? "fill-yellow-500 text-yellow-500"
                            : "text-gray-300"
                        }`}
                      />
                    </button>
                  ))}
                </div>
              )}

              {q.type === "TEXT" && (
                <textarea
                  className="mt-1 w-full border border-[#E3E7E3] rounded-lg px-3 py-2 text-sm h-24 resize-none"
                  value={String(answers[q.id] ?? "")}
                  onChange={(e) => handleText(q.id, e.target.value)}
                  placeholder="Your comments…"
                />
              )}

              {q.type === "YES_NO" && (
                <div className="flex gap-3 mt-2">
                  <button
                    type="button"
                    onClick={() => handleYesNo(q.id, "yes")}
                    className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      answers[q.id] === "yes"
                        ? "border-green-500 bg-green-50 text-green-700"
                        : "border-[#E3E7E3] text-[#66706A] hover:bg-[#F7F8F5]"
                    }`}
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    onClick={() => handleYesNo(q.id, "no")}
                    className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      answers[q.id] === "no"
                        ? "border-red-500 bg-red-50 text-red-700"
                        : "border-[#E3E7E3] text-[#66706A] hover:bg-[#F7F8F5]"
                    }`}
                  >
                    No
                  </button>
                </div>
              )}

              {q.type === "MULTI_CHOICE" && q.options && (
                <div className="space-y-1 mt-2">
                  {q.options.map((opt) => (
                    <label key={opt} className="flex items-center gap-2 text-sm text-[#17201B]">
                      <input
                        type="radio"
                        name={q.id}
                        value={opt}
                        checked={answers[q.id] === opt}
                        onChange={() => handleText(q.id, opt)}
                        className="text-[#1B5E3B]"
                      />
                      {opt}
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <Button variant="primary" className="w-full" onClick={handleSubmit}>
            Submit Feedback
          </Button>
        </Card>
      </div>
    </div>
  );
}
