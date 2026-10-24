import { useEffect, useMemo, useRef, useState } from "react";
import { loadLessons } from "../../lessons/load";
import { pagesSeen, recordPage, resumePageId } from "../../lessons/progress";
import type { Lesson } from "../../lessons/types";
import { useStore } from "../../store";
import { PageBlocks, StaticLesson } from "./LessonBlocks";

function useLessons(): { lessons: Lesson[]; error?: string } {
  return useMemo(() => {
    try {
      return { lessons: loadLessons() };
    } catch (e) {
      return { lessons: [], error: e instanceof Error ? e.message : String(e) };
    }
  }, []);
}

export function LearnScreen() {
  const lessonId = useStore((s) => s.learnLessonId);
  const pageId = useStore((s) => s.learnPageId);
  const { lessons, error } = useLessons();
  const lesson = lessons.find((l) => l.id === lessonId);

  return (
    <div className="learn">
      <div className="learn-in">
        {error ? (
          <div className="learn-empty" role="alert">
            <h1>Learn</h1>
            <p>A lesson could not be read: {error}</p>
          </div>
        ) : lesson ? (
          <Reader key={lesson.id} lesson={lesson} pageId={pageId} />
        ) : (
          <LessonList lessons={lessons} missing={lessonId} />
        )}
      </div>
    </div>
  );
}

function LessonList({ lessons, missing }: { lessons: Lesson[]; missing: string | null }) {
  const open = useStore((s) => s.openLearn);
  const setView = useStore((s) => s.setView);
  return (
    <>
      <header className="learn-head">
        <p className="home-kicker">Lessons</p>
        <h1>Learn the building blocks</h1>
        <p className="muted">
          Short lessons with something to try on every page. They are optional: every practice problem is open whether or not you read one.
        </p>
      </header>
      {missing && (
        <p className="learn-note" role="alert">
          There is no lesson called “{missing}”. Pick one below.
        </p>
      )}
      {lessons.length === 0 ? (
        <p>There are no lessons yet.</p>
      ) : (
        <ul className="learn-list">
          {lessons.map((l) => {
            const seen = pagesSeen(l);
            return (
              <li key={l.id}>
                <button type="button" className="learn-card" onClick={() => open(l.id, resumePageId(l))}>
                  <b>{l.title}</b>
                  <span>
                    {l.pages.length} pages · about {l.minutes} min ·{" "}
                    {seen === 0 ? "not started" : `${seen} of ${l.pages.length} pages opened`}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <button type="button" className="btn ghost" onClick={() => setView("home")}>
        Back to home
      </button>
    </>
  );
}

function Reader({ lesson, pageId }: { lesson: Lesson; pageId: string | null }) {
  const open = useStore((s) => s.openLearn);
  const [asOnePage, setAsOnePage] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const wanted = pageId ?? resumePageId(lesson);
  const index = Math.max(
    0,
    lesson.pages.findIndex((p) => p.id === wanted),
  );
  const page = lesson.pages[index];
  const unknownPage = pageId !== null && !lesson.pages.some((p) => p.id === pageId);

  // keep the address in step with the page: a lesson opened with no page, or a page that does not exist, lands on a real one
  useEffect(() => {
    if (pageId !== page.id) open(lesson.id, page.id, true);
  }, [lesson.id, page.id, pageId, open]);
  useEffect(() => {
    recordPage(lesson.id, page.id);
    headingRef.current?.focus({ preventScroll: false });
  }, [lesson.id, page.id]);

  const go = (i: number) => open(lesson.id, lesson.pages[i].id);
  const last = index === lesson.pages.length - 1;

  return (
    <>
      <header className="learn-head">
        <nav aria-label="Breadcrumb" className="learn-crumb">
          <button type="button" className="link" onClick={() => open()}>
            All lessons
          </button>
        </nav>
        <h1>{lesson.title}</h1>
        <p className="muted">About {lesson.minutes} minutes. Optional: you can open any problem at any time.</p>
        <div className="learn-tools">
          <button type="button" className="btn small" aria-pressed={asOnePage} onClick={() => setAsOnePage(!asOnePage)}>
            {asOnePage ? "Show one page at a time" : "Read as one page"}
          </button>
          <button type="button" className="btn small ghost" onClick={() => window.print()}>
            Print
          </button>
        </div>
      </header>

      {unknownPage && (
        <p className="learn-note" role="status">
          That page was not found, so this is the first page.
        </p>
      )}

      {asOnePage ? (
        <StaticLesson lesson={lesson} />
      ) : (
        <>
          <div className="learn-progress">
            <span id="lp-label">
              Page {index + 1} of {lesson.pages.length}
            </span>
            <progress aria-labelledby="lp-label" max={lesson.pages.length} value={index + 1} />
          </div>
          <nav aria-label="Pages in this lesson" className="learn-pages">
            <ol>
              {lesson.pages.map((p, i) => (
                <li key={p.id}>
                  <button type="button" className="learn-page-btn" aria-current={i === index ? "page" : undefined} onClick={() => go(i)}>
                    <span className="pg-num">{i + 1}</span>
                    <span>{p.title}</span>
                  </button>
                </li>
              ))}
            </ol>
          </nav>
          <article className="learn-page">
            <h2 ref={headingRef} tabIndex={-1}>
              {page.title}
            </h2>
            <PageBlocks key={page.id} page={page} />
          </article>
          <div className="learn-nav">
            <button type="button" className="btn" disabled={index === 0} onClick={() => go(index - 1)}>
              Previous
            </button>
            {last ? (
              <button type="button" className="btn primary" onClick={() => open()}>
                Finish
              </button>
            ) : (
              <button type="button" className="btn primary" onClick={() => go(index + 1)}>
                Next
              </button>
            )}
          </div>
        </>
      )}

      {/* the printed copy always holds the whole lesson, whichever view is on screen */}
      {!asOnePage && (
        <div className="learn-print" aria-hidden="true">
          <StaticLesson lesson={lesson} />
        </div>
      )}
    </>
  );
}
