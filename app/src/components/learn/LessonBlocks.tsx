import { DEMOS } from "../../lessons/demos";
import type { Lesson, LessonBlock, LessonPage } from "../../lessons/types";
import { GlossText } from "../roadmap/GlossText";
import { Quiz } from "./Quiz";

function Demo({ id }: { id: string }) {
  const def = DEMOS[id];
  if (!def) return <p className="demo-missing">This interactive example is not available ({id}).</p>;
  const { Component } = def;
  return <Component />;
}

/** A page's blocks as the interactive reader shows them. */
export function PageBlocks({ page }: { page: LessonPage }) {
  return (
    <>
      {page.blocks.map((b, i) => (
        <Block key={i} block={b} />
      ))}
    </>
  );
}

function Block({ block }: { block: LessonBlock }) {
  switch (block.kind) {
    case "text":
      return (
        <p>
          <GlossText text={block.text} />
        </p>
      );
    case "demo":
      return <Demo id={block.demo} />;
    case "quiz":
      return <Quiz block={block} />;
    case "summary":
      return (
        <ul className="lesson-summary">
          {block.items.map((t, i) => (
            <li key={i}>
              <GlossText text={t} />
            </li>
          ))}
        </ul>
      );
  }
}

/**
 * The whole lesson as plain text: no interaction, no script needed to follow it. Used for "read as one page", for printing and
 * for anyone who would rather read than click. Quizzes show the answer and demos describe themselves in words.
 */
export function StaticLesson({ lesson }: { lesson: Lesson }) {
  return (
    <article className="lesson-static">
      <h2>{lesson.title}</h2>
      {lesson.pages.map((page) => (
        <section key={page.id} aria-labelledby={`s-${page.id}`}>
          <h3 id={`s-${page.id}`}>{page.title}</h3>
          {page.blocks.map((b, i) => {
            if (b.kind === "demo") {
              const def = DEMOS[b.demo];
              return (
                <aside key={i} className="demo-static">
                  <b>Interactive example: {def?.title ?? b.demo}.</b> <span>{def?.text ?? "Not available."}</span>
                </aside>
              );
            }
            if (b.kind === "quiz")
              return (
                <aside key={i} className="demo-static">
                  <b>
                    <GlossText text={b.question} />
                  </b>
                  <ul>
                    {b.options.map((o, j) => (
                      <li key={j}>
                        <GlossText text={o.text} />
                        {o.correct ? " (correct answer)" : ""}
                      </li>
                    ))}
                  </ul>
                  <span>
                    <GlossText text={b.explanation} />
                  </span>
                </aside>
              );
            return <Block key={i} block={b} />;
          })}
        </section>
      ))}
    </article>
  );
}
