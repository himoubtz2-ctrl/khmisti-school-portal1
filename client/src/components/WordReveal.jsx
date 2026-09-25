import { Fragment, useEffect, useRef, useState } from 'react';

/**
 * Word-by-word reveal with a clip mask: every word slides up from below into
 * its own overflow-hidden box, staggered in reading order — left-to-right in
 * French/English, right-to-left in Arabic, because the stagger follows DOM
 * order, which is visual order in both.
 *
 * Hovering the block lifts every word in a travelling wave; the word under the
 * pointer lifts higher and takes the accent colour. Both effects are pure CSS,
 * so pointer movement never triggers a React render.
 *
 * Long words, emails, URLs and single-token strings are all fine: the mask is
 * capped to the column width and the word itself may break internally, so
 * nothing overflows no matter how long the school name is.
 */
export default function WordReveal({
  text,
  as: Tag = 'h2',
  className = '',
  delay = 0,
  stagger = 62,
  interactive = true,
}) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      !('IntersectionObserver' in window)
    ) {
      setShown(true);
      return undefined;
    }
    // Already on screen (or already scrolled past) at mount time: show it right
    // away instead of waiting for an intersection that may never come.
    const box = el.getBoundingClientRect();
    if (box.bottom <= 0 || box.top < window.innerHeight * 0.92) {
      setShown(true);
      return undefined;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -60px 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  /* normalise: collapse any newline/tab runs into plain spaces so a heading
     pasted from a CMS can never produce an empty line inside the clip box */
  const parts = String(text ?? '').replace(/\s+/g, ' ').trim().split(' ');

  return (
    <Tag
      ref={ref}
      className={`word-reveal${interactive ? ' word-reveal--live' : ''}${className ? ` ${className}` : ''}`}
      data-shown={shown ? 'true' : 'false'}
    >
      {parts.map((word, i) =>
        i === 0 ? (
          <span className="word-reveal__mask" key={i} style={{ '--wr-delay': `${delay}ms` }}>
            <span className="word-reveal__word">{word}</span>
          </span>
        ) : (
          /* the real space stays in the accessibility tree, so a screen reader
             still says "Mohamed Khemisti" and not "MohamedKhemisti" */
          <Fragment key={i}>
            <span className="word-reveal__gap"> </span>
            <span className="word-reveal__mask" style={{ '--wr-delay': `${delay + i * stagger}ms` }}>
              <span className="word-reveal__word">{word}</span>
            </span>
          </Fragment>
        )
      )}
    </Tag>
  );
}
