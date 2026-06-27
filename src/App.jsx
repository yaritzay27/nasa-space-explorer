import React, { useCallback, useEffect, useRef, useState } from "react";

const NASA_APOD_URL = "https://api.nasa.gov/planetary/apod";
const API_KEY = import.meta.env.VITE_NASA_API_KEY || "DEMO_KEY";
const RESULTS_PER_REQUEST = 12;
const MAX_REQUESTS = 2;

const SUBJECT_RULES = [
  {
    value: "Black Hole",
    pattern: /\b(black hole|event horizon|accretion disk|quasar)\b/i,
  },
  {
    value: "Nebula",
    pattern: /\b(nebula|nebulae|supernova remnant)\b/i,
  },
  {
    value: "Galaxy",
    pattern: /\b(galaxy|galaxies|milky way|andromeda|magellanic)\b/i,
  },
  { value: "Comet", pattern: /\b(comet|cometary)\b/i },
  {
    value: "Asteroid / Meteor",
    pattern: /\b(asteroid|meteor|meteorite|meteoroid|fireball)\b/i,
  },
  { value: "Aurora", pattern: /\b(aurora|aurorae|auroral)\b/i },
  { value: "Eclipse", pattern: /\b(eclipse|eclipsed)\b/i },
  {
    value: "Spacecraft",
    pattern:
      /\b(spacecraft|rocket|rover|shuttle|space station|ISS|satellite|lander|ingenuity|perseverance|curiosity|voyager|cassini)\b/i,
  },
  {
    value: "Planet",
    pattern:
      /\b(planet|exoplanet|mercury|venus|mars|jupiter|saturn|uranus|neptune)\b/i,
  },
  {
    value: "Moon",
    pattern:
      /\b(moon|lunar|europa|ganymede|callisto|io|titan|enceladus|triton)\b/i,
  },
  {
    value: "Sun",
    pattern: /\b(sun|solar|sunspot|corona|prominence)\b/i,
  },
  {
    value: "Star / Star Cluster",
    pattern:
      /\b(star|stars|stellar|constellation|cluster|pulsar|nova|supernova)\b/i,
  },
  {
    value: "Earth",
    pattern: /\b(earth|terrestrial|earthrise|city lights)\b/i,
  },
];

const SparkIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 2.5c.45 5.45 3.05 8.05 8.5 8.5-5.45.45-8.05 3.05-8.5 8.5-.45-5.45-3.05-8.05-8.5-8.5 5.45-.45 8.05-3.05 8.5-8.5Z" />
  </svg>
);

const ArrowIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 12h14M14 7l5 5-5 5" />
  </svg>
);

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="m7 7 10 10M17 7 7 17" />
  </svg>
);

function cleanCredit(copyright) {
  return copyright
    ? copyright.replace(/\s+/g, " ").trim()
    : "NASA / Public domain";
}

function yearFromDate(date) {
  return date?.slice(0, 4) || "Unknown";
}

