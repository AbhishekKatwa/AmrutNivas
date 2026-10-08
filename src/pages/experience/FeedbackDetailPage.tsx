/**
 * Feedback Detail — redirects to the unified ExperienceDetailPage.
 */

import { Navigate, useParams } from "react-router-dom";

export default function FeedbackDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/experience/${id}`} replace />;
}
