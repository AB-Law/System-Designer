import { useEffect, useRef } from "react";

const base = `${import.meta.env.BASE_URL}landing/`;

/**
 * Three archival pictures of the same problems the simulator teaches, from before computers: one operator sending every call to a free
 * line, ballots sorted into numbered bins, a catalogue that finds the card instead of reading the library. They are pictures of the
 * world around the product, not of the product, and every one is credited in the footer.
 */
export function LandingPictures() {
  const video = useRef<HTMLVideoElement>(null);

  // A silent loop is decoration: under reduced motion it stops and the poster frame stays.
  useEffect(() => {
    const v = video.current;
    if (v && window.matchMedia("(prefers-reduced-motion: reduce)").matches) v.pause();
  }, []);

  return (
    <section className="lp-pictures" aria-labelledby="pictures-h">
      <h2 id="pictures-h" data-rv>
        These problems are older than computers.
      </h2>
      <div className="pics">
        <figure className="pic pic-main" data-rv>
          <div className="pic-frame">
            <img
              src={`${base}switchboard-1930-jpg.jpg`}
              width={1600}
              height={932}
              alt="A telephone operator at a large switchboard with dials and rows of plugs, Milwaukee, 1930"
              loading="lazy"
            />
          </div>
          <figcaption>
            <b>Load balancing, 1930.</b> One operator watched every line and sent each call to one that was free.
          </figcaption>
        </figure>
        <figure className="pic pic-video" data-rv style={{ "--d": "80ms" } as React.CSSProperties}>
          <div className="pic-frame">
            <video
              ref={video}
              src={`${base}mail-sorting-webm.webm`}
              poster={`${base}mail-sorting-webm-poster.jpg`}
              muted
              loop
              autoPlay
              playsInline
              preload="metadata"
              aria-label="A machine sorting envelopes into numbered bins"
            />
          </div>
          <figcaption>
            <b>Sharding, 2018.</b> Envelopes sorted into numbered bins, so no one bin takes everything.
          </figcaption>
        </figure>
        <figure className="pic pic-index" data-rv style={{ "--d": "160ms" } as React.CSSProperties}>
          <div className="pic-frame">
            <img
              src={`${base}card-catalog-jpg.jpg`}
              width={1400}
              height={1050}
              alt="A drawer of library catalogue cards with a divider card reading ask the librarian"
              loading="lazy"
            />
          </div>
          <figcaption>
            <b>Indexing.</b> Look up the card, not the whole library.
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