function displayDate(date) {
  if (!date) return "Unknown";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00`));
}

function attributeKey(attribute) {
  return `${attribute.type}:${attribute.value}`;
}

function getSubject(item) {
  const title = item.title || "";
  const explanation = item.explanation || "";

  const titleMatch = SUBJECT_RULES.find((subject) =>
    subject.pattern.test(title),
  );
  if (titleMatch) return titleMatch.value;

  const explanationMatch = SUBJECT_RULES.find((subject) =>
    subject.pattern.test(explanation),
  );
  return explanationMatch?.value || "Cosmic Scene";
}

function getFilterableAttributes(item) {
  return [
    { type: "Year", value: yearFromDate(item.date) },
    { type: "Subject", value: getSubject(item) },
    { type: "Credit", value: cleanCredit(item.copyright) },
  ];
}

function getAllAttributes(item) {
  return [
    ...getFilterableAttributes(item),
    { type: "Published", value: displayDate(item.date), filterable: false },
  ];
}

function App() {
  const [apod, setApod] = useState(null);
  const [banList, setBanList] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [imageLoading, setImageLoading] = useState(true);
  const [error, setError] = useState("");
  const [discoveryCount, setDiscoveryCount] = useState(0);
  const [history, setHistory] = useState([]);

  const banListRef = useRef([]);
  const recentDatesRef = useRef([]);
  const activeRequestRef = useRef(0);

  const isItemBanned = useCallback((item) => {
    const itemAttributes = getFilterableAttributes(item).map(attributeKey);
    const bannedKeys = new Set(banListRef.current.map(attributeKey));
    return itemAttributes.some((key) => bannedKeys.has(key));
  }, []);

  const discover = useCallback(async () => {
    const requestId = activeRequestRef.current + 1;
    activeRequestRef.current = requestId;
    setIsLoading(true);
    setError("");

    try {
      let nextItem = null;

      for (let attempt = 0; attempt < MAX_REQUESTS && !nextItem; attempt += 1) {
        const url = new URL(NASA_APOD_URL);
        url.searchParams.set("api_key", API_KEY);
        url.searchParams.set("count", RESULTS_PER_REQUEST);
        url.searchParams.set("thumbs", "true");

        const response = await fetch(url);
        const responseText = await response.text();
        let data;

        try {
          data = JSON.parse(responseText);
        } catch {
          if (attempt < MAX_REQUESTS - 1) continue;

          throw new Error(
            "NASA is temporarily unavailable. Please try discovering again.",
          );
        }

        if (!response.ok) {
          if (response.status === 429) {
            throw new Error(
              "NASA's demo rate limit was reached. Add your free API key to the .env file, then restart the app.",
            );
          }

          if (response.status >= 500 && attempt < MAX_REQUESTS - 1) {
            continue;
          }

          throw new Error(
            data?.error?.message || "NASA could not complete this request.",
          );
        }

        const results = Array.isArray(data) ? data : [data];
        nextItem = results.find(
          (item) =>
            item.media_type === "image" &&
            item.url &&
            !isItemBanned(item) &&
            !recentDatesRef.current.includes(item.date),
        );
      }

      if (requestId !== activeRequestRef.current) return;

      if (!nextItem) {
        throw new Error(
          "No new image matched your current filters. Try removing a ban.",
        );
      }

      recentDatesRef.current = [
        nextItem.date,
        ...recentDatesRef.current,
      ].slice(0, 30);
      setImageLoading(true);
      setApod(nextItem);
      setDiscoveryCount((count) => count + 1);
      setHistory((currentHistory) => [
        nextItem,
        ...currentHistory.filter((item) => item.date !== nextItem.date),
      ]);
    } catch (requestError) {
      if (requestId === activeRequestRef.current) {
        setError(
          requestError.message ||
            "Something drifted off course. Please try again.",
        );
      }
    } finally {
      if (requestId === activeRequestRef.current) {
        setIsLoading(false);
      }
    }
  }, [isItemBanned]);

  useEffect(() => {
    discover();
  }, [discover]);

  function addBan(attribute) {
    const key = attributeKey(attribute);
    if (banListRef.current.some((item) => attributeKey(item) === key)) return;

    const nextBanList = [...banListRef.current, attribute];
    banListRef.current = nextBanList;
    setBanList(nextBanList);
  }

  function removeBan(attribute) {
    const key = attributeKey(attribute);
    const nextBanList = banListRef.current.filter(
      (item) => attributeKey(item) !== key,
    );
    banListRef.current = nextBanList;
    setBanList(nextBanList);
  }

  return (
    <main className="app-shell">
      <div className="star-field" aria-hidden="true" />

      <header className="site-header">
        <a className="brand" href="/" aria-label="Orbit home">
          <span className="brand-mark">
            <span />
          </span>
          <span>ORBIT</span>
        </a>
        <div className="api-status">
          <span />
          NASA API &nbsp;LIVE
        </div>
      </header>

      <section className="intro">
        <div className="eyebrow">
          <SparkIcon />
          COSMIC DISCOVERY ENGINE
        </div>
        <h1>
          Wander beyond
          <br />
          the <em>known.</em>
        </h1>
        <p>
          A random journey through NASA&apos;s Astronomy Picture of the
          Day archive. Shape your orbit by banning what you&apos;ve seen
          enough of.
        </p>
      </section>

      <section className="experience">
        <div className="discovery-column">
          <div className="section-label">
            <span>CURRENT DISCOVERY</span>
            <span>{String(discoveryCount).padStart(3, "0")}</span>
          </div>

          <article
            className={`discovery-card ${isLoading ? "is-loading" : ""}`}
            aria-busy={isLoading}
            aria-live="polite"
          >
            {isLoading && !apod ? (
              <div className="loading-state">
                <span className="orbit-loader">
                  <span />
                </span>
                <p>Scanning the archive...</p>
              </div>
            ) : apod ? (
              <>
                <div className="image-frame">
                  {imageLoading && <div className="image-shimmer" />}
                  <img
                    key={apod.date}
                    src={apod.url}
                    alt={apod.title}
                    onLoad={() => setImageLoading(false)}
                    onError={() => {
                      setImageLoading(false);
                      setError("This NASA image could not be displayed.");
                    }}
                  />
                  <span className="image-index">APOD / {apod.date}</span>
                  <span className="image-corner image-corner-top" />
                  <span className="image-corner image-corner-bottom" />
                </div>

                <div className="card-content">
                  <div className="title-row">
                    <div>
                      <span className="record-type">ASTRONOMY PICTURE</span>
                      <h2>{apod.title}</h2>
                    </div>
                    <span className="archive-year">
                      {yearFromDate(apod.date)}
                    </span>
                  </div>

                  <p className="explanation">{apod.explanation}</p>

                  <div className="attribute-grid">
                    {getAllAttributes(apod).map((attribute) => {
                      const isFilterable = attribute.filterable !== false;
                      return isFilterable ? (
                        <button
                          className="attribute"
                          key={attribute.type}
                          type="button"
                          onClick={() => addBan(attribute)}
                          title={`Ban ${attribute.type}: ${attribute.value}`}
                        >
                          <span className="attribute-label">
                            {attribute.type}
                          </span>
                          <span className="attribute-value">
                            {attribute.value}
                          </span>
                          <span className="attribute-action">
                            <PlusIcon />
                          </span>
                        </button>
                      ) : (
                        <div className="attribute" key={attribute.type}>
                          <span className="attribute-label">
                            {attribute.type}
                          </span>
                          <span className="attribute-value">
                            {attribute.value}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : null}
          </article>

          {error && (
            <div className="error-banner" role="alert">
              <span>!</span>
              {error}
            </div>
          )}

          <button
            className="discover-button"
            type="button"
            onClick={discover}
            disabled={isLoading}
          >
            <span>{isLoading ? "SEARCHING THE COSMOS" : "DISCOVER ANOTHER"}</span>
            <ArrowIcon />
          </button>
          <p className="button-note">
            Each discovery is selected at random from NASA&apos;s archive.
          </p>
        </div>

        <aside className="ban-panel">
          <div className="section-label">
            <span>YOUR BAN LIST</span>
            <span>{String(banList.length).padStart(2, "0")}</span>
          </div>

          <div className="ban-panel-inner">
            <div className="ban-heading">
              <div className="ban-icon">
                <span />
              </div>
              <div>
                <h2>Shape your orbit</h2>
                <p>
                  Click a year, subject, or credit on a discovery to keep
                  it out of future results.
                </p>
              </div>
            </div>

            <div className="ban-list" aria-live="polite">
              {banList.length ? (
                banList.map((attribute) => (
                  <button
                    className="ban-chip"
                    key={attributeKey(attribute)}
                    type="button"
                    onClick={() => removeBan(attribute)}
                    title={`Remove ${attribute.value} from the ban list`}
                  >
                    <span>
                      <small>{attribute.type}</small>
                      {attribute.value}
                    </span>
                    <CloseIcon />
                  </button>
                ))
              ) : (
                <div className="empty-ban-list">
                  <span className="empty-orbit">
                    <span />
                  </span>
                  <p>No filters in orbit</p>
                  <small>Your discoveries are wide open.</small>
                </div>
              )}
            </div>

            {banList.length > 0 && (
              <button
                className="clear-button"
                type="button"
                onClick={() => {
                  banListRef.current = [];
                  setBanList([]);
                }}
              >
                Clear all filters
              </button>
            )}

            <div className="mission-note">
              <span>MISSION NOTE</span>
              <p>
                Banned values are checked before a result reaches your
                screen. Remove a filter anytime to reopen that path.
              </p>
            </div>
          </div>
        </aside>
      </section>

      <section className="history-section" aria-labelledby="history-title">
        <div className="section-label">
          <span>VIEWED THIS SESSION</span>
          <span>{String(history.length).padStart(2, "0")}</span>
        </div>

        <div className="history-heading">
          <div>
            <span className="history-kicker">MISSION ARCHIVE</span>
            <h2 id="history-title">Your mission log</h2>
          </div>
          <p>
            Every discovery from this session is saved here, with the
            newest arrival first.
          </p>
        </div>

        {history.length ? (
          <div className="history-grid">
            {history.map((item, index) => (
              <article className="history-card" key={item.date}>
                <div className="history-image">
                  <img src={item.url} alt={item.title} loading="lazy" />
                  <span>
                    {String(history.length - index).padStart(3, "0")}
                  </span>
                </div>
                <div className="history-card-content">
                  <span className="history-subject">{getSubject(item)}</span>
                  <h3>{item.title}</h3>
                  <div className="history-meta">
                    <span>{yearFromDate(item.date)}</span>
                    <span>{displayDate(item.date)}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="history-empty">
            Your discoveries will appear here after the first signal
            arrives.
          </div>
        )}
      </section>

      <footer>
        <span>POWERED BY NASA&apos;S OPEN APOD API</span>
        <span>IMAGES &amp; DATA COURTESY OF NASA</span>
      </footer>
    </main>
  );
}

export default App;
