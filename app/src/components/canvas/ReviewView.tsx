import type { AiReview } from "../../types";

export function ReviewView({ review }: { review: AiReview }) {
  const list = (title: string, items: string[]) =>
    items.length > 0 && (
      <>
        <h5>{title}</h5>
        <ul className="bul">
          {items.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      </>
    );
  return (
    <div className="review">
      <div className="review-head">
        <b>AI review</b>
        <span className="pill">{review.score}/100</span>
      </div>
      <p>{review.summary}</p>
      {list("Strengths", review.strengths)}
      {list("Gaps", review.gaps)}
      {list("Suggestions", review.suggestions)}
      {list("Requirement notes", review.requirementNotes ?? [])}
    </div>
  );
}
