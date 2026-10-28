import { DURATIONS, MAX_QUESTIONS, totalQuestions } from "../format";
import { CATEGORIES, CATEGORY_LABELS, type Category, type Style, type Tone } from "../types";

const TONES: { id: Tone; label: string; hint: string }[] = [
  { id: "friendly", label: "Friendly", hint: "Warm, one follow-up when an answer is thin." },
  { id: "tough", label: "Tough", hint: "Direct, presses up to twice for specifics." },
];

interface Props {
  style: Style;
  hasCompany: boolean;
  onChange: (next: Style) => void;
}

export function StyleFields({ style, hasCompany, onChange }: Props) {
  const custom = totalQuestions(style) > 0;
  const setCount = (c: Category, n: number) => onChange({ ...style, counts: { ...style.counts, [c]: Math.max(0, Math.min(6, n || 0)) } });
  const total = totalQuestions(style);
  return (
    <div className="iv-stack">
      <fieldset className="iv-field">
        <legend>Interviewer</legend>
        <div className="iv-choices">
          {TONES.map((t) => (
            <label key={t.id} className={"iv-choice" + (style.tone === t.id ? " on" : "")}>
              <input type="radio" name="tone" checked={style.tone === t.id} onChange={() => onChange({ ...style, tone: t.id })} />
              <b>{t.label}</b>
              <small>{t.hint}</small>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="iv-field">
        <span>Length</span>
        <select value={style.durationMin} onChange={(e) => onChange({ ...style, durationMin: Number(e.target.value) })}>
          {DURATIONS.map((d) => (
            <option key={d} value={d}>
              {d} minutes
            </option>
          ))}
        </select>
      </label>
      <label className="iv-check">
        <input
          type="checkbox"
          checked={custom}
          onChange={(e) => onChange({ ...style, counts: e.target.checked ? { behavioral: 2, technical: 2 } : {} })}
        />
        Choose how many questions of each kind
      </label>
      {custom ? (
        <div className="iv-grid">
          {CATEGORIES.filter((c) => c !== "company" || hasCompany).map((c) => (
            <label key={c} className="iv-field">
              <span>{CATEGORY_LABELS[c]}</span>
              <input type="number" min={0} max={6} value={style.counts[c] ?? 0} onChange={(e) => setCount(c, Number(e.target.value))} />
            </label>
          ))}
          {total > MAX_QUESTIONS && (
            <p className="iv-warn">
              That is {total} questions. The most allowed is {MAX_QUESTIONS}.
            </p>
          )}
        </div>
      ) : (
        <p className="iv-hint">The mix is chosen from the role's level and the length.</p>
      )}
      <label className="iv-check">
        <input type="checkbox" checked={style.useCv} onChange={(e) => onChange({ ...style, useCv: e.target.checked })} />
        Use my CV to shape the questions
      </label>
      <p className="iv-hint">
        {style.useCv
          ? "Questions can build on your active CV, and the interviewer may use your name and background. Turn this off to practise from the job description alone."
          : "The interviewer will not see your CV. Questions come from the role, level and job description only."}
      </p>
      <label className="iv-check">
        <input type="checkbox" checked={style.showPlan} onChange={(e) => onChange({ ...style, showPlan: e.target.checked })} />
        Show me the planned questions first (less realistic)
      </label>
    </div>
  );
}
