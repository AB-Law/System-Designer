import { useState } from "react";
import { n } from "./format";
import { FILE, PIECE_SIZES, upload } from "./mediaModels";
import { Choice, DemoFrame, Predict, Result } from "./parts";
import { restart } from "./restart";

const GUESSES = [
  { id: "2000", label: "About 2,000 MB: only what is missing" },
  { id: "3000", label: "About 3,000 MB" },
  { id: "3800", label: "About 3,800 MB: everything is sent again" },
  { id: "200", label: "About 200 MB: the last tenth" },
];

const mins = (s: number) => (s < 120 ? `${n(s)} seconds` : `about ${n(s / 60)} minutes`);

export function ChunksDemo() {
  const [guess, setGuess] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [piece, setPiece] = useState("100");
  const [resume, setResume] = useState("yes");

  const whole = upload(FILE.sizeMB, true);
  const tried = upload(Number(piece), resume === "yes");
  const reset = () => {
    setGuess(null);
    setRevealed(false);
    setPiece("100");
    setResume("yes");
  };

  return (
    <DemoFrame
      title="Starting again, or carrying on"
      model="teaching"
      assumptions={[
        "This is a teaching model, not the app's simulator. The file size, the connection speed and the cost of each piece are invented.",
        `The connection runs at ${FILE.speedMBps} MB a second and drops once, at ${FILE.failsAt * 100}%. Each piece adds a small fixed cost for the request that sends it.`,
        "Real uploads can fail in many places and can send pieces in parallel. This model sends one piece at a time.",
        "The app models blob storage and a CDN as capacity and cost. It does not model a transfer breaking off.",
      ]}
    >
      <p>
        A friend uploads a {n(FILE.sizeMB)} MB wedding video as a single piece. At {FILE.failsAt * 100}% the connection drops. They start
        again from the beginning.
      </p>
      <Predict
        question="How much data is sent in all, counting both attempts?"
        options={GUESSES}
        guess={guess}
        onGuess={setGuess}
        revealed={revealed}
        onReveal={() => setRevealed(true)}
      />
      <div role="status" aria-live="polite">
        {revealed && (
          <Result>
            <p>
              <b>{guess === "3800" ? "Yes: about 3,800 MB." : "About 3,800 MB."}</b> {n(FILE.sizeMB * FILE.failsAt)} MB went in the first
              attempt and was wasted, then all {n(FILE.sizeMB)} MB went again. It took {mins(whole.seconds)}.
            </p>
            <p>Now cut the file into pieces, and choose whether the pieces that arrived are kept.</p>
            <Choice
              legend="Size of each piece"
              options={PIECE_SIZES.map((p) => ({ id: String(p), label: p === FILE.sizeMB ? "The whole file in one piece" : `${n(p)} MB` }))}
              value={piece}
              onChange={setPiece}
            />
            <Choice
              legend="After the drop"
              options={[
                { id: "yes", label: "Keep the pieces that arrived and send the rest" },
                { id: "no", label: "Start again from the beginning" },
              ]}
              value={resume}
              onChange={setResume}
            />
            <table className="demo-table">
              <caption>
                {resume === "yes" ? "Carrying on" : "Starting again"} with {n(Number(piece))} MB pieces
              </caption>
              <tbody>
                <tr>
                  <th scope="row">Pieces in the file</th>
                  <td>{n(tried.pieces)}</td>
                </tr>
                <tr>
                  <th scope="row">Data sent in all</th>
                  <td>{n(tried.sentMB)} MB</td>
                </tr>
                <tr>
                  <th scope="row">Time taken</th>
                  <td>{mins(tried.seconds)}</td>
                </tr>
              </tbody>
            </table>
            <p aria-live="polite">
              Very small pieces lose almost nothing when the connection drops, but each one has a cost, so there is a lot of overhead. Very
              large pieces have little overhead but lose more. A middle size is usually quickest.
            </p>
            <button type="button" className="btn small" onClick={(e) => restart(e, reset)}>
              Try the question again
            </button>
          </Result>
        )}
      </div>
    </DemoFrame>
  );
}
